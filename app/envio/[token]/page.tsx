// Página pública do pacote de envio — é o que o fornecedor abre.
//
// Componente de SERVIDOR de propósito: a consulta roda no servidor com a chave
// administrativa, que nunca chega ao navegador, e a página devolve só os
// campos do pacote. Nada do resto do PLM fica acessível a partir daqui.
//
// A credencial é o token na URL. Sem token válido (ou com o envio desativado),
// a página não mostra nada.

import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const URL_BASE = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "").replace(/\/rest\/v1$/, "");

function fmtTamanho(bytes: number) {
  if (!bytes) return "";
  const mb = bytes / 1048576;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function fmtData(iso: string) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

async function buscarEnvio(token: string) {
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!URL_BASE || !chave) return null;
  const sb = createClient(URL_BASE, chave, { auth: { persistSession: false } });
  const { data: envio } = await sb.from("envios").select("*").eq("token", token).eq("ativo", true).maybeSingle();
  if (!envio) return null;
  const { data: arquivos } = await sb.from("envio_arquivos").select("*").eq("envio_id", envio.id).order("nome");
  return { envio, arquivos: arquivos || [] };
}

export default async function PaginaEnvio({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const dados = await buscarEnvio(token);

  const shell = (conteudo: React.ReactNode) => (
    <div style={{ minHeight: "100vh", background: "#F2F4F7", fontFamily: "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", padding: "32px 16px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>{conteudo}</div>
    </div>
  );

  if (!dados) {
    return shell(
      <div style={{ background: "#fff", borderRadius: 16, padding: 40, textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: "#0C1D2E", margin: 0 }}>Link indisponível</h1>
        <p style={{ fontSize: 14, color: "#64748B", marginTop: 8 }}>
          Este link não existe ou foi desativado. Peça um novo ao contato da Austral.
        </p>
      </div>
    );
  }

  const { envio, arquivos } = dados;

  return shell(
    <>
      <div style={{ background: "#4464AF", borderRadius: "16px 16px 0 0", padding: "24px 28px", color: "#fff" }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", opacity: 0.75 }}>AUSTRAL</div>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: "4px 0 0" }}>Fichas técnicas</h1>
        <div style={{ fontSize: 13, opacity: 0.9, marginTop: 6 }}>
          {envio.fornecedor} · {envio.colecao} · {envio.estagio}
        </div>
      </div>

      <div style={{ background: "#fff", borderRadius: "0 0 16px 16px", padding: "20px 28px 28px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
        {envio.observacao && (
          <p style={{ fontSize: 13, color: "#0C1D2E", background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 8, padding: "10px 12px", margin: "0 0 18px", whiteSpace: "pre-wrap" }}>
            {envio.observacao}
          </p>
        )}

        <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>
          {arquivos.length} arquivo{arquivos.length !== 1 ? "s" : ""}
        </div>

        {arquivos.length === 0 && (
          <p style={{ fontSize: 14, color: "#64748B" }}>Nenhum arquivo neste envio ainda.</p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {arquivos.map((a: any) => (
            <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" download
               style={{ display: "flex", alignItems: "center", gap: 12, border: "1px solid #E2E8F0", borderRadius: 10, padding: "12px 14px", textDecoration: "none", color: "#0C1D2E", background: "#fff" }}>
              <span style={{ fontSize: 18 }}>📄</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 14, fontWeight: 600, wordBreak: "break-word" }}>{a.nome}</span>
                {(a.refs?.length || a.tamanho) ? (
                  <span style={{ display: "block", fontSize: 12, color: "#94A3B8", marginTop: 2 }}>
                    {a.refs?.length ? a.refs.join(", ") : ""}{a.refs?.length && a.tamanho ? " · " : ""}{fmtTamanho(a.tamanho)}
                  </span>
                ) : null}
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#4464AF", whiteSpace: "nowrap" }}>Baixar</span>
            </a>
          ))}
        </div>

        <p style={{ fontSize: 11, color: "#94A3B8", marginTop: 20, marginBottom: 0 }}>
          Enviado em {fmtData(envio.created_at)}{envio.criado_por_nome ? ` por ${envio.criado_por_nome}` : ""} · Austral® · Confidencial
        </p>
      </div>
    </>
  );
}
