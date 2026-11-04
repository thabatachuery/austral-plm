// Helpers client-side para consumir a rota interna /api/linx/* (que por sua vez
// fala com o Linx server-side). A chave do Linx NUNCA passa por aqui.

export type EstoquePedido = {
  numero: string;
  cor: string;
  corNome: string;
  qtd: number;
  data: string;
  fornecedor?: string;
  situacao?: string;
};

export type EstoqueDetalhe = {
  ref: string;
  total: number;
  futuro: number;
  porCor: { cor: string; nome: string; qtd: number }[];
  porFilial: { filial: string; qtd: number }[];
  pedidos: EstoquePedido[];
  semDados?: boolean;
};

// Totais para a lista: estoque atual (totals) e a receber / futuro (futuros),
// ambos indexados por produto_pai (= produtos.ref).
export async function fetchEstoqueTotals(): Promise<{
  totals: Record<string, number>;
  futuros: Record<string, number>;
}> {
  const res = await fetch("/api/linx/estoque");
  if (!res.ok) throw new Error("Falha ao carregar estoque do Linx.");
  const json = await res.json();
  return {
    totals: (json.totals || {}) as Record<string, number>,
    futuros: (json.futuros || {}) as Record<string, number>,
  };
}

export async function fetchEstoqueDetalhe(ref: string): Promise<EstoqueDetalhe> {
  const res = await fetch(`/api/linx/estoque?ref=${encodeURIComponent(ref)}`);
  if (!res.ok) throw new Error("Falha ao carregar estoque do SKU.");
  return res.json() as Promise<EstoqueDetalhe>;
}

// Base dos rankings (/api/linx/ranking): uma linha por referência.
// est/estCor/estLoja = estoque atual; fut = pedidos pendentes;
// ven/venCor/venLoja = venda em peças no período (venValor em R$).
export type RankingItem = {
  ref: string;
  desc: string;
  colecao: string;
  grupo: string;
  subgrupo: string;
  categoria: string;
  subcategoria: string;
  linha: string;
  fabricante: string;
  est: number;
  fut: number;
  futCor: Record<string, number>;
  estCor: Record<string, number>;
  estLoja: Record<string, number>;
  ven: number;
  venValor: number;
  venCor: Record<string, number>;
  venLoja: Record<string, number>;
};
export type RankingDados = {
  itens: RankingItem[];
  cores: Record<string, string>;
  vendasDisponivel: boolean;
  vendasErro?: string;
};

export async function fetchRanking(de: string, ate: string): Promise<RankingDados> {
  const res = await fetch(`/api/linx/ranking?de=${de}&ate=${ate}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Falha ao carregar dados do Linx.");
  return json as RankingDados;
}

// Cadastros que o Linx fornece hoje (valores em MAIÚSCULAS, já distintos).
// subcategoria/linha vêm vazios até o BI incluir no /produtos.
export type LinxCadastros = {
  grupo: string[];
  subgrupo: string[];
  categoria: string[];
  colecao: string[];
  grade: string[];
  fornecedor: string[];
  subcategoria: string[];
  linha: string[];
};

export async function fetchLinxCadastros(): Promise<LinxCadastros> {
  const res = await fetch("/api/linx/cadastros");
  if (!res.ok) throw new Error("Falha ao carregar cadastros do Linx.");
  const json = await res.json();
  return json.cadastros as LinxCadastros;
}

export type LinxAviamentoCorItem = { cor: string; ref_cor_fabricante?: string };
export type LinxAviamentoItem = { codigo: string; nome: string; fornecedor?: string; custo?: number; unidade?: string; referencia_fabricante?: string; cores?: LinxAviamentoCorItem[] };

// Retorna { available, aviamentos }. available=false = endpoint ainda não
// publicado pelo BI (a tela mostra aviso em vez de erro).
export async function fetchLinxAviamentos(): Promise<{ available: boolean; aviamentos: LinxAviamentoItem[] }> {
  const res = await fetch("/api/linx/aviamentos");
  if (!res.ok) throw new Error("Falha ao carregar aviamentos do Linx.");
  return res.json();
}
