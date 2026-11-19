// Laudo de pré-produção por pedido: junta os pedidos de produção — do Linx
// (em aberto) e da lista de Variantes (Pedido 1/2 + Entrega 1/2, por cor) —
// com os laudos já gravados no PLM e diz em que pé cada um está.
// Uma ref com 3 pedidos (3 datas) = 3 laudos, cada um com as cores do pedido.
// Sem import de servidor: usado pela rota /api/linx/pedidos e pelas telas.

export type PedidoListaPP = { numero: string; data: string; cores: string[]; qtd: number; tipo?: string; fornecedor?: string; linx?: boolean };

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

export type SituacaoPP = "concluido" | "recebida" | "pendente";

export const SITUACAO_PP: Record<SituacaoPP, { label: string; bg: string; color: string }> = {
  pendente:  { label: "Aguardando pré",                bg: "#F1EEE8", color: "#5E5850" },
  recebida:  { label: "Pré entregue · laudo pendente", bg: "#FDEBDD", color: "#8A3A08" },
  concluido: { label: "Laudo concluído",               bg: "#E2F2E9", color: "#0E6A40" },
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
  situacao: SituacaoPP;
  atrasada: boolean;            // pré não chegou e a previsão já passou
};

export function situacaoDe(p: { status: string; dataLaudo: string; entregaPre: string }): SituacaoPP {
  if (p.status || p.dataLaudo) return "concluido";
  if (p.entregaPre) return "recebida";
  return "pendente";
}

type LaudoLinha = { id: number; numero_pedido: string; status: string; data_entrega_producao: string; data_entrega_pre: string; data_laudo: string };

export function juntarPedidos(lista: PedidoListaPP[], laudos: LaudoLinha[], hoje = hojeISO()): PedidoPP[] {
  const out: PedidoPP[] = [];
  const usados = new Set<number>();
  const monta = (numero: string, l: LaudoLinha | null, p: PedidoListaPP | null): PedidoPP => {
    // A data da lista manda (pode ter sido remarcada); o laudo guarda a cópia.
    const entregaProducao = (p?.data || l?.data_entrega_producao || "").slice(0, 10);
    const base = {
      numero, laudoId: l?.id ?? null, entregaProducao, previsaoPre: previsaoPre(entregaProducao),
      entregaPre: (l?.data_entrega_pre || "").slice(0, 10), dataLaudo: (l?.data_laudo || "").slice(0, 10),
      status: l?.status || "", cores: p?.cores || [], qtd: p?.qtd || 0,
      tipo: p?.tipo || "", fornecedor: p?.fornecedor || "",
    };
    const situacao = situacaoDe(base);
    return { ...base, situacao, atrasada: situacao === "pendente" && !!base.previsaoPre && base.previsaoPre < hoje };
  };
  for (const p of lista) {
    const l = laudos.find(x => !usados.has(x.id) && (p.numero
      ? numeroPedidoNorm(x.numero_pedido) === p.numero
      : !x.numero_pedido && (x.data_entrega_producao || "").slice(0, 10) === p.data)) || null;
    if (l) usados.add(l.id);
    out.push(monta(p.numero, l, p));
  }
  // Laudos gravados que não batem com nenhum pedido da lista (avulsos/antigos).
  for (const l of laudos) if (!usados.has(l.id)) out.push(monta(numeroPedidoNorm(l.numero_pedido), l, null));
  return out.sort((a, b) => (a.entregaProducao || "9").localeCompare(b.entregaProducao || "9"));
}
