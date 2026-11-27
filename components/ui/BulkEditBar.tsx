"use client";
import { useState, type ReactNode } from "react";

// Barra que aparece com linhas marcadas na tabela: escolhe a coluna, o valor,
// e grava o mesmo valor em todas de uma vez (ex.: 3 refs -> CUSTO SOLICITADO).
export type BulkField = {
  key: string;
  label: string;
  type: "select" | "text" | "number" | "date";
  options?: string[];
};

const VAZIO = "__vazio__";

type Props = {
  count: number;
  /** "SKU", "variante"… — usado no "3 SKUs selecionados". */
  noun: string;
  /** Concordância: "variantes selecionadas". */
  feminino?: boolean;
  fields: BulkField[];
  onApply: (field: BulkField, value: string | number | null) => Promise<void>;
  onCancel: () => void;
  children?: ReactNode;
};

const inputStyle: React.CSSProperties = { fontSize: 12, padding: "4px 10px", borderRadius: 6, border: "none", background: "rgba(255,255,255,0.2)", color: "#fff", minWidth: 150, maxWidth: 260 };

export default function BulkEditBar({ count, noun, feminino = false, fields, onApply, onCancel, children }: Props) {
  const [campoKey, setCampoKey] = useState("");
  const [valor, setValor] = useState("");
  const [salvando, setSalvando] = useState(false);
  const campo = fields.find(f => f.key === campoKey);

  // Select: escolher "(em branco)" também vale — limpa a coluna nas marcadas.
  const pronto = !!campo && !salvando && (campo.type === "select" ? valor !== "" : true);

  const aplicar = async () => {
    if (!campo || !pronto) return;
    let v: string | number | null = valor.trim();
    if (campo.type === "select" && valor === VAZIO) v = "";
    if (campo.type === "number") {
      if (v === "") v = null;
      else {
        const n = parseFloat(String(v).replace(",", "."));
        if (Number.isNaN(n)) return;
        v = n;
      }
    }
    if (campo.type === "date" && v === "") v = null;
    setSalvando(true);
    try {
      await onApply(campo, v);
      setCampoKey("");
      setValor("");
    } finally {
      setSalvando(false);
    }
  };

  const plural = count !== 1 ? "s" : "";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--system-blue)", borderRadius: 10, padding: "10px 16px", marginBottom: 12, flexWrap: "wrap" }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{count} {noun}{plural} selecionad{feminino ? "a" : "o"}{plural}</span>
      {fields.length > 0 && (
        <>
          <select aria-label="Coluna a alterar" value={campoKey} onChange={e => { setCampoKey(e.target.value); setValor(""); }} style={inputStyle}>
            <option value="">Alterar coluna…</option>
            {fields.map(f => <option key={f.key} value={f.key} style={{ color: "#000" }}>{f.label}</option>)}
          </select>
          {campo && (campo.type === "select" ? (
            <select aria-label={`Novo valor de ${campo.label}`} value={valor} onChange={e => setValor(e.target.value)} style={inputStyle}>
              <option value="">Para…</option>
              {(campo.options || []).map(o => <option key={o} value={o} style={{ color: "#000" }}>{o}</option>)}
              <option value={VAZIO} style={{ color: "#000" }}>(em branco)</option>
            </select>
          ) : (
            <input
              aria-label={`Novo valor de ${campo.label}`}
              type={campo.type === "date" ? "date" : "text"}
              inputMode={campo.type === "number" ? "decimal" : undefined}
              placeholder={campo.type === "date" ? undefined : "Novo valor (vazio limpa)"}
              value={valor}
              onChange={e => setValor(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") aplicar(); }}
              style={{ ...inputStyle, colorScheme: "dark" }}
              className="placeholder:text-white/60"
            />
          ))}
          <button onClick={aplicar} disabled={!pronto} style={{ fontSize: 12, fontWeight: 600, padding: "5px 14px", borderRadius: 6, background: pronto ? "#fff" : "rgba(255,255,255,0.3)", color: pronto ? "var(--system-blue)" : "rgba(255,255,255,0.6)", border: "none", cursor: pronto ? "pointer" : "default" }}>
            {salvando ? "Aplicando…" : "Aplicar"}
          </button>
        </>
      )}
      {children}
      <button onClick={onCancel} style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", background: "none", border: "none", cursor: "pointer", marginLeft: "auto" }}>Cancelar</button>
    </div>
  );
}
