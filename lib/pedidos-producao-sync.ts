import type { SupabaseClient } from "@supabase/supabase-js";
import { getPedidosProduto, getCores } from "@/lib/linx";
import { numeroPedidoNorm, TIPOS_SEM_PRE_PRODUCAO, type PedidoListaPP } from "@/lib/preproducao";

// Pedidos de produção do Linx -> tabela pedidos_producao (migration 040).
// A API do Linx só lista pedidos pendentes; o que some da lista foi entregue
// (ou cancelado) e ganha entregue_em = hoje. Só servidor (service role).

const hojeSP = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

type Linha = {
  ref: string; numero: string; data_programada: string | null; quantidade: number; quantidade_pendente: number;
  tipo: string; fornecedor: string; cores: string[]; situacao: string;
};

// Pedidos em aberto agora no Linx, agrupados por ref + número.
export async function pedidosLinxAgrupados(): Promise<Linha[]> {
  const [linhas, cores] = await Promise.all([getPedidosProduto(), getCores().catch(() => ({} as Record<string, string>))]);
  const m: Record<string, Linha> = {};
  for (const p of linhas) {
    const ref = String(p.produto_pai || "").trim();
    const numero = numeroPedidoNorm(p.numero_pedido);
    const tipo = String(p.tipo_compra || "").trim().toUpperCase();
    if (!ref || !numero || TIPOS_SEM_PRE_PRODUCAO.includes(tipo)) continue;
    const data = String(p.data_programada || "").slice(0, 10) || null;
    const l = (m[`${ref}|${numero}`] ||= { ref, numero, data_programada: data, quantidade: 0, quantidade_pendente: 0, tipo, fornecedor: String(p.fornecedor || "").trim(), cores: [], situacao: "EM ABERTO" });
    if (data && (!l.data_programada || data < l.data_programada)) l.data_programada = data;
    const cor = String(p.cor || "").trim();
    const corTxt = cor ? (cores[cor] ? `${cor} - ${cores[cor]}` : cor) : "";
    if (corTxt && !l.cores.includes(corTxt)) l.cores.push(corTxt);
    l.quantidade += Number(p.quantidade) || 0;
    l.quantidade_pendente += Number(p.quantidade_pendente) || 0;
    if (String(p.situacao || "").toUpperCase().includes("PARCIAL")) l.situacao = "PARCIAL";
  }
  return Object.values(m);
}

export async function sincronizarPedidosProducao(db: SupabaseClient): Promise<{ abertos: number; entregues: number }> {
  const atuais = await pedidosLinxAgrupados();
  // Linx vazio = falha ou fora do ar: não marca tudo como entregue.
  if (!atuais.length) throw new Error("Linx não devolveu nenhum pedido pendente.");

  const { data: existentes, error } = await db.from("pedidos_producao").select("ref, numero, entregue_em, entregue_manual");
  if (error) throw error;
  const ex = new Map((existentes || []).map((r: any) => [`${r.ref}|${r.numero}`, r]));
  const agora = new Date().toISOString();

  const upserts = atuais.map(l => {
    const e: any = ex.get(`${l.ref}|${l.numero}`);
    const base: any = { ...l, visto_em: agora };
    // Voltou a aparecer pendente: tira a entrega automática.
    if (!e?.entregue_manual) { base.entregue_em = null; base.entregue_manual = false; }
    return base;
  });
  for (let i = 0; i < upserts.length; i += 500) {
    const { error: e2 } = await db.from("pedidos_producao").upsert(upserts.slice(i, i + 500), { onConflict: "ref,numero" });
    if (e2) throw e2;
  }

  const abertos = new Set(atuais.map(l => `${l.ref}|${l.numero}`));
  const sumiram = (existentes || []).filter((r: any) => !abertos.has(`${r.ref}|${r.numero}`) && !r.entregue_em);
  const hoje = hojeSP();
  for (const r of sumiram as any[]) {
    await db.from("pedidos_producao").update({ entregue_em: hoje, situacao: "ENTREGUE", quantidade_pendente: 0 }).eq("ref", r.ref).eq("numero", r.numero);
  }
  return { abertos: atuais.length, entregues: sumiram.length };
}

export function linhaParaPedido(r: any): PedidoListaPP {
  return {
    numero: r.numero, data: String(r.data_programada || "").slice(0, 10), cores: r.cores || [],
    qtd: Number(r.quantidade) || 0, pendente: Number(r.quantidade_pendente) || 0,
    tipo: r.tipo || "", fornecedor: r.fornecedor || "", linx: true,
    situacaoLinx: r.entregue_em ? "ENTREGUE" : (r.situacao || "EM ABERTO"),
    entregueEm: String(r.entregue_em || "").slice(0, 10),
  };
}
