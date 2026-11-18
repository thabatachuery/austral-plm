"use client";
import { useState, FormEvent } from "react";
import LogoPLM from "@/components/ui/LogoPLM";
import { useAuth } from "@/lib/auth-context";
import { getSupabase } from "@/lib/supabase";

export default function LoginModal() {
  const { signIn, resetPassword }  = useAuth();
  const [email, setEmail]     = useState("");
  const [password, setPass]   = useState("");
  const [error, setError]     = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode]       = useState<"password" | "magic" | "reset">("password");
  const [messagemMagic, setMessageMagic] = useState<string | null>(null);
  const [messageReset, setMessageReset] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const err = await signIn(email.trim(), password);
    setLoading(false);
    if (err) {
      // Erros de rede/infra (ex.: CSP bloqueando, timeout, Supabase fora do ar) não são
      // "senha incorreta" — mostrar mensagem genérica só mascara o problema real.
      const isNetworkOrServerError = /failed to fetch|network|timeout|fetch/i.test(err);
      setError(isNetworkOrServerError
        ? "Erro de conexão. Verifique sua internet e tente novamente em instantes."
        : "Email ou senha incorretos.");
    }
  };

  const handleMagicLink = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessageMagic(null);
    setLoading(true);
    try {
      const { error: err } = await getSupabase().auth.signInWithOtp({ email: email.trim() });
      setLoading(false);
      if (err) {
        setError(err.message);
      } else {
        setMessageMagic("✅ Link de acesso enviado! Verifique seu email.");
      }
    } catch (e: any) {
      setLoading(false);
      setError("Erro ao enviar link. Tente novamente.");
    }
  };

  const handleResetPassword = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessageReset(null);
    setLoading(true);
    const err = await resetPassword(email.trim());
    setLoading(false);
    if (err) {
      setError(err);
    } else {
      setMessageReset("✅ Email de redefinição de senha enviado! Verifique seu email.");
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "var(--bg-secondary)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000,
    }}>
      <div className="apple-card" style={{
        width: 360, padding: "36px 32px",
        boxShadow: "0 20px 60px rgba(0,0,0,0.12)",
      }}>
        {/* Logo — identidade AUSTRAL PLM by AusTab */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ display: "inline-flex", marginBottom: 14 }}>
            <LogoPLM size={56} />
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "var(--label-primary)", letterSpacing: "0.02em" }}>
            AUSTRAL PLM
          </div>
          <div style={{ fontSize: 12, color: "var(--label-secondary)", marginTop: 2 }}>by AusTab</div>
          <div style={{ fontSize: 13, color: "var(--label-secondary)", marginTop: 10 }}>
            Faça login para continuar
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20, borderBottom: "1px solid var(--separator)" }}>
          <button
            onClick={() => { setMode("password"); setError(null); setMessageMagic(null); setMessageReset(null); }}
            style={{
              flex: 1, padding: "10px 0", fontSize: 13, fontWeight: 600,
              color: mode === "password" ? "var(--system-blue)" : "var(--label-secondary)",
              borderBottom: mode === "password" ? "2px solid var(--system-blue)" : "none",
              background: "none", border: "none", cursor: "pointer",
            }}
          >
            Senha
          </button>
          <button
            onClick={() => { setMode("magic"); setError(null); setMessageMagic(null); setMessageReset(null); }}
            style={{
              flex: 1, padding: "10px 0", fontSize: 13, fontWeight: 600,
              color: mode === "magic" ? "var(--system-blue)" : "var(--label-secondary)",
              borderBottom: mode === "magic" ? "2px solid var(--system-blue)" : "none",
              background: "none", border: "none", cursor: "pointer",
            }}
          >
            Link Mágico
          </button>
          <button
            onClick={() => { setMode("reset"); setError(null); setMessageMagic(null); setMessageReset(null); }}
            style={{
              flex: 1, padding: "10px 0", fontSize: 13, fontWeight: 600,
              color: mode === "reset" ? "var(--system-blue)" : "var(--label-secondary)",
              borderBottom: mode === "reset" ? "2px solid var(--system-blue)" : "none",
              background: "none", border: "none", cursor: "pointer",
            }}
          >
            Redefinir Senha
          </button>
        </div>

        {mode === "password" ? (
          // Formulário de Senha
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--label-secondary)", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                autoFocus
                className="apple-input"
                style={{ width: "100%" }}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--label-secondary)", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Senha
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPass(e.target.value)}
                placeholder="••••••••"
                required
                className="apple-input"
                style={{ width: "100%" }}
              />
            </div>

            {error && (
              <div style={{
                background: "rgba(255,59,48,0.08)", border: "1px solid rgba(255,59,48,0.2)",
                color: "var(--system-red)", borderRadius: 10, padding: "10px 14px",
                fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 8,
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="apple-btn-primary"
              style={{ width: "100%", marginTop: 8, justifyContent: "center", opacity: loading ? 0.6 : 1 }}
            >
              {loading ? "Entrando…" : "Entrar"}
            </button>
          </form>
        ) : mode === "magic" ? (
          // Formulário de Magic Link
          <form onSubmit={handleMagicLink} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--label-secondary)", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                autoFocus
                className="apple-input"
                style={{ width: "100%" }}
              />
            </div>

            <div style={{ fontSize: 12, color: "var(--label-secondary)", lineHeight: 1.5 }}>
              Receberá um link de acesso por email. Sem necessidade de senha! 🔗
            </div>

            {error && (
              <div style={{
                background: "rgba(255,59,48,0.08)", border: "1px solid rgba(255,59,48,0.2)",
                color: "var(--system-red)", borderRadius: 10, padding: "10px 14px",
                fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 8,
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {error}
              </div>
            )}

            {messagemMagic && (
              <div style={{
                background: "rgba(76,175,80,0.08)", border: "1px solid rgba(76,175,80,0.2)",
                color: "var(--system-green)", borderRadius: 10, padding: "10px 14px",
                fontSize: 13, fontWeight: 500,
              }}>
                {messagemMagic}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="apple-btn-primary"
              style={{ width: "100%", marginTop: 8, justifyContent: "center", opacity: loading ? 0.6 : 1 }}
            >
              {loading ? "Enviando…" : "Enviar Link Mágico"}
            </button>
          </form>
        ) : (
          // Formulário de Redefinir Senha
          <form onSubmit={handleResetPassword} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--label-secondary)", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                autoFocus
                className="apple-input"
                style={{ width: "100%" }}
              />
            </div>

            <div style={{ fontSize: 12, color: "var(--label-secondary)", lineHeight: 1.5 }}>
              Enviaremos um link para redefinir sua senha. 🔐
            </div>

            {error && (
              <div style={{
                background: "rgba(255,59,48,0.08)", border: "1px solid rgba(255,59,48,0.2)",
                color: "var(--system-red)", borderRadius: 10, padding: "10px 14px",
                fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 8,
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {error}
              </div>
            )}

            {messageReset && (
              <div style={{
                background: "rgba(76,175,80,0.08)", border: "1px solid rgba(76,175,80,0.2)",
                color: "var(--system-green)", borderRadius: 10, padding: "10px 14px",
                fontSize: 13, fontWeight: 500,
              }}>
                {messageReset}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="apple-btn-primary"
              style={{ width: "100%", marginTop: 8, justifyContent: "center", opacity: loading ? 0.6 : 1 }}
            >
              {loading ? "Enviando…" : "Enviar Link de Redefinição"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
