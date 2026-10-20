import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { linxParaFluxo } from "@/lib/linx-fluxo";

// GET /api/linx/fluxo -> { cadastrados: string[], pedidos: { [ref]: string[] } }
// Usado pelo Kanban de Fluxo ao abrir, para avançar sozinho "Cadastro no Linx
// OK" e "Pedido emitido". A chave do Linx nunca sai do servidor.
export async function GET() {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  try {
    return NextResponse.json(await linxParaFluxo());
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Falha ao consultar o Linx." }, { status: 502 });
  }
}
