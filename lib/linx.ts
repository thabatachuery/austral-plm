import "server-only";

// Cliente da API de dados do Linx (roda no servidor do BI, fora da rede da Vercel).
// SERVER-SIDE APENAS — nunca importar este arquivo de um componente "use client".
// A chave (LINX_API_KEY) nunca deve ser exposta ao navegador nem usar prefixo NEXT_PUBLIC_.

const BASE_URL = process.env.LINX_API_BASE_URL || "https://bi.austral.com.br/api/linx";

export type LinxProduto = {
  produto_pai: string;
  descricao?: string;
  colecao: string;
  colecao_nome: string;
  grupo: string;
  subgrupo: string;
  categoria: string;
  fabricante: string;
  // Campos que a equipe do BI ainda vai adicionar ao endpoint /produtos
  // (hoje vêm undefined; ficam prontos para quando forem incluídos).
  subcategoria?: string;
  linha?: string;
};

export type LinxAviamentoCor = { cor: string; ref_cor_fabricante?: string };
export type LinxAviamento = {
  codigo: string;
  nome: string;
  fornecedor?: string;
  custo?: number;
  unidade?: string;
  // Campos que o BI ainda vai adicionar ao /aviamentos (hoje vêm undefined;
  // ficam prontos para quando forem incluídos).
  referencia_fabricante?: string;
  cores?: LinxAviamentoCor[];
};

export type LinxEstoqueItem = {
  produto_pai: string;
  cor: string;
  filial: string;
  descricao: string;
  grade: string;
  colecao: string;
  estoque_total: number;
  est_1: number;
  est_2: number;
  est_3: number;
  est_4: number;
  est_5: number;
  est_6: number;
};

export type LinxPedidoProduto = {
  produto_pai: string;
  cor: string;
  numero_pedido: string;
  quantidade: number;
  quantidade_pendente: number;
  data_programada: string;
  situacao?: string;
  fornecedor?: string;
  tipo_compra?: string;
};

export type LinxCustos = Record<string, number>;
export type LinxCores = Record<string, string>;
export type LinxTamanhos = Record<string, string[]>;
export type LinxHealth = { ok: boolean; service: string; linx_configured: boolean };

async function fetchLinx<T>(
  path: string,
  params?: Record<string, string | undefined>,
  opts?: { revalidateSeconds?: number },
): Promise<T> {
  const key = process.env.LINX_API_KEY;
  if (!key) throw new Error("LINX_API_KEY não configurada no servidor.");

  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v) url.searchParams.set(k, v);
    }
  }

  // Estoque/cores mudam devagar e o payload é grande (dezenas de milhares de
  // linhas) — cacheamos alguns minutos no servidor para não puxar tudo a cada
  // abertura de tela. Sem revalidateSeconds, não cacheia (dado sempre fresco).
  const cacheOpt = opts?.revalidateSeconds
    ? { next: { revalidate: opts.revalidateSeconds } }
    : { cache: "no-store" as const };

  const res = await fetch(url.toString(), {
    headers: { "X-API-Key": key },
    ...cacheOpt,
  });

  if (res.status === 401) throw new Error("Linx API: chave inválida ou não autorizada (401).");
  if (res.status === 503) throw new Error("Linx API: servidor do BI está sem a chave configurada (503).");
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Linx API: erro ${res.status} em ${path}${body ? ` — ${body.slice(0, 300)}` : ""}`);
  }

  return res.json() as Promise<T>;
}

export async function getHealth(): Promise<LinxHealth> {
  const key = process.env.LINX_API_KEY;
  const url = `${BASE_URL}/health`;
  const res = await fetch(url, key ? { headers: { "X-API-Key": key }, cache: "no-store" } : { cache: "no-store" });
  if (!res.ok) throw new Error(`Linx API: erro ${res.status} em /health`);
  return res.json() as Promise<LinxHealth>;
}

export async function getProdutos(): Promise<LinxProduto[]> {
  return fetchLinx<LinxProduto[]>("/produtos");
}

export async function getEstoque(filiais?: string[]): Promise<LinxEstoqueItem[]> {
  // Cache de 5 min — payload grande (dezenas de milhares de linhas).
  return fetchLinx<LinxEstoqueItem[]>("/estoque", { filiais: filiais?.join(",") }, { revalidateSeconds: 300 });
}

export async function getCustos(produtos?: string[]): Promise<LinxCustos> {
  return fetchLinx<LinxCustos>("/custos", { produtos: produtos?.join(",") });
}

// Pedidos de compra / ordens de produção de produto acabado ainda pendentes de
// entrega (quantidade_pendente > 0). Usado para o "estoque futuro / a receber".
export async function getPedidosProduto(): Promise<LinxPedidoProduto[]> {
  return fetchLinx<LinxPedidoProduto[]>("/pedidos-produto", undefined, { revalidateSeconds: 300 });
}

export async function getCores(): Promise<LinxCores> {
  // Cores raramente mudam — cache de 1h.
  return fetchLinx<LinxCores>("/cores", undefined, { revalidateSeconds: 3600 });
}

export async function getTamanhos(): Promise<LinxTamanhos> {
  return fetchLinx<LinxTamanhos>("/tamanhos");
}

// Venda de produto acabado no período, somada por referência × cor × filial.
// Endpoint ainda a ser criado pelo BI — contrato em docs/linx-endpoint-vendas.md.
export type LinxVenda = {
  produto_pai: string;
  cor: string;
  filial: string;
  quantidade: number;
  valor?: number;
};

export async function getVendas(de: string, ate: string): Promise<LinxVenda[]> {
  return fetchLinx<LinxVenda[]>("/vendas", { de, ate });
}

// Endpoint ainda a ser criado pelo BI (Matérias-primas → grupo 003008 Aviamentos).
// Já preparado: quando o /aviamentos existir, passa a funcionar sem mudança aqui.
export async function getAviamentos(): Promise<LinxAviamento[]> {
  return fetchLinx<LinxAviamento[]>("/aviamentos", undefined, { revalidateSeconds: 3600 });
}
