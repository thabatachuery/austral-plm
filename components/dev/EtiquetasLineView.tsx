"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fetchTecidos } from "@/lib/db";
import { fmtBRL } from "@/lib/utils";

interface Props { rows: any[]; variantes: Record<string, string[]> }

/* ── Helpers ── */
const isMostOrProd = (s: string) => {
  const u = (s || "").toUpperCase();
  return u.includes("MOSTRUÁRIO") || u.includes("MOSTRUARIO") ||
         u.includes("PRODUÇÃO")   || u.includes("PRODUCAO")   || u.includes("REPILOTANDO");
};
const fmtBrl = (v: number | null | undefined) => v != null && v > 0 ? fmtBRL(v) : "—";
const fmtMkp = (v: number | null | undefined) =>
  v != null && v > 0 ? `${v.toFixed(2)}x` : "—";

function getPrices(item: any) {
  const final = isMostOrProd(item.status);
  const custo  = final ? item.custo_final  : item.custo_inicial;
  const mkp    = final
    ? (item.varejo_final && item.custo_final > 0 ? item.varejo_final / item.custo_final : null)
    : (item.markup_inicial || null);
  // varejo: final → varejo_final; dev → custo_inicial × markup_inicial
  const varejo = final
    ? item.varejo_final
    : (item.custo_inicial && item.markup_inicial ? item.custo_inicial * item.markup_inicial : null);
  const statusLabel = final
    ? (item.status?.toUpperCase().includes("MOSTRUÁRIO") || item.status?.toUpperCase().includes("MOSTRUARIO")
        ? "MOSTRUÁRIO" : "PRODUÇÃO")
    : "DESENVOLVIMENTO";
  return { custo, varejo, mkp, statusLabel, final };
}

/* ── Filter fields ── */
const FILTER_FIELDS = [
  { key: "status",       label: "Status" },
  { key: "colecao",      label: "Coleção" },
  { key: "grupo",        label: "Grupo" },
  { key: "subgrupo",     label: "Subgrupo" },
  { key: "fornecedor",   label: "Fornecedor" },
  { key: "linha",        label: "Linha" },
  { key: "tecido",       label: "Tecido" },
  { key: "forn_tecido",  label: "Forn. Tecido" },
  { key: "operacao",     label: "Operação" },
  { key: "categoria",    label: "Categoria" },
  { key: "subcategoria", label: "Subcategoria" },
  { key: "tipo",         label: "Tipo" },
  { key: "drop",         label: "Drop" },
  { key: "estilista",    label: "Estilista" },
];

/* ── MultiSelect ── */
function MultiSelect({ label, options, selected, onChange }: {
  label: string; options: string[]; selected: string[]; onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    if (open) document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const visible = options.filter(o => o.toLowerCase().includes(search.toLowerCase()));
  const active = selected.length > 0;
  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button onClick={() => setOpen(o => !o)} style={{
        display: "flex", alignItems: "center", gap: 5, fontSize: 12, padding: "5px 10px",
        borderRadius: 7, border: "1px solid", cursor: "pointer", whiteSpace: "nowrap",
        background: active ? "var(--plm-neon)" : "var(--bg-secondary)",
        borderColor: active ? "var(--plm-neon-borda)" : "var(--separator)",
        color: active ? "var(--plm-tinta)" : "var(--label-secondary)", fontWeight: active ? 600 : 400,
      }}>
        {label}{active ? ` (${selected.length})` : ""}
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
          style={{ transform: open ? "rotate(180deg)" : "none", opacity: .7 }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 1000,
          background: "var(--bg-primary)", border: "1px solid var(--separator)", borderRadius: 10,
          boxShadow: "0 8px 28px rgba(0,0,0,0.15)", minWidth: 220, maxWidth: 300, padding: "6px 0" }}>
          {options.length > 6 && (
            <div style={{ padding: "4px 10px 6px", borderBottom: "1px solid var(--separator)" }}>
              <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar…"
                style={{ width: "100%", fontSize: 12, padding: "4px 8px", border: "1px solid var(--separator)",
                  borderRadius: 6, background: "var(--bg-secondary)", color: "var(--label-primary)", outline: "none" }} />
            </div>
          )}
          <div style={{ display: "flex", gap: 8, padding: "4px 10px 5px", borderBottom: "1px solid var(--separator)" }}>
            <button onClick={() => onChange(options)} style={{ fontSize: 11, color: "var(--system-blue)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Todos</button>
            <span style={{ color: "var(--separator)" }}>·</span>
            <button onClick={() => onChange([])} style={{ fontSize: 11, color: "var(--label-tertiary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Limpar</button>
          </div>
          <div style={{ maxHeight: 260, overflowY: "auto" }}>
            {visible.length === 0 && <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--label-tertiary)" }}>Nenhum resultado</div>}
            {visible.map(opt => {
              const checked = selected.includes(opt);
              return (
                <label key={opt} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 12px",
                  cursor: "pointer", background: checked ? "var(--bg-secondary)" : "transparent" }}>
                  <input type="checkbox" checked={checked}
                    onChange={() => onChange(checked ? selected.filter(x => x !== opt) : [...selected, opt])}
                    style={{ accentColor: "var(--system-blue)", width: 13, height: 13, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: "var(--label-primary)" }}>{opt || "—"}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Label ── */
function Etiqueta({ item, cores }: { item: any; cores: string[] }) {
  const { custo, varejo, mkp, statusLabel, final } = getPrices(item);
  const [precoAlvo, setPrecoAlvo] = useState<string>(
    item.preco_target != null && item.preco_target > 0
      ? item.preco_target.toFixed(2).replace(".", ",")
      : ""
  );

  const statusColor =
    statusLabel === "DESENVOLVIMENTO" ? { bg: "#EEF3FF", text: "#3B5FC0", dot: "#4464AF" } :
    statusLabel === "MOSTRUÁRIO"      ? { bg: "#FFFBEA", text: "#8A6800", dot: "#D4A800" } :
                                        { bg: "#EDFAF3", text: "#1A6E3C", dot: "#2DB564" };

  return (
    <div className="etq">

      {/* ══ HEADER ══ */}
      <div className="etq-header">
        <div className="etq-header-left">
          <img src="/logo-austral.png" alt="Austral" className="etq-logo" />
          <span className="etq-line-div" />
          <span className="etq-colecao">{item.colecao || ""}</span>
        </div>
        <span className="etq-status-pill" style={{ background: statusColor.bg, color: statusColor.text }}>
          <span className="etq-status-dot" style={{ background: statusColor.dot }} />
          {statusLabel}
        </span>
      </div>

      {/* ══ PRODUCT INFO ══ */}
      <div className="etq-section">
        <div className="etq-ref-row">
          <span className="etq-ref">{item.ref}</span>
          {item.fornecedor && <span className="etq-forn">{item.fornecedor}</span>}
        </div>
        <div className="etq-desc">{item.desc}</div>

        <div className="etq-meta-row">
          {item.tecido && (
            <div className="etq-meta-item">
              <span className="etq-meta-lbl">Tecido</span>
              <span className="etq-meta-val">{item.tecido}</span>
            </div>
          )}
          {item.composicao && (
            <div className="etq-meta-item">
              <span className="etq-meta-lbl">Comp.</span>
              <span className="etq-meta-val">{item.composicao}</span>
            </div>
          )}
          {item.forn_tecido && (
            <div className="etq-meta-item">
              <span className="etq-meta-lbl">Forn. Tecido</span>
              <span className="etq-meta-val">{item.forn_tecido}</span>
            </div>
          )}
        </div>

        {cores.length > 0 && (
          <div className="etq-cores">
            {cores.map(c => <span key={c} className="etq-cor-chip">{c}</span>)}
          </div>
        )}
      </div>

      {/* ══ PRICE STRIP ══ */}
      <div className="etq-prices">
        <div className="etq-price-col">
          <span className="etq-price-lbl">Custo</span>
          <span className="etq-price-val">{fmtBrl(custo)}</span>
        </div>
        <div className="etq-price-sep" />
        <div className="etq-price-col">
          <span className="etq-price-lbl">Markup</span>
          <span className="etq-price-val">{fmtMkp(mkp)}</span>
        </div>
        <div className="etq-price-sep" />
        <div className="etq-price-col etq-price-col-main">
          <span className="etq-price-lbl">{final ? "$ Varejo Final" : "$ Varejo Inicial"}</span>
          <span className="etq-price-val etq-price-main-val">{fmtBrl(varejo)}</span>
        </div>
        <div className="etq-price-sep" />
        <div className="etq-price-col etq-price-col-alvo">
          <span className="etq-price-lbl">$ Preço Alvo</span>
          <input
            className="etq-preco-alvo-input"
            type="text"
            placeholder=""
            value={precoAlvo}
            onChange={e => setPrecoAlvo(e.target.value)}
            onClick={e => e.stopPropagation()}
          />
        </div>
      </div>

      {/* ══ FOOTER CHECKBOXES ══ */}
      <div className="etq-checks">
        <div className="etq-check">
          <div className="etq-check-box" />
          <span className="etq-check-lbl etq-check-green">APROVADO</span>
        </div>
        <div className="etq-check-div" />
        <div className="etq-check">
          <div className="etq-check-box" />
          <span className="etq-check-lbl etq-check-red">COR<br/>CANCELADA</span>
        </div>
        <div className="etq-check-div" />
        <div className="etq-check">
          <div className="etq-check-box" />
          <span className="etq-check-lbl etq-check-red">REF.<br/>CANCELADA</span>
        </div>
      </div>
    </div>
  );
}

/* ── Styles ── */
const STYLES = `
/* ════ SHARED ════ */
.etq {
  font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  overflow: hidden;
}

/* ════ SCREEN ════ */
@media screen {
  .etq {
    width: 340px;
    min-height: 170px;
    border: 1px solid #e0e0e8;
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.08);
  }
  .etq-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 7px 11px 6px;
    background: #13131f;
    border-radius: 7px 7px 0 0;
    flex-shrink: 0;
  }
  .etq-header-left { display: flex; align-items: center; gap: 7px; }
  .etq-logo { height: 36px; width: auto; max-width: 120px; filter: invert(1); mix-blend-mode: screen; object-fit: contain; }
  .etq-brand { color: #fff; font-size: 10px; font-weight: 800; letter-spacing: 0.18em; }
  .etq-line-div { width: 1px; height: 11px; background: rgba(255,255,255,0.25); }
  .etq-colecao { color: rgba(255,255,255,0.55); font-size: 9px; font-weight: 500; letter-spacing: 0.05em; }
  .etq-status-pill {
    display: flex; align-items: center; gap: 4px;
    font-size: 8px; font-weight: 700; letter-spacing: 0.04em;
    padding: 2px 7px; border-radius: 20px;
  }
  .etq-status-dot { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; }

  .etq-section { padding: 7px 11px 5px; flex: 1; display: flex; flex-direction: column; gap: 3px; overflow: hidden; }
  .etq-ref-row { display: flex; align-items: baseline; justify-content: space-between; gap: 6px; }
  .etq-ref { font-size: 13px; font-weight: 800; color: #111; letter-spacing: 0.02em; }
  .etq-forn { font-size: 9px; color: #888; font-weight: 500; white-space: nowrap; }
  .etq-desc { font-size: 10px; font-weight: 500; color: #333; line-height: 1.3;
    overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .etq-meta-row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 1px; }
  .etq-meta-item { display: flex; flex-direction: column; }
  .etq-meta-lbl { font-size: 7px; font-weight: 700; color: #aaa; text-transform: uppercase; letter-spacing: 0.06em; }
  .etq-meta-val { font-size: 8px; color: #555; font-weight: 500; }
  .etq-cores { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 2px; }
  .etq-cor-chip { font-size: 8px; padding: 1px 6px; border: 1px solid #e0e0e0;
    border-radius: 3px; color: #555; background: #f7f7f9; white-space: nowrap; font-weight: 500; }

  .etq-prices {
    display: flex; align-items: stretch;
    background: #f7f8fc;
    border-top: 1px solid #eaebf0;
    flex-shrink: 0;
  }
  .etq-price-col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 6px 4px; }
  .etq-price-col-main { flex: 1.3; background: #13131f08; }
  .etq-price-col-alvo { flex: 1.3; background: #EEF3FF44; }
  .etq-price-lbl { font-size: 7.5px; font-weight: 700; color: #aaa; text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 1px; }
  .etq-price-val { font-size: 10px; font-weight: 700; color: #222; }
  .etq-price-main-val { font-size: 13px; color: #13131f; }
  .etq-price-sep { width: 1px; background: #eaebf0; margin: 5px 0; }
  .etq-preco-alvo-input {
    width: 90%; font-size: 13px; font-weight: 700; color: #13131f;
    border: none; border-bottom: 1.5px solid #4464AF; background: transparent;
    text-align: center; outline: none; padding: 1px 2px;
  }
  .etq-preco-alvo-input::placeholder { color: #bbb; font-weight: 400; font-size: 11px; }

  .etq-checks {
    display: flex; align-items: center;
    background: #fafafa; border-top: 1px solid #eaebf0;
    flex-shrink: 0;
  }
  .etq-check { flex: 1; display: flex; align-items: center; justify-content: center; gap: 5px; padding: 5px 2px; }
  .etq-check-div { width: 1px; height: 28px; background: #eaebf0; }
  .etq-check-box { width: 13px; height: 13px; border: 1.5px solid #ccc; border-radius: 2px; flex-shrink: 0; background: white; }
  .etq-check-lbl { font-size: 7.5px; font-weight: 700; text-align: center; line-height: 1.25; }
  .etq-check-green { color: #1a7a1a; }
  .etq-check-red { color: #cc0000; }
}

/* ════ PRINT — Pimaco 6083 (101.6 × 50.8 mm, 2 col × 5 row = 10/Carta 216×279mm) ════ */
@media print {
  @page { size: 216mm 279mm; margin: 0; }
  body > * { display: none !important; }
  #etq-print { display: block !important; }
  .etq-sheet {
    width: 216mm;
    height: 279mm;
    box-sizing: border-box;
    padding-top: 12.7mm;
    padding-left: 4mm;
    display: grid;
    grid-template-columns: 101.6mm 101.6mm;
    column-gap: 5.2mm;
    row-gap: 0mm;
    align-content: start;
    page-break-after: always;
    break-after: page;
    overflow: hidden;
  }
  .etq {
    width: 101.6mm; height: 50.8mm;
    box-sizing: border-box;
    border: 0.3pt solid #d0d0d8;
    page-break-inside: avoid;
  }
  .etq-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 1.2mm 3mm 1.2mm;
    background: #13131f;
    flex-shrink: 0;
  }
  .etq-header-left { display: flex; align-items: center; gap: 2mm; }
  .etq-logo { height: 7mm; width: auto; max-width: 30mm; filter: invert(1); mix-blend-mode: screen; object-fit: contain; }
  .etq-brand { color: #fff; font-size: 7pt; font-weight: 800; letter-spacing: 0.2em; }
  .etq-line-div { width: 0.3pt; height: 3mm; background: rgba(255,255,255,0.3); }
  .etq-colecao { color: rgba(255,255,255,0.5); font-size: 5pt; font-weight: 500; letter-spacing: 0.05em; }
  .etq-status-pill {
    display: flex; align-items: center; gap: 1mm;
    font-size: 4.5pt; font-weight: 700; letter-spacing: 0.04em;
    padding: 0.4mm 1.8mm; border-radius: 3mm;
  }
  .etq-status-dot { width: 1.5mm; height: 1.5mm; border-radius: 50%; flex-shrink: 0; }

  .etq-section { padding: 1mm 3mm 0.8mm; flex: 1; display: flex; flex-direction: column; gap: 0.4mm; overflow: hidden; }
  .etq-ref-row { display: flex; align-items: baseline; justify-content: space-between; gap: 2mm; }
  .etq-ref { font-size: 9pt; font-weight: 800; color: #111; }
  .etq-forn { font-size: 5pt; color: #888; }
  .etq-desc { font-size: 6pt; font-weight: 500; color: #333; line-height: 1.2; max-height: 2.5em; overflow: hidden; }
  .etq-meta-row { display: flex; gap: 3mm; flex-wrap: wrap; }
  .etq-meta-item { display: flex; flex-direction: column; }
  .etq-meta-lbl { font-size: 4pt; font-weight: 700; color: #aaa; text-transform: uppercase; letter-spacing: 0.06em; }
  .etq-meta-val { font-size: 5pt; color: #555; }
  .etq-cores { display: flex; flex-wrap: wrap; gap: 0.6mm; margin-top: 0.3mm; }
  .etq-cor-chip { font-size: 4.5pt; padding: 0.2mm 1.5mm; border: 0.3pt solid #ddd;
    border-radius: 1mm; color: #555; background: #f5f5f7; white-space: nowrap; }

  .etq-prices {
    display: flex; align-items: stretch;
    background: #f7f8fc; border-top: 0.3pt solid #e0e0e8;
    flex-shrink: 0;
  }
  .etq-price-col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 1mm 1mm; }
  .etq-price-col-main { flex: 1.3; background: rgba(19,19,31,0.04); }
  .etq-price-col-alvo { flex: 1.3; background: rgba(68,100,175,0.05); }
  .etq-price-lbl { font-size: 4pt; font-weight: 700; color: #aaa; text-transform: uppercase; letter-spacing: 0.07em; }
  .etq-price-val { font-size: 5.5pt; font-weight: 700; color: #222; }
  .etq-price-main-val { font-size: 7.5pt; color: #13131f; }
  .etq-price-sep { width: 0.3pt; background: #e0e0e8; margin: 1mm 0; }
  .etq-preco-alvo-input {
    width: 90%; font-size: 7.5pt; font-weight: 700; color: #13131f;
    border: none; border-bottom: 0.5pt solid #4464AF; background: transparent;
    text-align: center; outline: none; padding: 0.3mm 1mm;
  }

  .etq-checks {
    display: flex; align-items: center;
    background: #fafafa; border-top: 0.3pt solid #e0e0e8;
    flex-shrink: 0;
  }
  .etq-check { flex: 1; display: flex; align-items: center; justify-content: center; gap: 1.5mm; padding: 1mm 1mm; }
  .etq-check-div { width: 0.3pt; height: 6mm; background: #e0e0e8; }
  .etq-check-box { width: 3.5mm; height: 3.5mm; border: 0.4pt solid #bbb; flex-shrink: 0; background: white; }
  .etq-check-lbl { font-size: 4pt; font-weight: 700; text-align: center; line-height: 1.25; }
  .etq-check-green { color: #1a7a1a; }
  .etq-check-red { color: #cc0000; }
}

/* ════ SCREEN — identidade AUSTRAL PLM by AusTab ════
   Só a visualização na tela. O bloco @media print acima continua igual:
   o PDF das etiquetas (Pimaco 6083) sai exatamente como antes. */
@media screen {
  .etq { border-radius: 12px; border-color: #E3DDD6; font-family: var(--font-inter), -apple-system, sans-serif; }
  .etq * { font-family: var(--font-inter), -apple-system, sans-serif; }
  .etq-header { background: #16171D; border-radius: 11px 11px 0 0; }
  .etq-cor-chip { border-radius: 999px; background: #F3EFEA; border-color: transparent; color: #16171D; }
  .etq-prices { background: #fff; border-top: 1px dashed #CFC8C0; }
  .etq-checks { background: #fff; border-top: none; gap: 6px; padding: 4px 8px 8px; }
  .etq-check { border: 1px solid #CFC8C0; border-radius: 999px; }
  .etq-check-div { display: none; }
  .etq-check-green { color: #0E6A40; }
  .etq-check-red { color: #A8221D; }
  .etq-forn { background: #F3EFEA; border-radius: 999px; padding: 1px 7px; color: #3A3732; }
}
`;

/* ── Main view ── */
export default function EtiquetasLineView({ rows, variantes }: Props) {
  const [filters, setFilters]         = useState<Record<string, string[]>>({});
  const [selected, setSelected]       = useState<Set<string>>(new Set());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [quantities, setQuantities]   = useState<Record<string, number>>({});
  const [tecidoCompMap, setTecidoCompMap] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchTecidos().then(tecidos => {
      const map: Record<string, string> = {};
      tecidos.forEach((t: any) => { if (t.comp) map[t.nome] = t.comp; });
setTecidoCompMap(map);
    });
  }, []);

  const getQty = (ref: string) => quantities[ref] ?? 1;
  const setQty = (ref: string, val: number) =>
    setQuantities(prev => ({ ...prev, [ref]: Math.max(1, Math.min(99, val || 1)) }));

  const setFilter = (key: string, vals: string[]) =>
    setFilters(prev => ({ ...prev, [key]: vals }));

  const optionsFor = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const f of FILTER_FIELDS)
      map[f.key] = Array.from(new Set(rows.map(i => i[f.key] || "").filter(Boolean))).sort();
    return map;
  }, [rows]);

  const filtered = useMemo(() => rows.filter(i => {
    for (const [key, vals] of Object.entries(filters)) {
      if (vals.length === 0) continue;
      if (!vals.includes(i[key] || "")) return false;
    }
    return true;
  }), [rows, filters]);

  const activeCount = Object.values(filters).filter(v => v.length > 0).length;
  const prevFilteredRefs = useRef<Set<string>>(new Set());
  useEffect(() => {
    const currentRefs = new Set(filtered.map(r => r.ref));
    // Preserva desmarcações manuais: só entra pré-selecionada a referência que é
    // nova no filtro atual; quem já estava visível mantém a escolha do usuário.
    setSelected(prevSelected => {
      const next = new Set<string>();
      currentRefs.forEach(ref => {
        if (prevFilteredRefs.current.has(ref)) {
          if (prevSelected.has(ref)) next.add(ref);
        } else {
          next.add(ref);
        }
      });
      return next;
    });
    prevFilteredRefs.current = currentRefs;
  }, [filtered]);

  const toggleRef  = (ref: string) => setSelected(prev => { const n = new Set(prev); n.has(ref) ? n.delete(ref) : n.add(ref); return n; });
  const toggleAll  = () => setSelected(prev => prev.size === filtered.length ? new Set() : new Set(filtered.map(r => r.ref)));
  const toGenerate = filtered.filter(r => selected.has(r.ref));
  const totalLabels = toGenerate.reduce((acc, r) => acc + getQty(r.ref), 0);

  return (
    <>
      <style>{STYLES}</style>

      <div style={{ padding: "0 0 40px" }}>

        {/* ── Toolbar ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
          padding: "12px 0", marginBottom: filtersOpen ? 0 : 16,
          borderBottom: filtersOpen ? "none" : "1px solid var(--separator)" }}>

          <button onClick={() => setFiltersOpen(o => !o)} style={{
            display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600,
            padding: "5px 12px", borderRadius: 7, border: "1px solid", cursor: "pointer",
            background: activeCount > 0 ? "var(--plm-neon)" : "var(--bg-secondary)",
            borderColor: activeCount > 0 ? "var(--plm-neon-borda)" : "var(--separator)",
            color: activeCount > 0 ? "var(--plm-tinta)" : "var(--label-secondary)",
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/>
            </svg>
            Filtros{activeCount > 0 ? ` (${activeCount})` : ""}
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
              style={{ transform: filtersOpen ? "rotate(180deg)" : "none" }}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>

          {activeCount > 0 && (
            <button className="apple-btn-secondary" onClick={() => setFilters({})} style={{ fontSize: 12, padding: "5px 10px" }}>
              Limpar
            </button>
          )}

          <div style={{ width: 1, height: 24, background: "var(--separator)" }} />

          <button className="apple-btn-secondary" onClick={toggleAll} style={{ fontSize: 12, padding: "5px 12px" }}>
            {selected.size === filtered.length ? "Desmarcar todos" : "Selecionar todos"}
          </button>

          <span style={{ fontSize: 12, color: "var(--label-tertiary)" }}>
            {selected.size} selecionada{selected.size !== 1 ? "s" : ""} de {filtered.length}
          </span>

          <div style={{ marginLeft: "auto" }}>
            <button className="apple-btn-primary" onClick={() => window.print()} disabled={toGenerate.length === 0}
              style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, padding: "7px 16px" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <polyline points="6 9 6 2 18 2 18 9"/>
                <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2v5a2 2 0 01-2 2h16a2 2 0 002-2v-5a2 2 0 00-2-2h0"/>
                <rect x="6" y="14" width="12" height="8"/>
              </svg>
              Imprimir ({totalLabels} etiqueta{totalLabels !== 1 ? "s" : ""})
            </button>
          </div>
        </div>

        {/* ── Filter panel ── */}
        {filtersOpen && (
          <div style={{ padding: "14px 16px", marginBottom: 16, background: "var(--bg-secondary)",
            borderRadius: "0 0 10px 10px", border: "1px solid var(--separator)", borderTop: "none" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {FILTER_FIELDS.map(f => (
                <MultiSelect key={f.key} label={f.label} options={optionsFor[f.key] || []}
                  selected={filters[f.key] || []} onChange={vals => setFilter(f.key, vals)} />
              ))}
            </div>
          </div>
        )}

        {/* ── Preview grid ── */}
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: "var(--label-tertiary)", fontSize: 14 }}>Nenhum produto encontrado.</div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, paddingBottom: 20 }}>
            {filtered.map(item => {
              const sel = selected.has(item.ref);
              return (
                <div key={item.ref} onClick={() => toggleRef(item.ref)} style={{
                  position: "relative", cursor: "pointer",
                  outline: sel ? "2.5px solid var(--plm-neon-barra)" : "2.5px solid transparent",
                  outlineOffset: 3, borderRadius: 10,
                  opacity: sel ? 1 : 0.4,
                  transition: "opacity .15s, outline .1s",
                }}>
                  <div style={{
                    position: "absolute", top: -7, right: -7, zIndex: 3,
                    width: 20, height: 20, borderRadius: "50%",
                    background: sel ? "var(--plm-neon)" : "#fff",
                    border: `2px solid ${sel ? "var(--plm-neon-borda)" : "#ccc"}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.18)",
                  }}>
                    {sel && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--plm-tinta)" strokeWidth="3.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                  </div>
                  {sel && (
                    <div onClick={e => e.stopPropagation()} style={{
                      position: "absolute", bottom: -14, left: "50%", transform: "translateX(-50%)",
                      zIndex: 4, display: "flex", alignItems: "center", gap: 4,
                      background: "#fff", border: "1.5px solid var(--plm-neon-borda)",
                      borderRadius: 20, padding: "2px 6px", boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                    }}>
                      <button onClick={() => setQty(item.ref, getQty(item.ref) - 1)} style={{
                        width: 18, height: 18, border: "none", background: "none", cursor: "pointer",
                        fontSize: 16, lineHeight: 1, color: "var(--plm-tinta)", fontWeight: 700, padding: 0,
                      }}>−</button>
                      <input
                        type="number" min={1} max={99} value={getQty(item.ref)}
                        onChange={e => setQty(item.ref, parseInt(e.target.value) || 1)}
                        style={{
                          width: 28, textAlign: "center", border: "none", outline: "none",
                          fontSize: 12, fontWeight: 700, color: "var(--label-primary)", background: "none",
                          MozAppearance: "textfield",
                        }}
                      />
                      <button onClick={() => setQty(item.ref, getQty(item.ref) + 1)} style={{
                        width: 18, height: 18, border: "none", background: "none", cursor: "pointer",
                        fontSize: 16, lineHeight: 1, color: "var(--plm-tinta)", fontWeight: 700, padding: 0,
                      }}>+</button>
                    </div>
                  )}
                  <Etiqueta item={{ ...item, composicao: tecidoCompMap[item.tecido] || item.composicao || "" }} cores={variantes[item.ref] || []} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Print area — rendered via portal directly on body so print CSS works ── */}
      {typeof document !== "undefined" && createPortal(
        <div id="etq-print" style={{ display: "none" }}>
          {(() => {
            const expanded: any[] = [];
            toGenerate.forEach(item => {
              const qty = getQty(item.ref);
              for (let i = 0; i < qty; i++)
                expanded.push({ ...item, composicao: tecidoCompMap[item.tecido] || item.composicao || "" });
            });
            return Array.from({ length: Math.ceil(expanded.length / 10) }, (_, si) => {
              const page = expanded.slice(si * 10, si * 10 + 10);
              if (page.length % 2 !== 0) page.push(null as any);
              return (
                <div key={si} className="etq-sheet">
                  {page.map((item, idx) =>
                    item
                      ? <Etiqueta key={item.ref + si + idx} item={item} cores={variantes[item.ref] || []} />
                      : <div key={"pad" + idx} style={{ width: "101.6mm", height: "50.8mm" }} />
                  )}
                </div>
              );
            });
          })()}
        </div>,
        document.body
      )}
    </>
  );
}
