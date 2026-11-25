import { NextResponse } from "next/server";
import { requireAuth, adminClient } from "@/lib/supabase-server";
import { sincronizarPedidosProducao } from "@/lib/pedidos-producao-sync";
import { sincronizarVarianteCompras } from "@/lib/variante-compras-sync";

// POST /api/linx/variante-compras -> botão "Atualizar do Linx" da Compra x
// Variante. Registra antes a entrega dos pedidos que saíram do Linx (é o que
// zera as variantes entregues) e depois preenche qtd / pedido / entrega.
// ?simular=1 calcula sem gravar.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const simular = new URL(req.url).searchParams.get("simular") === "1";
  try {
    const db = adminClient();
    if (!simular) await sincronizarPedidosProducao(db).catch(e => console.error("variante-compras/sincronizarPedidosProducao:", e));
    const r = await sincronizarVarianteCompras(db, { gravar: !simular });
    return NextResponse.json(r);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Falha ao atualizar do Linx." }, { status: 502 });
  }
}
