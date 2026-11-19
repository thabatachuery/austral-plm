import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { getPedidosProduto, getCores } from "@/lib/linx";
import { numeroPedidoNorm, TIPOS_SEM_PRE_PRODUCAO, type PedidoListaPP } from "@/lib/preproducao";

// GET /api/linx/pedidos[?ref=XXXX] -> { pedidos: { [ref]: PedidoListaPP[] } }
// Pedidos de produção em aberto no Linx, agrupados por número (o Linx manda
// uma linha por cor). Usado na aba Pré-Produção: cada pedido vira um laudo.
// Compras de MATERIAIS / PÓS-PRODUÇÃO não passam por pré-produção.
export async function GET(req: Request) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const soRef = new URL(req.url).searchParams.get("ref")?.trim() || "";
  try {
    const [linhas, cores] = await Promise.all([getPedidosProduto(), getCores().catch(() => ({} as Record<string, string>))]);
    const porRef: Record<string, Record<string, PedidoListaPP>> = {};
    for (const p of linhas) {
      const ref = String(p.produto_pai || "").trim();
      const numero = numeroPedidoNorm(p.numero_pedido);
      const tipo = String(p.tipo_compra || "").trim().toUpperCase();
      if (!ref || !numero || TIPOS_SEM_PRE_PRODUCAO.includes(tipo)) continue;
      if (soRef && ref !== soRef) continue;
      const data = String(p.data_programada || "").slice(0, 10);
      const ped = ((porRef[ref] ||= {})[numero] ||= { numero, data, cores: [], qtd: 0, tipo, fornecedor: String(p.fornecedor || "").trim(), linx: true });
      if (data && (!ped.data || data < ped.data)) ped.data = data;
      const cor = String(p.cor || "").trim();
      const corTxt = cor ? (cores[cor] ? `${cor} - ${cores[cor]}` : cor) : "";
      if (corTxt && !ped.cores.includes(corTxt)) ped.cores.push(corTxt);
      ped.qtd += Number(p.quantidade) || 0;
    }
    const pedidos: Record<string, PedidoListaPP[]> = {};
    for (const [ref, m] of Object.entries(porRef)) pedidos[ref] = Object.values(m).sort((a, b) => a.data.localeCompare(b.data));
    return NextResponse.json({ pedidos });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Falha ao consultar o Linx." }, { status: 502 });
  }
}
