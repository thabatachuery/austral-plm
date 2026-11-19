// Envio de e-mail pelo Microsoft 365 (Graph), com o mesmo app do Azure do
// calendário (MS_TENANT_ID / MS_CLIENT_ID / MS_CLIENT_SECRET). Precisa da
// permissão de APLICATIVO "Mail.Send" liberada pelo TI e de uma caixa
// remetente (MS_EMAIL_REMETENTE, ex.: plm@austral.com.br). Só servidor.

export function emailConfigurado(): string | null {
  const { MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, MS_EMAIL_REMETENTE } = process.env;
  const faltam = Object.entries({ MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, MS_EMAIL_REMETENTE })
    .filter(([, v]) => !v).map(([k]) => k);
  return faltam.length ? `Faltam as variáveis ${faltam.join(", ")}.` : null;
}

export async function enviarEmail(para: string[], assunto: string, texto: string, cc: string[] = []): Promise<void> {
  const falta = emailConfigurado();
  if (falta) throw new Error(falta);
  const { MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, MS_EMAIL_REMETENTE } = process.env;
  const tok = await fetch(`https://login.microsoftonline.com/${MS_TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: MS_CLIENT_ID!, client_secret: MS_CLIENT_SECRET!, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" }),
    cache: "no-store",
  }).then(r => r.json());
  if (!tok.access_token) throw new Error(`Microsoft recusou o acesso: ${tok.error_description || tok.error || "sem token"}`);

  const r = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(MS_EMAIL_REMETENTE!)}/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tok.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject: assunto,
        body: { contentType: "Text", content: texto },
        toRecipients: para.map(address => ({ emailAddress: { address } })),
        ccRecipients: cc.map(address => ({ emailAddress: { address } })),
      },
      saveToSentItems: true,
    }),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Falha ao enviar e-mail (${r.status}): ${(await r.text()).slice(0, 300)}`);
}

// Lista de e-mails numa variável: "a@x.com, b@x.com".
export const listaEmails = (v?: string) => (v || "").split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
