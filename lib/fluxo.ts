// Kanban de etapas (aba "Kanban de Fluxo"): cada ref é um card que anda por
// 19 etapas, de Desenvolvimento a Produção liberada.
//
// A etapa atual mora em controle_fluxo (etapa, ciclo, etapa_desde, fluxo_meta)
// e cada movimento vira uma linha em fluxo_eventos. Mover o card também
// preenche as datas que a tabela do Controle de Fluxo já tinha (entrega do
// piloto, prova, entrega do mostruário...), então kanban e tabela são o mesmo
// dado — ninguém precisa digitar data duas vezes.
//
// Este arquivo é isomórfico: as regras e a gravação recebem o cliente do
// Supabase por parâmetro, para rodar no navegador (lib/db.ts) e na rotina
// diária do servidor (app/api/cron/fluxo).

import type { SupabaseClient } from "@supabase/supabase-js";

export type Area = "E" | "C" | "EC";
export type Pergunta = "prevPiloto" | "prevMost" | "cores" | "preprod" | "aprovacao";
export type Etapa = { n: number; t: string; a: Area; auto?: string; ask?: Pergunta };

export const ETAPAS: Etapa[] = [
  { n: 1,  t: "Desenvolvimento", a: "E", auto: "Toda ref nova começa aqui" },
  { n: 2,  t: "Desenvolvimento enviado / aguardando piloto", a: "E", ask: "prevPiloto" },
  { n: 3,  t: "Piloto recebido", a: "E" },
  { n: 4,  t: "Piloto em prova", a: "E", auto: "Da ficha: quando a data de prova do piloto é preenchida" },
  { n: 5,  t: "Laudo most. enviado ao fornecedor", a: "E" },
  { n: 6,  t: "Ficha entregue p/ compras", a: "E" },
  { n: 7,  t: "Cadastro no Linx OK", a: "C", auto: "Do Linx: quando a ref aparece cadastrada" },
  { n: 8,  t: "Pedido emitido / aguardando mostruário", a: "C", ask: "prevMost" },
  { n: 9,  t: "Mostruário entregue", a: "E", ask: "cores" },
  { n: 10, t: "Prova de produção", a: "E", auto: "Da ficha: prova do tipo PRODUÇÃO com data" },
  { n: 11, t: "Produção aprovada", a: "E", auto: "Da ficha: status da prova de produção", ask: "aprovacao" },
  { n: 12, t: "Laudo de produção enviado ao fornecedor", a: "E" },
  { n: 13, t: "Ficha produção entregue p/ compras", a: "E" },
  { n: 14, t: "Cadastro Linx corrigido", a: "C" },
  { n: 15, t: "Compra definida", a: "C" },
  { n: 16, t: "Pedido emitido", a: "C", auto: "Do Linx: quando aparece um pedido novo da ref" },
  { n: 17, t: "Explosão de aviamentos", a: "C", auto: "Quando a ref entra numa explosão de produção exportada" },
  { n: 18, t: "Pré-produção", a: "C", ask: "preprod" },
  { n: 19, t: "Produção liberada", a: "EC" },
];
export const TOTAL_ETAPAS = ETAPAS.length;
export const etapaInfo = (n: number) => ETAPAS[Math.min(Math.max(n, 1), TOTAL_ETAPAS) - 1];
export const AREA_NOME: Record<Area, string> = { E: "Estilo", C: "Compras", EC: "Estilo / Compras" };

export type FluxoMeta = {
  prevPiloto?: string;          // previsão de entrega do piloto (etapa 2)
  prevMost?: string;            // previsão de entrega do mostruário (etapa 8)
  coresEntregues?: string[];    // cores do mostruário que chegaram (etapa 9)
  preEntrega?: string;          // entrega da pré-produção (etapa 18)
  pedidosVistos?: string[];     // pedidos do Linx que já existiam ao entrar em 15
};

export type FluxoEstado = { ref: string; etapa: number; ciclo: number; desde: string | null; meta: FluxoMeta };
export type FluxoEvento = { produto_ref: string; etapa: number; ciclo: number; data: string; por: string; auto: boolean; obs: string; created_at?: string };

// Permissão: cada área move os cards PARA as etapas dela; admin move tudo.
export type PermFluxo = { isAdmin: boolean; estilo: boolean; compras: boolean };
export function podeMoverPara(n: number, p: PermFluxo): boolean {
  if (p.isAdmin) return true;
  const a = etapaInfo(n).a;
  return (a.includes("E") && p.estilo) || (a.includes("C") && p.compras);
}

/* ── datas ── */
// Data de hoje em ISO local (o toISOString() vira o dia seguinte perto da meia-noite).
export function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const s2d = (s: string) => new Date(s + "T12:00:00Z");
export function addDias(iso: string, n: number): string {
  const d = s2d(iso); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
export const diasEntre = (a: string, b: string) => Math.round((s2d(b).getTime() - s2d(a).getTime()) / 86400000);
// Dias úteis inteiros (seg–sex) contados a partir do dia seguinte.
export function maisDiasUteis(iso: string, n: number): string {
  let d = iso;
  while (n > 0) { d = addDias(d, 1); const w = s2d(d).getUTCDay(); if (w !== 0 && w !== 6) n--; }
  return d;
}
export const fmtBR = (iso?: string | null) => iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—";

// Prazo da pré-produção: 3 a 5 dias úteis inteiros depois da entrega.
export function prazoPreProducao(entrega: string, hoje = hojeISO()) {
  const de = maisDiasUteis(entrega, 3), ate = maisDiasUteis(entrega, 5);
  const situacao: "ok" | "atencao" | "vencido" = hoje > ate ? "vencido" : hoje >= de ? "atencao" : "ok";
  return { de, ate, situacao };
}

/* ── espelho no Controle de Fluxo ──
   Datas que a tabela do Controle de Fluxo já tinha. Etapas sem coluna
   equivalente ficam só no histórico (fluxo_eventos). */
export function camposControleFluxo(etapa: number, ciclo: number, data: string, meta: FluxoMeta): Record<string, string | null> {
  switch (etapa) {
    case 1:  return { data_desenvolvimento: data };
    case 2:  return meta.prevPiloto ? { prev_entrega_piloto: meta.prevPiloto } : {};
    case 3:  return ciclo > 1 ? { data_entrega_repilotagem: data } : { data_entrega_piloto: data };
    case 4:  return ciclo > 1 ? {} : { data_prova_piloto: data };
    case 8:  return meta.prevMost ? { prev_entrega_mostruario: meta.prevMost } : {};
    case 9:  return { data_entrega_mostruario: data };
    case 10: return ciclo > 1 ? { data_prova_producao_2: data } : { data_prova_producao_1: data };
    case 18: return { data_entrega_pre_producao: meta.preEntrega || data };
    default: return {};
  }
}

/* ── regras automáticas ── */
export type ProvaFicha = { data: string; status: string; tipo: string };
export type Sugestao = { etapa: number; data: string; ciclo?: number; obs: string };

const norm = (s: string) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();
const ehProducao = (p: ProvaFicha) => norm(p.tipo) === "PRODUCAO";

// Provas preenchidas na ficha (provaInfo p1..p3) de todas as fichas da ref.
export function provasDaFicha(provaInfos: any[]): ProvaFicha[] {
  const out: ProvaFicha[] = [];
  for (const pi of provaInfos) {
    if (!pi || typeof pi !== "object") continue;
    for (const k of ["p1", "p2", "p3"]) {
      const v = pi[k];
      if (v?.data && /^\d{4}-\d{2}-\d{2}$/.test(v.data)) out.push({ data: v.data, status: v.status || "", tipo: v.tipo || "" });
    }
  }
  return out.sort((a, b) => a.data.localeCompare(b.data));
}

// Próximo passo que a ficha já justifica. Só olha provas com data a partir
// de quando o card entrou na etapa atual — uma prova antiga (de outro ciclo)
// não empurra o card de novo.
export function proximaPorFicha(e: FluxoEstado, provas: ProvaFicha[], hoje = hojeISO()): Sugestao | null {
  const desde = e.desde || "0000-00-00";
  if (e.etapa === 3) {
    const p = provas.find(x => !ehProducao(x) && x.data >= desde);
    if (p) return { etapa: 4, data: p.data, obs: "Data de prova do piloto preenchida na ficha" };
  }
  if (e.etapa === 9) {
    const p = provas.find(x => ehProducao(x) && x.data >= desde);
    if (p) return { etapa: 10, data: p.data, obs: "Prova de produção com data na ficha" };
  }
  if (e.etapa === 10) {
    const p = [...provas].reverse().find(x => ehProducao(x) && x.data >= desde && x.status);
    if (p) {
      const st = norm(p.status);
      if (st.startsWith("LIBERADO")) return { etapa: 11, data: hoje, obs: `Prova de produção ${p.status.toLowerCase()} na ficha` };
      if (st === "REPROVADO") return { etapa: 3, data: hoje, ciclo: e.ciclo + 1, obs: `Prova de produção reprovada — repilotando (ciclo ${e.ciclo + 1})` };
    }
  }
  return null;
}

export type LinxFluxo = { cadastrados: string[]; pedidos: Record<string, string[]> };

// Cadastro no Linx (6 → 7) e pedido novo (15 → 16). "Pedido novo" é um número
// que não existia quando o card entrou em Compra definida: pedidos de
// mostruário ainda abertos não contam.
export function proximaPorLinx(e: FluxoEstado, linx: LinxFluxo, cadastrados: Set<string>, hoje = hojeISO()): Sugestao | null {
  if (e.etapa === 6 && cadastrados.has(e.ref)) return { etapa: 7, data: hoje, obs: "Ref encontrada cadastrada no Linx" };
  if (e.etapa === 15 && e.meta.pedidosVistos) {
    const novo = (linx.pedidos[e.ref] || []).find(n => !e.meta.pedidosVistos!.includes(n));
    if (novo) return { etapa: 16, data: hoje, obs: `Pedido ${novo} no Linx` };
  }
  return null;
}

/* ── gravação ── */
export type Movimento = { de: number | null; para: number; ciclo: number; data: string; por: string; auto: boolean; obs?: string; meta: FluxoMeta };

// Grava a etapa nova no controle_fluxo e o evento no histórico. Movimento
// automático só vale se o card ainda está na etapa de origem (dois quadros
// abertos ao mesmo tempo não movem o mesmo card duas vezes).
export async function gravarMovimento(client: SupabaseClient, ref: string, m: Movimento): Promise<string | null> {
  const patch = { etapa: m.para, ciclo: m.ciclo, etapa_desde: m.data, fluxo_meta: m.meta, ...camposControleFluxo(m.para, m.ciclo, m.data, m.meta), updated_at: new Date().toISOString() };
  if (m.auto && m.de !== null) {
    const { data, error } = await client.from("controle_fluxo").update(patch).eq("produto_ref", ref).eq("etapa", m.de).select("produto_ref");
    if (error) return error.message;
    if (!data?.length) return "ja-movido";
  } else {
    const { error } = await client.from("controle_fluxo").upsert({ produto_ref: ref, ...patch }, { onConflict: "produto_ref" });
    if (error) return error.message;
  }
  const { error } = await client.from("fluxo_eventos").insert({ produto_ref: ref, etapa: m.para, ciclo: m.ciclo, data: m.data, por: m.por, auto: m.auto, obs: m.obs || "" });
  return error ? error.message : null;
}

// Meta ao entrar numa etapa: 15 guarda os pedidos já existentes no Linx.
export function metaAoEntrar(para: number, meta: FluxoMeta, ref: string, linx: LinxFluxo | null): FluxoMeta {
  if (para === 15) return { ...meta, pedidosVistos: linx ? (linx.pedidos[ref] || []) : undefined };
  return meta;
}

// Aplica todas as regras automáticas (ficha e Linx) em sequência para um card
// — uma prova já aprovada leva o card de 9 a 11 numa passada só.
export function encadearAutomaticos(e: FluxoEstado, provas: ProvaFicha[], linx: LinxFluxo | null, cadastrados: Set<string>, hoje = hojeISO()): { estado: FluxoEstado; movimentos: Movimento[]; fotoPedidos: boolean } {
  let atual = { ...e, meta: { ...e.meta } };
  const movimentos: Movimento[] = [];
  let fotoPedidos = false;
  for (let i = 0; i < 6; i++) {
    // Ao chegar em 15 sem fotografia dos pedidos (Linx fora do ar na hora),
    // tira a foto agora em vez de tratar todo pedido como novo.
    if (atual.etapa === 15 && !atual.meta.pedidosVistos && linx) {
      atual = { ...atual, meta: { ...atual.meta, pedidosVistos: linx.pedidos[atual.ref] || [] } };
      fotoPedidos = true;
    }
    const s = proximaPorFicha(atual, provas, hoje) || (linx ? proximaPorLinx(atual, linx, cadastrados, hoje) : null);
    if (!s) break;
    const ciclo = s.ciclo ?? atual.ciclo;
    const meta = metaAoEntrar(s.etapa, atual.meta, atual.ref, linx);
    movimentos.push({ de: atual.etapa, para: s.etapa, ciclo, data: s.data, por: "Automático", auto: true, obs: s.obs, meta });
    atual = { ...atual, etapa: s.etapa, ciclo, desde: s.data, meta };
  }
  // fotoPedidos sem movimento: quem chamou grava só o fluxo_meta, senão a
  // foto se perde e todo pedido aberto pareceria "novo" na próxima vez.
  return { estado: atual, movimentos, fotoPedidos: fotoPedidos && !movimentos.length };
}
