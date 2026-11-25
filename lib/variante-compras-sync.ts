import type { SupabaseClient } from "@supabase/supabase-js";
import { getPedidosProduto } from "@/lib/linx";
import { numeroPedidoNorm, TIPOS_SEM_PRE_PRODUCAO } from "@/lib/preproducao";

// Linx -> Compra x Variante (produto_variante_compras): quantidade, número do
// pedido e data de entrega de cada cor, nos campos Pedido 1 / Pedido 2.
//  • Pedido em aberto no Linx: entra no slot que já tem o mesmo número; senão
//    no primeiro slot sem pedido (ordem da data de entrega). Qtd = TOTAL do
//    pedido naquela cor (mesmo com entrega parcial).
//  • Pedido entregue (saiu do Linx — pedidos_producao.entregue_em): qtd 0,
//    pedido e data em branco.
//  • Pedido digitado à mão que o Linx não conhece: fica como está.
// Só servidor (service role). Rodar depois de sincronizarPedidosProducao, que
// é quem marca a entrega dos pedidos que saíram do Linx.

type Slot = { qtd: number | null; pedido: string; data: string };
type PedLinx = { numero: string; qtd: number; data: string };

// "C20 - AREIA" / "C20" / "c020" -> "C20". Código da cor, sem zeros à esquerda.
export const codCor = (c: any) => String(c ?? "").trim().split(/[\s-]/)[0].toUpperCase().replace(/^([A-Z]*)0+(?=\d)/, "$1");

async function tudo(q: (de: number, ate: number) => any): Promise<any[]> {
  const out: any[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await q(de, de + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) return out;
  }
}

export type ResultadoVarianteCompras = {
  variantesAtualizadas: number;
  pedidosLinx: number;
  zeradasEntregues: number;
  semVariante: string[];   // "REF COR" do Linx sem cor cadastrada na ficha
  semEspaco: string[];     // cor com mais de 2 pedidos em aberto
  exemplos?: { ref: string; cor: string; antes: Slot[]; depois: Slot[] }[]; // só na simulação
};

export async function sincronizarVarianteCompras(db: SupabaseClient, { gravar = true } = {}): Promise<ResultadoVarianteCompras> {
  const linhas = await getPedidosProduto();
  // Linx vazio = falha ou fora do ar: não zera nada.
  if (!linhas.length) throw new Error("Linx não devolveu nenhum pedido pendente.");

  // Pedidos em aberto por ref -> cor -> número.
  const abertos: Record<string, Record<string, Record<string, PedLinx>>> = {};
  let nPed = 0;
  for (const p of linhas) {
    const ref = String(p.produto_pai || "").trim();
    const numero = numeroPedidoNorm(p.numero_pedido);
    const tipo = String(p.tipo_compra || "").trim().toUpperCase();
    const cor = codCor(p.cor);
    if (!ref || !numero || !cor || TIPOS_SEM_PRE_PRODUCAO.includes(tipo)) continue;
    const data = String(p.data_programada || "").slice(0, 10);
    const porCor = ((abertos[ref] ||= {})[cor] ||= {});
    const x = (porCor[numero] ||= (nPed++, { numero, qtd: 0, data }));
    x.qtd += Number(p.quantidade) || 0;
    if (data && (!x.data || data < x.data)) x.data = data;
  }

  const [prods, tecidos, compras, producao] = await Promise.all([
    tudo((de, ate) => db.from("produtos").select("id, ref").order("id").range(de, ate)),
    tudo((de, ate) => db.from("ficha_tecidos").select("id, ficha_id, cores, fichas_tecnicas!inner(produto_ref)").order("id").range(de, ate)),
    tudo((de, ate) => db.from("produto_variante_compras").select("*").order("produto_id").range(de, ate)),
    tudo((de, ate) => db.from("pedidos_producao").select("ref, numero, entregue_em").order("ref").range(de, ate)).catch(() => [] as any[]),
  ]);

  const entregues = new Set(producao.filter((r: any) => r.entregue_em).map((r: any) => `${r.ref}|${numeroPedidoNorm(r.numero)}`));
  const aindaAberto = (ref: string, numero: string) => Object.values(abertos[ref] || {}).some(c => !!c[numero]);

  // Cores de cada ref = cores do tecido principal (Tec.01) de cada ficha.
  const coresRef: Record<string, string[]> = {};
  const vistas = new Set<number>();
  for (const t of tecidos) {
    if (vistas.has(t.ficha_id)) continue;
    vistas.add(t.ficha_id);
    const ref = t.fichas_tecnicas?.produto_ref;
    if (!ref) continue;
    for (const c of t.cores || []) if (c && !(coresRef[ref] ||= []).includes(c)) coresRef[ref].push(c);
  }
  const compraDe: Record<string, any> = {};
  for (const r of compras) compraDe[`${r.produto_id}:${r.cor}`] = r;

  const res: ResultadoVarianteCompras = { variantesAtualizadas: 0, pedidosLinx: nPed, zeradasEntregues: 0, semVariante: [], semEspaco: [] };
  const gravacoes: any[] = [];

  for (const prod of prods) {
    const ref = String(prod.ref || "").trim();
    const abertosRef = abertos[ref] || {};
    const cores = [...(coresRef[ref] || [])];
    for (const r of compras) if (r.produto_id === prod.id && !cores.includes(r.cor)) cores.push(r.cor);
    if (!cores.length && !Object.keys(abertosRef).length) continue;

    const usadas = new Set<string>();
    for (const cor of cores) {
      const cod = codCor(cor);
      const atual = compraDe[`${prod.id}:${cor}`];
      const peds = Object.values(abertosRef[cod] || {}).sort((a, b) => (a.data || "9").localeCompare(b.data || "9"));
      if (!atual && !peds.length) continue;
      if (peds.length) usadas.add(cod);

      const slots: Slot[] = [1, 2].map(n => ({
        qtd: atual?.[`qtd_compra${n}`] ?? null,
        pedido: String(atual?.[`pedido${n}`] ?? "").trim(),
        data: String(atual?.[`data_entrega${n}`] ?? "").slice(0, 10),
      }));
      const antes = JSON.stringify(slots);

      // Entregue: qtd 0, pedido e data em branco.
      for (const s of slots) {
        const num = numeroPedidoNorm(s.pedido);
        if (num && entregues.has(`${ref}|${num}`) && !aindaAberto(ref, num)) {
          s.qtd = 0; s.pedido = ""; s.data = "";
          res.zeradasEntregues++;
        }
      }
      // Em aberto: atualiza o slot do mesmo número, senão ocupa um sem pedido.
      for (const p of peds) {
        let s = slots.find(x => numeroPedidoNorm(x.pedido) === p.numero);
        if (!s) s = slots.find(x => !x.pedido);
        if (!s) { res.semEspaco.push(`${ref} ${cor} (pedido ${p.numero})`); continue; }
        s.qtd = p.qtd; s.pedido = p.numero; s.data = p.data;
      }

      if (JSON.stringify(slots) === antes) continue;
      res.variantesAtualizadas++;
      if (!gravar && (res.exemplos ||= []).length < 12) res.exemplos.push({ ref, cor, antes: JSON.parse(antes), depois: slots.map(s => ({ ...s })) });
      gravacoes.push({
        produto_id: prod.id, cor,
        qtd_compra1: slots[0].qtd, pedido1: slots[0].pedido || null, data_entrega1: slots[0].data || null,
        qtd_compra2: slots[1].qtd, pedido2: slots[1].pedido || null, data_entrega2: slots[1].data || null,
      });
    }
    for (const cod of Object.keys(abertosRef)) if (!usadas.has(cod)) res.semVariante.push(`${ref} ${cod}`);
  }

  if (gravar) {
    for (let i = 0; i < gravacoes.length; i += 500) {
      const { error } = await db.from("produto_variante_compras").upsert(gravacoes.slice(i, i + 500), { onConflict: "produto_id,cor" });
      if (error) throw error;
    }
  }
  return res;
}
