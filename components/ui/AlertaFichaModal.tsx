"use client";

const CATEGORIA_LABEL: Record<string, string> = {
  CAMPO: "UM CAMPO",
  STATUS: "O STATUS",
  COR: "COR",
  TECIDO: "TECIDO",
  AVIAMENTO: "AVIAMENTO",
};

export type Alerta = {
  id: number;
  produto_ref: string;
  categoria: string;
  campo: string;
  valor_anterior: string;
  valor_novo: string;
  status_produto: string;
  alterado_por_nome: string;
  created_at: string;
  grupo_id?: string | null;
};

function fmtDataHora(iso: string): string {
  const d = new Date(iso);
  const data = d.toLocaleDateString("pt-BR");
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${data} às ${h}h${m}`;
}

type Props = {
  /** Alterações de uma mesma edição — viram um aviso só. */
  grupo: Alerta[];
  /** Quantos avisos (grupos) ainda esperam ciência, este incluído. */
  avisosPendentes: number;
  /** Quantas alterações há na fila toda — o número do "ciente de todos". */
  alteracoesPendentes: number;
  onCiente: () => void;
  onCienteTodos: () => void;
};

export default function AlertaFichaModal({ grupo, avisosPendentes, alteracoesPendentes, onCiente, onCienteTodos }: Props) {
  const primeiro = grupo[0];
  if (!primeiro) return null;

  // Uma alteração só mantém o texto antigo, que diz logo o que mudou. Várias
  // viram a contagem, e o detalhe fica na lista abaixo.
  const titulo = grupo.length === 1
    ? `teve ${CATEGORIA_LABEL[primeiro.categoria] || "UM CAMPO"} alterado(a)`
    : `teve ${grupo.length} alterações`;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-[6px] no-print">
      <div role="dialog" aria-modal="true" aria-labelledby="alerta-ficha-title" className="bg-[var(--bg-primary)] rounded-2xl w-full max-w-[480px] shadow-[0_24px_80px_rgba(0,0,0,0.3)] overflow-hidden">
        <div style={{ padding: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 24 }}>⚠️</span>
            <h3 id="alerta-ficha-title" style={{ fontSize: 17, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
              ATENÇÃO: {primeiro.produto_ref} {titulo}
            </h3>
          </div>

          {/* Com muitas alterações a lista rola dentro do card, para o botão de
              ciente nunca sair da tela. */}
          <div style={{ maxHeight: 260, overflowY: "auto", marginBottom: 14, display: "flex", flexDirection: "column", gap: 6 }}>
            {grupo.map(a => (
              <div key={a.id} style={{ background: "var(--bg-secondary)", borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>{a.campo}</div>
                <div style={{ fontSize: 14, color: "var(--text-primary)" }}>
                  {a.valor_anterior || "(vazio)"} <span style={{ color: "var(--label-tertiary)" }}>→</span> {a.valor_novo || "(vazio)"}
                </div>
              </div>
            ))}
          </div>

          <p style={{ fontSize: 13, color: "var(--label-tertiary)", marginBottom: 4 }}>
            Alterado por <strong>{primeiro.alterado_por_nome}</strong> em {fmtDataHora(primeiro.created_at)}
          </p>
          <p style={{ fontSize: 13, color: "var(--label-tertiary)", marginBottom: 20 }}>
            Status do produto no momento: {primeiro.status_produto}
          </p>

          {avisosPendentes > 1 && (
            <p style={{ fontSize: 12, color: "var(--label-tertiary)", marginBottom: 12 }}>
              1 de {avisosPendentes} avisos pendentes
            </p>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10 }}>
            {avisosPendentes > 1 && (
              <button onClick={onCienteTodos} className="apple-btn-secondary" style={{ padding: "10px 16px", fontWeight: 600 }}>
                Ciente de todos ({alteracoesPendentes})
              </button>
            )}
            <button onClick={onCiente} className="apple-btn-primary" style={{ padding: "10px 20px", fontWeight: 600 }}>
              OK, CIENTE
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
