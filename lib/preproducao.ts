// Laudo de pré-produção por pedido: junta os pedidos de produção — do Linx
// (em aberto) e da lista de Variantes (Pedido 1/2 + Entrega 1/2, por cor) —
// com os laudos já gravados no PLM e diz em que pé cada um está.
// Uma ref com 3 pedidos (3 datas) = 3 laudos, cada um com as cores do pedido.
// Sem import de servidor: usado pela rota /api/linx/pedidos e pelas telas.
import { ehDiaUtil } from "./feriados";

export type PedidoListaPP = {
  numero: string; data: string; cores: string[]; qtd: number; tipo?: string; fornecedor?: string; linx?: boolean;
  pendente?: number;            // saldo ainda não entregue (Linx)
  situacaoLinx?: string;        // EM ABERTO | PARCIAL | ENTREGUE
  entregueEm?: string;          // produção entregue (saiu do Linx ou marcada à mão)
};

// Compras que não passam por pré-produção.
export const TIPOS_SEM_PRE_PRODUCAO = ["MATERIAIS", "PÓS - PRODUÇÃO", "POS - PRODUCAO"];

// Pedido abaixo disso é mostruário/quebra (2, 4, 10 peças) — não gera laudo.
// Conta a quantidade TOTAL do pedido (um pedido parcial com pouco saldo
// pendente continua sendo de produção). Pedido sem quantidade informada
// (lista de Variantes sem qtd) entra, porque não dá para julgar.
export const PEDIDO_MIN_PECAS = 30;
export const ehPedidoDeProducao = (p: PedidoListaPP) => !p.qtd || p.qtd >= PEDIDO_MIN_PECAS;

// Junta as duas fontes pelo número do pedido (o Linx manda na data e nas
// cores; a lista completa o que ainda não foi lançado no Linx) e descarta
// os pedidos pequenos.
export function mesclarFontes(linx: PedidoListaPP[], lista: PedidoListaPP[]): PedidoListaPP[] {
  return mesclarTudo(linx, lista).filter(ehPedidoDeProducao);
}

function mesclarTudo(linx: PedidoListaPP[], lista: PedidoListaPP[]): PedidoListaPP[] {
  const out = linx.map(p => ({ ...p, cores: [...p.cores] }));
  for (const p of lista) {
    const igual = p.numero && out.find(x => x.numero === p.numero);
    if (!igual) { out.push(p); continue; }
    for (const c of p.cores) {
      const cod = c.split(/[\s-]/)[0];
      if (!igual.cores.some(x => x === c || x.split(/[\s-]/)[0] === cod)) igual.cores.push(c);
    }
  }
  return out.sort((a, b) => (a.data || "9").localeCompare(b.data || "9"));
}

// Previsão da pré-produção: 10 dias corridos antes da entrega da produção.
export const DIAS_PRE_ANTES_PRODUCAO = 10;

// "00004505" e "4505" são o mesmo pedido.
export const numeroPedidoNorm = (n: any) => String(n ?? "").trim().replace(/^0+(?=\d)/, "");

export const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function menosDias(iso: string, dias: number) {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - dias)).toISOString().slice(0, 10);
}

export const previsaoPre = (entregaProducao: string) => menosDias(entregaProducao, DIAS_PRE_ANTES_PRODUCAO);

// Prazo do laudo: de 1 a 3 dias úteis (seg–sex sem feriado, expediente
// 9h–18h) depois da entrega da pré. Vence às 18h do 3º dia útil; passou = atrasado.
export const DIAS_UTEIS_LAUDO = 3;
export const FIM_EXPEDIENTE_H = 18;

function maisDiasUteis(iso: string, n: number) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  while (n > 0) { dt.setUTCDate(dt.getUTCDate() + 1); if (ehDiaUtil(dt.toISOString().slice(0, 10))) n--; }
  return dt.toISOString().slice(0, 10);
}

export type PrazoLaudo = { limite: string; situacao: "no_prazo" | "vence_hoje" | "atrasado" };

export function prazoLaudo(entregaPre: string, agora = new Date()): PrazoLaudo | null {
  if (!entregaPre) return null;
  const limite = maisDiasUteis(entregaPre, DIAS_UTEIS_LAUDO);
  const hoje = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;
  const situacao = hoje > limite || (hoje === limite && agora.getHours() >= FIM_EXPEDIENTE_H) ? "atrasado"
    : hoje === limite ? "vence_hoje" : "no_prazo";
  return { limite, situacao };
}

export const fmtBR = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : "");

// Linhas de produto_variante_compras (uma por cor) -> pedidos por ref.
// Agrupa pelo número do pedido; sem número, pela data de entrega.
export function pedidosDaLista(linhas: { cor?: string; pedido1?: string; data_entrega1?: string; qtd_compra1?: number; pedido2?: string; data_entrega2?: string; qtd_compra2?: number }[]): PedidoListaPP[] {
  const m: Record<string, PedidoListaPP> = {};
  const add = (cor: string, ped: any, data: any, qtd: any) => {
    const numero = numeroPedidoNorm(ped);
    const d = String(data || "").slice(0, 10);
    if (!numero && !d) return;
    const key = numero ? `n:${numero}` : `d:${d}`;
    const p = (m[key] ||= { numero, data: d, cores: [], qtd: 0 });
    if (d && (!p.data || d < p.data)) p.data = d;
    if (cor && !p.cores.includes(cor)) p.cores.push(cor);
    p.qtd += Number(qtd) || 0;
  };
  for (const l of linhas) {
    add(l.cor || "", l.pedido1, l.data_entrega1, l.qtd_compra1);
    add(l.cor || "", l.pedido2, l.data_entrega2, l.qtd_compra2);
  }
  return Object.values(m).sort((a, b) => (a.data || "9").localeCompare(b.data || "9"));
}

// entregue = produção já entregue e o pedido ficou sem pré nem laudo.
export type SituacaoPP = "concluido" | "recebida" | "entregue" | "pendente";

export const SITUACAO_PP: Record<SituacaoPP, { label: string; bg: string; color: string }> = {
  pendente:  { label: "Aguardando pré",                bg: "#F1EEE8", color: "#5E5850" },
  recebida:  { label: "Pré entregue · laudo pendente", bg: "#FDEBDD", color: "#8A3A08" },
  concluido: { label: "Laudo concluído",               bg: "#E2F2E9", color: "#0E6A40" },
  entregue:  { label: "Produção entregue · sem laudo", bg: "#E6EEF7", color: "#1F4E80" },
};

// Pré entregue e laudo por fazer: selo conforme o prazo de 3 dias úteis.
export const LAUDO_ATRASADO = { bg: "#FBE6E5", color: "#A8221D" };
export function pillPreRecebida(p: { prazoLaudo: PrazoLaudo | null }): { label: string; bg: string; color: string } {
  const pz = p.prazoLaudo;
  if (pz?.situacao === "atrasado") return { label: `Laudo atrasado (prazo ${fmtBR(pz.limite)})`, ...LAUDO_ATRASADO };
  if (pz?.situacao === "vence_hoje") return { label: `Laudo vence hoje às ${FIM_EXPEDIENTE_H}h`, bg: "#FDEBDD", color: "#8A3A08" };
  return { ...SITUACAO_PP.recebida, label: pz ? `Pré entregue · laudo até ${fmtBR(pz.limite)}` : SITUACAO_PP.recebida.label };
}

// Selo da produção (independe do laudo).
export const PRODUCAO_PP = {
  entregue: { label: "Produção entregue", bg: "#E6EEF7", color: "#1F4E80" },
  parcial:  { label: "Entrega parcial",   bg: "#EEF3F9", color: "#1F4E80" },
};

// Um pedido na aba: vem da lista, do laudo gravado, ou dos dois.
export type PedidoPP = {
  numero: string;               // normalizado ("" = sem número)
  laudoId: number | null;       // null = laudo ainda não aberto
  entregaProducao: string;
  previsaoPre: string;
  entregaPre: string;
  dataLaudo: string;
  status: string;               // resultado do laudo (LIBERADA, REPROVADA…)
  cores: string[];              // cores do pedido (da lista)
  qtd: number;
  tipo: string;                 // tipo de compra no Linx (PRODUÇÃO, VAREJO…)
  fornecedor: string;
  producaoEntregue: string;     // data em que a produção foi entregue ("" = não)
  parcial: boolean;             // Linx: entrega parcial
  pendente: number;             // saldo ainda não entregue
  situacao: SituacaoPP;
  atrasada: boolean;            // pré não chegou e a previsão já passou
  prazoLaudo: PrazoLaudo | null; // pré entregue e laudo por fazer: até quando
  laudoAtrasado: boolean;       // passou dos 3 dias úteis sem laudo
  correcao: number;             // 0 = laudo do pedido; 1, 2… = laudo de correção
};

// Reprovada para corrigir: o fornecedor manda nova pré e ela ganha um laudo
// de correção, com o mesmo número de pedido.
export const STATUS_PEDE_CORRECAO = "REPROVADA - CORRIGIR";

// ── Conferência do laudo: itens "correto" / "incorreto" ──
// Item com "sub" só é correto quando TODOS os subitens estão corretos;
// qualquer subitem incorreto deixa o item incorreto.
export type CheckValor = "ok" | "nok";
// Na mesma chave JSONB: "<item>": "ok" | "nok" e "<item>__obs": o que está
// incorreto (texto livre, só aparece/imprime quando o item está incorreto).
export type ChecklistPP = Record<string, string>;
export const obsKey = (key: string) => `${key}__obs`;
export const valorCheck = (c: ChecklistPP, key: string): CheckValor | "" =>
  c[key] === "ok" || c[key] === "nok" ? c[key] as CheckValor : "";
export type ItemCheck = { key: string; label: string; sub?: { key: string; label: string }[] };

export const CHECKLIST_PP: ItemCheck[] = [
  { key: "embalagem", label: "Embalagem" },
  { key: "tag_papel", label: "Tag de papel" },
  { key: "codigo_barras", label: "Códigos de barras", sub: [
    { key: "cb_referencia", label: "Referência" },
    { key: "cb_cor", label: "Cor" },
    { key: "cb_nome", label: "Nome" },
    { key: "cb_tamanho", label: "Tamanho" },
  ] },
  { key: "aviamentos", label: "Aviamentos" },
  { key: "etiqueta_composicao", label: "Etiqueta de composição" },
];

// Resultado do item: "ok", "nok" ou "" (ainda não conferido por completo).
export function resultadoCheck(item: ItemCheck, c: ChecklistPP): CheckValor | "" {
  if (!item.sub) return valorCheck(c, item.key);
  const vals = item.sub.map(s => valorCheck(c, s.key));
  if (vals.includes("nok")) return "nok";
  return vals.every(v => v === "ok") ? "ok" : "";
}

export const checklistTemIncorreto = (c: ChecklistPP) => CHECKLIST_PP.some(i => resultadoCheck(i, c) === "nok");

export function situacaoDe(p: { status: string; dataLaudo: string; entregaPre: string; producaoEntregue?: string }): SituacaoPP {
  if (p.status || p.dataLaudo) return "concluido";
  if (p.entregaPre) return "recebida";
  if (p.producaoEntregue) return "entregue";
  return "pendente";
}

type LaudoLinha = { id: number; numero_pedido: string; status: string; data_entrega_producao: string; data_entrega_pre: string; data_laudo: string; correcao_de?: number | null };

export function juntarPedidos(lista: PedidoListaPP[], laudos: LaudoLinha[], hoje = hojeISO()): PedidoPP[] {
  const out: PedidoPP[] = [];
  const usados = new Set<number>();
  // Laudos de correção não casam sozinhos com o pedido: entram logo depois
  // do laudo que reprovou (e as correções delas, em sequência).
  const ids = new Set(laudos.map(l => l.id));
  const ehCorrecao = (l: LaudoLinha) => !!l.correcao_de && ids.has(l.correcao_de);
  const originais = laudos.filter(l => !ehCorrecao(l));
  const comCorrecoes = (numero: string, l: LaudoLinha, p: PedidoListaPP | null) => {
    out.push(monta(numero, l, p, 0));
    let atual = l;
    for (let n = 1; ; n++) {
      const c = laudos.find(x => x.correcao_de === atual.id && !usados.has(x.id));
      if (!c) break;
      usados.add(c.id);
      out.push(monta(numero, c, p, n));
      atual = c;
    }
  };
  const monta = (numero: string, l: LaudoLinha | null, p: PedidoListaPP | null, correcao = 0): PedidoPP => {
    // A data da lista manda (pode ter sido remarcada); o laudo guarda a cópia.
    const entregaProducao = (p?.data || l?.data_entrega_producao || "").slice(0, 10);
    const base = {
      numero, laudoId: l?.id ?? null, entregaProducao, previsaoPre: previsaoPre(entregaProducao),
      entregaPre: (l?.data_entrega_pre || "").slice(0, 10), dataLaudo: (l?.data_laudo || "").slice(0, 10),
      status: l?.status || "", cores: p?.cores || [], qtd: p?.qtd || 0,
      tipo: p?.tipo || "", fornecedor: p?.fornecedor || "",
      producaoEntregue: (p?.entregueEm || "").slice(0, 10), parcial: p?.situacaoLinx === "PARCIAL", pendente: p?.pendente || 0,
    };
    const situacao = situacaoDe(base);
    const prazo = situacao === "recebida" ? prazoLaudo(base.entregaPre) : null;
    return {
      ...base, situacao, atrasada: situacao === "pendente" && !!base.previsaoPre && base.previsaoPre < hoje,
      prazoLaudo: prazo, laudoAtrasado: prazo?.situacao === "atrasado", correcao,
    };
  };
  for (const p of lista) {
    const l = originais.find(x => !usados.has(x.id) && (p.numero
      ? numeroPedidoNorm(x.numero_pedido) === p.numero
      : !x.numero_pedido && (x.data_entrega_producao || "").slice(0, 10) === p.data)) || null;
    if (l) { usados.add(l.id); comCorrecoes(p.numero, l, p); }
    else out.push(monta(p.numero, null, p));
  }
  // Laudos gravados que não batem com nenhum pedido da lista (avulsos/antigos).
  for (const l of originais) if (!usados.has(l.id)) { usados.add(l.id); comCorrecoes(numeroPedidoNorm(l.numero_pedido), l, null); }
  // Correção que sobrou (duas abertas para o mesmo laudo): não some da lista.
  for (const l of laudos) if (!usados.has(l.id)) out.push(monta(numeroPedidoNorm(l.numero_pedido), l, null, 1));
  // sort é estável: a correção fica logo depois do laudo que reprovou.
  return out.sort((a, b) => (a.entregaProducao || "9").localeCompare(b.entregaProducao || "9"));
}
