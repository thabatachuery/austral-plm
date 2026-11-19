import { NextResponse } from "next/server";
import { requireAuth, adminClient } from "@/lib/supabase-server";
import { sincronizarPedidosProducao, pedidosLinxAgrupados, linhaParaPedido } from "@/lib/pedidos-producao-sync";
import type { PedidoListaPP } from "@/lib/preproducao";

// GET /api/linx/pedidos[?ref=XXXX] -> { pedidos: { [ref]: PedidoListaPP[] }, aviso? }
// Pedidos de produção do Linx para a aba Pré-Produção — cada pedido vira um
// laudo. Sincroniza antes com a tabela pedidos_producao para registrar a
// entrega dos que saíram da lista de pendentes; sem a tabela (migration 040
// não rodada), devolve só os pendentes ao vivo.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const soRef = new URL(req.url).searchParams.get("ref")?.trim() || "";
  const agrupa = (linhas: any[]) => {
    const pedidos: Record<string, PedidoListaPP[]> = {};
    for (const r of linhas) {
      if (soRef && r.ref !== soRef) continue;
      (pedidos[r.ref] ||= []).push(linhaParaPedido(r));
    }
    for (const l of Object.values(pedidos)) l.sort((a, b) => a.data.localeCompare(b.data));
    return pedidos;
  };

  let aviso = "";
  try {
    const db = adminClient();
    try { await sincronizarPedidosProducao(db); } catch (e: any) { aviso = `Sincronização com o Linx falhou: ${e?.message || e}`; }
    let q = db.from("pedidos_producao").select("*");
    if (soRef) q = q.eq("ref", soRef);
    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json({ pedidos: agrupa(data || []), aviso: aviso || undefined });
  } catch {
    // Sem a tabela: só o que está pendente agora no Linx.
    try {
      return NextResponse.json({ pedidos: agrupa(await pedidosLinxAgrupados()), aviso: "Rode a migration 040 para registrar a entrega da produção." });
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || "Falha ao consultar o Linx." }, { status: 502 });
    }
  }
}
