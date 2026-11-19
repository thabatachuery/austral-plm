// Avisos de pré-produção por e-mail (rotina diária do cron).
//  - "cobrar":  produção entrega em 6 a 15 dias e a pré ainda não chegou.
//  - "urgente": produção entrega em 0 a 5 dias e a pré ainda não chegou.
// Cada pedido entra uma vez por aviso (tabela avisos_pre_email); se a data
// de entrega for remarcada, conta como aviso novo. Só servidor.
import type { SupabaseClient } from "@supabase/supabase-js";
import { STATUS_ESTILO, STATUS_PP_LIBERADA_ANTES } from "./constants";
import { juntarPedidos, mesclarFontes, pedidosDaLista, type PedidoListaPP } from "./preproducao";
import { linhaParaPedido } from "./pedidos-producao-sync";
import { enviarEmail, emailConfigurado, listaEmails } from "./email";

export type TipoAviso = "cobrar" | "urgente";
export const DIAS_AVISO: Record<TipoAviso, [number, number]> = { cobrar: [6, 15], urgente: [0, 5] };

export type ItemAviso = { ref: string; numero: string; entrega: string; fornecedor: string };

const ASSUNTO: Record<TipoAviso, string> = {
  cobrar: "ATENÇÃO: COBRAR PRÉ PRODUÇÃO",
  urgente: "URGENTE: PRÉ PRODUÇÃO ATRASADA",
};

const ABERTURA: Record<TipoAviso, string> = {
  cobrar: "Temos entregas programadas para daqui 15 dias, favor verificar sobre as entregas de pré produção dos seguintes:",
  urgente: "Temos entregas programadas para daqui 5 dias, e a pré produção ainda não foi entregue - isso pode acarretar atrasos na entrega.\nFavor verificar sobre as entregas de pré produção dos seguintes:",
};

export const hojeSP = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

const diasEntre = (de: string, ate: string) =>
  Math.round((Date.parse(ate.slice(0, 10) + "T12:00:00Z") - Date.parse(de.slice(0, 10) + "T12:00:00Z")) / 86400000);

const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

// Linhas agrupadas por fornecedor, ex.:
//   HABIB:
//   21060301 - PEDIDO 5864 - ENTREGA SOLICITADA PARA 11/12/2026
function blocosPorFornecedor(itens: ItemAviso[]): string {
  const porForn: Record<string, ItemAviso[]> = {};
  itens.forEach(i => { (porForn[i.fornecedor] ||= []).push(i); });
  return Object.keys(porForn).sort((a, b) => a.localeCompare(b, "pt-BR")).map(f =>
    `${f}:\n` + porForn[f]
      .sort((a, b) => a.entrega.localeCompare(b.entrega) || a.ref.localeCompare(b.ref))
      .map(i => `${i.ref} - ${i.numero ? `PEDIDO ${i.numero}` : "SEM Nº DE PEDIDO"} - ENTREGA SOLICITADA PARA ${i.entrega ? dataBR(i.entrega) : "SEM DATA"}`)
      .join("\n")).join("\n\n");
}

export function textoAviso(tipo: TipoAviso, itens: ItemAviso[]): { assunto: string; texto: string } {
  return { assunto: ASSUNTO[tipo], texto: `Bom dia, tudo bem?\n\n${ABERTURA[tipo]}\n\n${blocosPorFornecedor(itens)}\n\nObrigada!` };
}

export function textoPreRecebida(itens: ItemAviso[]): { assunto: string; texto: string } {
  return {
    assunto: "PRÉ PRODUÇÃO RECEBIDA",
    texto: `Bom dia, tudo bem?\n\nRecebemos a seguinte pré produção:\n\n${blocosPorFornecedor(itens)}\n\nAguardamos o laudo.\nObrigada!`,
  };
}

// Lê tudo em páginas de 1000 (limite do Supabase).
async function tudo(q: (de: number, ate: number) => any): Promise<any[]> {
  const out: any[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await q(de, de + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) return out;
  }
}

// Pedidos com a pré por chegar e a entrega da produção dentro da janela de cada aviso.
export async function pedidosParaAvisar(db: SupabaseClient, hoje = hojeSP()): Promise<Record<TipoAviso, ItemAviso[]>> {
  const [prods, fluxo, linx, lista, laudos, fichas] = await Promise.all([
    tudo((de, ate) => db.from("produtos").select("id, ref, fornecedor").eq("status", STATUS_ESTILO.PRODUCAO_LIBERADA).order("id").range(de, ate)),
    tudo((de, ate) => db.from("controle_fluxo").select("produto_ref, status_pre_producao").order("produto_ref").range(de, ate)),
    tudo((de, ate) => db.from("pedidos_producao").select("*").order("ref").range(de, ate)),
    tudo((de, ate) => db.from("produto_variante_compras").select("*").order("produto_id").range(de, ate)),
    tudo((de, ate) => db.from("ficha_laudo_pp_pedidos").select("id, ficha_id, numero_pedido, status, data_entrega_producao, data_entrega_pre, data_laudo").order("id").range(de, ate)),
    tudo((de, ate) => db.from("fichas_tecnicas").select("id, produto_ref").order("id").range(de, ate)),
  ]);

  const antes = new Set(fluxo.filter((f: any) => f.status_pre_producao === STATUS_PP_LIBERADA_ANTES).map((f: any) => f.produto_ref));
  const linxRef: Record<string, PedidoListaPP[]> = {};
  linx.forEach((r: any) => { (linxRef[r.ref] ||= []).push(linhaParaPedido(r)); });
  const listaProd: Record<number, any[]> = {};
  lista.forEach((r: any) => { (listaProd[r.produto_id] ||= []).push(r); });
  const refDaFicha: Record<number, string> = {};
  fichas.forEach((f: any) => { refDaFicha[f.id] = f.produto_ref; });
  const laudosRef: Record<string, any[]> = {};
  laudos.forEach((l: any) => { const ref = refDaFicha[l.ficha_id]; if (ref) (laudosRef[ref] ||= []).push(l); });

  const out: Record<TipoAviso, ItemAviso[]> = { cobrar: [], urgente: [] };
  for (const p of prods) {
    const peds = juntarPedidos(mesclarFontes(linxRef[p.ref] || [], pedidosDaLista(listaProd[p.id] || [])), laudosRef[p.ref] || [], hoje);
    // Liberada antes do PLM e sem laudo: a pré já foi aprovada fora do PLM.
    if (antes.has(p.ref) && !peds.some(x => x.laudoId)) continue;
    for (const x of peds) {
      if (x.situacao !== "pendente" || !x.entregaProducao) continue;
      const dias = diasEntre(hoje, x.entregaProducao);
      const tipo = (Object.keys(DIAS_AVISO) as TipoAviso[]).find(t => dias >= DIAS_AVISO[t][0] && dias <= DIAS_AVISO[t][1]);
      if (!tipo) continue;
      out[tipo].push({ ref: p.ref, numero: x.numero, entrega: x.entregaProducao, fornecedor: (x.fornecedor || p.fornecedor || "SEM FORNECEDOR").trim().toUpperCase() });
    }
  }
  return out;
}

const chave = (tipo: TipoAviso, i: ItemAviso) => `${tipo}|${i.ref}|${i.numero}|${i.entrega}`;

export type ResultadoAvisos = Record<TipoAviso, { enviados: number; erro?: string }>;

// Envia os avisos do dia (só os pedidos ainda não avisados) e grava o envio.
export async function dispararAvisosPre(db: SupabaseClient): Promise<ResultadoAvisos> {
  const para = listaEmails(process.env.EMAIL_PRE_PARA);
  const falta = emailConfigurado() || (!para.length ? "Falta a variável EMAIL_PRE_PARA." : null);
  const res: ResultadoAvisos = { cobrar: { enviados: 0 }, urgente: { enviados: 0 } };
  if (falta) { res.cobrar.erro = res.urgente.erro = falta; return res; }

  const { data: ja, error } = await db.from("avisos_pre_email").select("tipo, ref, numero, data_entrega");
  if (error) { res.cobrar.erro = res.urgente.erro = `Rode a migration 041 (${error.message}).`; return res; }
  const enviados = new Set((ja || []).map((a: any) => `${a.tipo}|${a.ref}|${a.numero}|${String(a.data_entrega).slice(0, 10)}`));

  const pedidos = await pedidosParaAvisar(db);
  for (const tipo of Object.keys(pedidos) as TipoAviso[]) {
    const novos = pedidos[tipo].filter(i => !enviados.has(chave(tipo, i)));
    if (!novos.length) continue;
    const { assunto, texto } = textoAviso(tipo, novos);
    try {
      await enviarEmail(para, assunto, texto);
      await db.from("avisos_pre_email").upsert(
        novos.map(i => ({ tipo, ref: i.ref, numero: i.numero, data_entrega: i.entrega })),
        { onConflict: "tipo,ref,numero,data_entrega" },
      );
      res[tipo].enviados = novos.length;
    } catch (e: any) {
      res[tipo].erro = e?.message || String(e);
    }
  }
  return res;
}
