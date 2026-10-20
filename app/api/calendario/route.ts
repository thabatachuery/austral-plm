import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase-server";
import { lerCalendarioPlanilha } from "@/lib/calendario-planilha";

// GET /api/calendario -> calendário lido direto da planilha do SharePoint,
// pelo Microsoft Graph (app do Azure com leitura no site Produto).
//
// Enquanto o TI não libera o app, as variáveis MS_* não existem e a rota
// responde "sem-graph": a tela usa a última planilha enviada pelo botão
// "Atualizar com o Excel".
export const dynamic = "force-dynamic";

// Calendário 2026.xlsx — Produto › Documentos Partilhados › 0 - CALENDÁRIOS › 2026
const DRIVE_PADRAO = "b!wHBMJB_Z-EudtmcdHmWk0eqpDznJAgtPg6pChgWI2zkKrSp0qETSToe_EkwThOie";
const ITEM_PADRAO = "01FN4FDV2UYVFP6CVNMBAYOSIRMFFSD6C7";

export async function GET() {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET } = process.env;
  if (!MS_TENANT_ID || !MS_CLIENT_ID || !MS_CLIENT_SECRET) return NextResponse.json({ error: "sem-graph" }, { status: 503 });
  const drive = process.env.CALENDARIO_DRIVE_ID || DRIVE_PADRAO;
  const item = process.env.CALENDARIO_ITEM_ID || ITEM_PADRAO;

  try {
    const tok = await fetch(`https://login.microsoftonline.com/${MS_TENANT_ID}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: MS_CLIENT_ID, client_secret: MS_CLIENT_SECRET, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" }),
      cache: "no-store",
    }).then(r => r.json());
    if (!tok.access_token) return NextResponse.json({ error: `Microsoft recusou o acesso: ${tok.error_description || tok.error || "sem token"}` }, { status: 502 });

    const arq = await fetch(`https://graph.microsoft.com/v1.0/drives/${drive}/items/${item}/content`, { headers: { Authorization: `Bearer ${tok.access_token}` }, cache: "no-store" });
    if (!arq.ok) return NextResponse.json({ error: `Não consegui baixar a planilha do SharePoint (${arq.status}).` }, { status: 502 });
    return NextResponse.json({ ...lerCalendarioPlanilha(await arq.arrayBuffer()), origem: "sharepoint" });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Falha ao ler a planilha." }, { status: 502 });
  }
}
