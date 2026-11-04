import { NextRequest, NextResponse } from "next/server";
import { getEstoque, getProdutos, getCores, getPedidosProduto, getVendas } from "@/lib/linx";
import type { LinxEstoqueItem, LinxProduto, LinxPedidoProduto, LinxVenda } from "@/lib/linx";
import { requireAuth } from "@/lib/supabase-server";

// GET /api/linx/ranking?de=2026-10-01&ate=2026-10-31
// Base dos rankings de venda e de estoque: uma linha por referência com
// estoque (por cor e por filial), futuro (pedidos pendentes) e venda do
// período (por cor e por filial). A ordenação e os filtros ficam na tela.
//
// O /estoque tem ~5 MB — acima do limite do cache de fetch do Next —, então
// guardamos em memória aqui mesmo por alguns minutos.

const MIN = 60 * 1000;
const memo = new Map<string, { em: number; valor: Promise<any> }>();
function lembrar<T>(chave: string, validade: number, carregar: () => Promise<T>): Promise<T> {
  const m = memo.get(chave);
  if (m && Date.now() - m.em < validade) return m.valor;
  const valor = carregar();
  memo.set(chave, { em: Date.now(), valor });
  valor.catch(() => memo.delete(chave));
  return valor;
}

type Mapa = Record<string, number>;
type RankingItem = {
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
  futCor: Mapa;
  estCor: Mapa;
  estLoja: Mapa;
  ven: number;
  venValor: number;
  venCor: Mapa;
  venLoja: Mapa;
};

const soma = (m: Mapa, k: string, q: number) => { m[k] = (m[k] || 0) + q; };
const dataOk = (s: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export async function GET(req: NextRequest) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const de = req.nextUrl.searchParams.get("de");
  const ate = req.nextUrl.searchParams.get("ate");

  try {
    const [estoque, produtos, cores, pedidos] = await Promise.all([
      lembrar<LinxEstoqueItem[]>("estoque", 5 * MIN, () => getEstoque()),
      lembrar<LinxProduto[]>("produtos", 60 * MIN, () => getProdutos()),
      lembrar<Record<string, string>>("cores", 60 * MIN, () => getCores()).catch(() => ({} as Record<string, string>)),
      lembrar<LinxPedidoProduto[]>("pedidos", 5 * MIN, () => getPedidosProduto()).catch(() => [] as LinxPedidoProduto[]),
    ]);

    // Venda: o /vendas ainda não existe no BI. 404 = aguardando (a tela avisa).
    let vendas: LinxVenda[] = [];
    let vendasDisponivel = false;
    let vendasErro = "";
    if (dataOk(de) && dataOk(ate)) {
      try {
        vendas = await lembrar<LinxVenda[]>(`vendas|${de}|${ate}`, 10 * MIN, () => getVendas(de!, ate!));
        vendasDisponivel = true;
      } catch (e: any) {
        const msg = String(e?.message || "");
        if (!/\b404\b/.test(msg)) vendasErro = msg || "Erro ao consultar vendas.";
      }
    }

    const info = new Map(produtos.map(p => [String(p.produto_pai).trim(), p]));
    const itens = new Map<string, RankingItem>();
    const item = (ref: string, desc = ""): RankingItem => {
      let it = itens.get(ref);
      if (!it) {
        const p = info.get(ref);
        it = {
          ref, desc: p?.descricao || desc,
          colecao: p?.colecao_nome || p?.colecao || "",
          grupo: p?.grupo || "", subgrupo: p?.subgrupo || "", categoria: p?.categoria || "",
          subcategoria: p?.subcategoria || "", linha: p?.linha || "", fabricante: p?.fabricante || "",
          est: 0, fut: 0, futCor: {}, estCor: {}, estLoja: {}, ven: 0, venValor: 0, venCor: {}, venLoja: {},
        };
        itens.set(ref, it);
      }
      return it;
    };

    for (const e of estoque) {
      const q = Number(e.estoque_total) || 0;
      if (!q) continue;
      const it = item(String(e.produto_pai).trim(), e.descricao);
      it.est += q;
      soma(it.estCor, String(e.cor).trim(), q);
      soma(it.estLoja, String(e.filial).trim(), q);
    }
    for (const p of pedidos) {
      const q = Number(p.quantidade_pendente) || 0;
      if (q <= 0) continue;
      const it = item(String(p.produto_pai).trim());
      it.fut += q;
      soma(it.futCor, String(p.cor).trim(), q);
    }
    for (const v of vendas) {
      const q = Number(v.quantidade) || 0;
      if (!q) continue;
      const it = item(String(v.produto_pai).trim());
      it.ven += q;
      it.venValor += Number(v.valor) || 0;
      soma(it.venCor, String(v.cor).trim(), q);
      soma(it.venLoja, String(v.filial).trim(), q);
    }

    // Sem nada positivo (só saldo zerado/negativo) não entra em ranking nenhum.
    const lista = Array.from(itens.values()).filter(i => i.est > 0 || i.fut > 0 || i.ven > 0);
    return NextResponse.json({ itens: lista, cores, vendasDisponivel, vendasErro });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erro ao consultar o Linx." }, { status: 502 });
  }
}
