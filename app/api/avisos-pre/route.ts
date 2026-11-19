import { NextResponse } from "next/server";
import { requireAuth, adminClient } from "@/lib/supabase-server";
import { pedidosParaAvisar, textoAviso, type TipoAviso } from "@/lib/avisos-pre";
import { emailConfigurado, listaEmails } from "@/lib/email";

// GET /api/avisos-pre -> prévia dos e-mails de pré que sairiam hoje (não envia).
// O envio de verdade é feito pelo cron diário (/api/cron/fluxo).
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  try {
    const pedidos = await pedidosParaAvisar(adminClient());
    const emails = (Object.keys(pedidos) as TipoAviso[])
      .filter(t => pedidos[t].length)
      .map(t => ({ tipo: t, pedidos: pedidos[t].length, ...textoAviso(t, pedidos[t]) }));
    const para = listaEmails(process.env.EMAIL_PRE_PARA);
    return NextResponse.json({ para, configuracao: emailConfigurado() || (para.length ? "ok" : "Falta a variável EMAIL_PRE_PARA."), emails });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
