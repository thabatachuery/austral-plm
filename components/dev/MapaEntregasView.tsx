"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { fetchMapaEntregas } from "@/lib/db";
import { exportMapaEntregasPDF } from "@/lib/export-pdf-entregas";
import { STATUS_PRE_PRODUCAO_COLORS } from "@/lib/constants";
import TecidoSwatch from "@/components/ui/TecidoSwatch";

// "Ped. X" do mapa (produto_variante_compras.pedido1/2) e o número do pedido
// digitado no laudo de pré-produção são dois textos livres sem vínculo
// estrutural — casam só quando o texto é idêntico (ignorando espaços/caixa).
const normPedido = (s: string) => s.trim().toUpperCase();
function statusPPDoPedido(item: any, pedido: string): string {
  if (!pedido) return "";
  const alvo = normPedido(pedido);
  return (item.laudosPP || []).find((l: any) => normPedido(l.numero_pedido) === alvo)?.status || "";
}

/* ── Status ── */
const STATUS_COLORS: Record<string, string> = {
  CANCELADO: "#EA2F46",
  "REPILOTANDO": "#F5820A",
  "PRODUÇÃO LIBERADA": "#2DB564",
  "PRODUCAO LIBERADA": "#2DB564",
  PRODUÇÃO: "#2DB564",
  PRODUCAO: "#2DB564",
  "MOSTRUÁRIO LIBERADO": "#EDCA35",
  "MOSTRUARIO LIBERADO": "#EDCA35",
  "MOSTRUÁRIO": "#EDCA35",
  MOSTRUARIO: "#EDCA35",
  DESENVOLVIMENTO: "#4464AF",
};
function statusColor(s: string) {
  const key = Object.keys(STATUS_COLORS).find(k => s.toUpperCase().includes(k));
  return key ? STATUS_COLORS[key] : "#aaa";
}
function statusLabel(s: string) {
  if (!s) return "";
  const u = s.toUpperCase();
  if (u.includes("REPILOTANDO")) return "REPILOTANDO PROD.";
  if (u.includes("PRODUÇÃO LIBERADA") || u.includes("PRODUCAO LIBERADA")) return "PROD. LIBERADA";
  if (u.includes("MOSTRUÁRIO LIBERADO") || u.includes("MOSTRUARIO LIBERADO")) return "MOST. LIBERADO";
  if (u.includes("MOSTRUÁRIO") || u.includes("MOSTRUARIO")) return "MOSTRUÁRIO";
  if (u.includes("DESENVOLVIMENTO")) return "DESENVOLVIMENTO";
  return s;
}

/* ── Date helpers ── */
const MONTHS_PT = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const MONTHS_SHORT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function parseDate(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s + "T12:00:00");
  return isNaN(d.getTime()) ? null : d;
}
function monthKey(s: string) {
  const d = parseDate(s);
  if (!d) return "9999-99";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function weekOfMonth(s: string): number {
  const d = parseDate(s);
  if (!d) return 1;
  return Math.min(5, Math.ceil(d.getDate() / 7));
}
function weekRangeLabel(monthK: string, week: number): string {
  const [y, m] = monthK.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const start = (week - 1) * 7 + 1;
  const end   = Math.min(week * 7, daysInMonth);
  const ms = MONTHS_SHORT[m - 1];
  return `Semana ${week}  ·  ${String(start).padStart(2,"0")}–${String(end).padStart(2,"0")}/${ms}`;
}
function monthLabel(k: string): string {
  const [y, m] = k.split("-").map(Number);
  return `${MONTHS_PT[m - 1].toUpperCase()}  ${y}`;
}
function fmtDate(s: string): string {
  const d = parseDate(s);
  if (!d) return s;
  return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
}

/* ── Filters ── */
const FILTER_FIELDS = [
  { key: "status",       label: "Status" },
  { key: "colecao",      label: "Coleção" },
  { key: "grupo",        label: "Grupo" },
  { key: "subgrupo",     label: "Subgrupo" },
  { key: "fornecedor",   label: "Fornecedor" },
  { key: "tecido",       label: "Tecido" },
  { key: "forn_tecido",  label: "Forn. Tecido" },
  { key: "operacao",     label: "Operação" },
  { key: "categoria",    label: "Categoria" },
  { key: "subcategoria", label: "Subcategoria" },
  { key: "tipo",         label: "Tipo" },
  { key: "linha",        label: "Linha" },
  { key: "drop",         label: "Drop" },
  { key: "estilista",    label: "Estilista" },
];

/* ── MultiSelect (reused) ── */
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
        background: active ? "var(--system-blue)" : "var(--bg-secondary)",
        borderColor: active ? "var(--system-blue)" : "var(--separator)",
        color: active ? "#fff" : "var(--label-secondary)", fontWeight: active ? 600 : 400,
      }}>
        {label}{active ? ` (${selected.length})` : ""}
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
          style={{ transform: open ? "rotate(180deg)" : "none" }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 1000,
          background: "var(--bg-primary)", border: "1px solid var(--separator)",
          borderRadius: 10, boxShadow: "0 8px 28px rgba(0,0,0,0.15)",
          minWidth: 220, maxWidth: 300, padding: "6px 0",
        }}>
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

/* ── Entry Card ── */
function fotosDe(item: any, imageMode: "desenho" | "foto"): string[] {
  if (imageMode === "foto" && item.imagem_frente && item.imagem_costas) return [item.imagem_frente, item.imagem_costas];
  const s = imageMode === "foto" ? (item.imagem_frente || item.imagem_modelo || item.imagem_url) : item.imagem_url;
  return s ? [s] : [];
}

function EntregaCard({ item, imageMode, onClick }: { item: any; imageMode: "desenho" | "foto"; onClick: () => void }) {
  const fotos = fotosDe(item, imageMode);
  const totalQtd = item.variantes.reduce((s: number, v: any) => s + (v.qtd || 0), 0);

  // Group variants by pedido to show pedido info
  const pedidos = Array.from(new Set(item.variantes.map((v: any) => v.pedido).filter(Boolean))) as string[];

  // Selo do topo: se algum pedido deste card tiver laudo de pré-produção com
  // status, mostra esse status no lugar do status geral do produto.
  const statusPPCard = pedidos.map(p => statusPPDoPedido(item, p)).find(Boolean) || "";
  const ppColor = statusPPCard ? STATUS_PRE_PRODUCAO_COLORS[statusPPCard]?.color : undefined;
  const sColor = ppColor || statusColor(item.status);
  const sLabel = statusPPCard || statusLabel(item.status);

  return (
    <div onClick={onClick} style={{
      background: "var(--bg-primary)", border: "1px solid var(--separator)",
      borderRadius: 12, overflow: "hidden", cursor: "zoom-in",
      transition: "box-shadow .15s, transform .15s",
      boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
      display: "flex", flexDirection: "column",
      borderTop: `3px solid ${sColor}`,
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 6px 20px rgba(0,0,0,0.13)"; (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 1px 4px rgba(0,0,0,0.07)"; (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)"; }}
    >
      {/* Imagem */}
      <div style={{ position: "relative", width: "100%", aspectRatio: "4/3", background: "#f8f8fa", display: "flex", alignItems: "center", justifyContent: "center", gap: 4, overflow: "hidden" }}>
        <TecidoSwatch url={item.tecido_imagem} nome={item.tecido} />
        {fotos.length ? (
          fotos.map((u, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={u} alt={item.ref} style={{ width: fotos.length > 1 ? "50%" : "100%", height: "100%", objectFit: "contain" }} />
          ))
        ) : (
          <div style={{ textAlign: "center", color: "var(--label-tertiary)" }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" style={{ opacity: 0.3 }}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          </div>
        )}
      </div>

      <div style={{ padding: "10px 12px 12px", flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
        {/* Ref + status */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
          <span style={{ fontWeight: 800, fontSize: 11, color: "var(--label-primary)" }}>{item.ref}</span>
          <span style={{
            fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 20,
            background: sColor + "22", color: sColor, whiteSpace: "nowrap",
          }}>{sLabel}</span>
        </div>

        {/* Desc */}
        <div style={{ fontSize: 12, color: "var(--label-primary)", lineHeight: 1.35,
          overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
          {item.desc}
        </div>

        {/* Tecido */}
        {(item.tecido || item.composicao) && (
          <div style={{ fontSize: 10, color: "var(--label-secondary)", lineHeight: 1.4 }}>
            {[item.tecido, item.composicao].filter(Boolean).join("  ·  ")}
          </div>
        )}
        {item.forn_tecido && <div style={{ fontSize: 10, color: "var(--label-tertiary)" }}>{item.forn_tecido}</div>}
        {item.fornecedor && <div style={{ fontSize: 10, color: "var(--system-blue)", fontWeight: 600, marginTop: 1 }}>{item.fornecedor}</div>}

        {/* Pedido(s) */}
        {pedidos.length > 0 && (
          <div style={{ fontSize: 10, color: "var(--label-tertiary)", marginTop: 1 }}>
            Ped. {pedidos.map((p, i) => {
              const st = statusPPDoPedido(item, p);
              return (
                <span key={p}>
                  {i > 0 && ", "}{p}
                  {st && <span style={{ color: STATUS_PRE_PRODUCAO_COLORS[st]?.color, fontWeight: 700 }}> ({st})</span>}
                </span>
              );
            })} · {totalQtd} un.
          </div>
        )}
        {pedidos.length === 0 && totalQtd > 0 && (
          <div style={{ fontSize: 10, color: "var(--label-tertiary)", marginTop: 1 }}>{totalQtd} un.</div>
        )}

        {/* Variantes */}
        {item.variantes.length > 0 && (
          <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--separator)", display: "flex", flexDirection: "column", gap: 3 }}>
            {item.variantes.map((v: any, i: number) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{
                  fontSize: 9, padding: "1px 6px", borderRadius: 3,
                  border: "1px solid var(--separator)", color: "var(--label-secondary)",
                  background: "var(--bg-secondary)", fontWeight: 600, whiteSpace: "nowrap",
                }}>{v.cor}</span>
                <span style={{ fontSize: 10, color: "var(--label-secondary)", whiteSpace: "nowrap" }}>
                  {v.qtd} un.{v.pedido ? ` · Ped. ${v.pedido}` : ""}
                  {v.pedido && statusPPDoPedido(item, v.pedido) && (
                    <span style={{ color: STATUS_PRE_PRODUCAO_COLORS[statusPPDoPedido(item, v.pedido)]?.color, fontWeight: 700 }}> ({statusPPDoPedido(item, v.pedido)})</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Main ── */
export default function MapaEntregasView() {
  const [items, setItems]           = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [filters, setFilters]       = useState<Record<string, string[]>>({});
  const [search, setSearch]         = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [imageMode, setImageMode]   = useState<"desenho" | "foto">("desenho");
  const [zoom, setZoom]             = useState<any>(null);
  const [collapsed, setCollapsed]   = useState<Set<string>>(new Set());
  const [exporting, setExporting]   = useState(false);

  useEffect(() => {
    fetchMapaEntregas().then(data => { setItems(data); setLoading(false); });
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setZoom(null); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const setFilter = (key: string, vals: string[]) => setFilters(prev => ({ ...prev, [key]: vals }));

  const optionsFor = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const f of FILTER_FIELDS)
      map[f.key] = Array.from(new Set(items.map(i => i[f.key] || "").filter(Boolean))).sort();
    return map;
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return items.filter(i => {
      if (q) {
        const hay = `${i.ref} ${i.desc} ${i.tecido} ${i.fornecedor} ${i.colecao} ${i.status}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      for (const [key, vals] of Object.entries(filters)) {
        if (!vals.length) continue;
        if (!vals.includes(i[key] || "")) return false;
      }
      return true;
    });
  }, [items, filters, search]);

  const activeCount = Object.values(filters).filter(v => v.length > 0).length;

  /* Group: month → week → entries */
  const months = useMemo(() => {
    const mMap = new Map<string, Map<number, any[]>>();
    for (const it of filtered) {
      const mk = monthKey(it.data_entrega);
      const wk = weekOfMonth(it.data_entrega);
      if (!mMap.has(mk)) mMap.set(mk, new Map());
      const wMap = mMap.get(mk)!;
      if (!wMap.has(wk)) wMap.set(wk, []);
      wMap.get(wk)!.push(it);
    }
    return Array.from(mMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mk, wMap]) => ({
        key: mk,
        label: monthLabel(mk),
        weeks: Array.from(wMap.entries())
          .sort(([a], [b]) => a - b)
          .map(([wk, entries]) => ({
            key: `${mk}-w${wk}`,
            label: weekRangeLabel(mk, wk),
            entries,
          })),
      }));
  }, [filtered]);

  const toggleCollapse = (key: string) =>
    setCollapsed(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  if (loading) return (
    <div className="plm-loading"><div className="plm-loading-spinner" /><span>Carregando mapa de entregas...</span></div>
  );

  return (
    <div style={{ padding: "0 0 40px" }}>

      {/* ── Lightbox ── */}
      {zoom && (
        <div onClick={() => setZoom(null)} style={{
          position: "fixed", inset: 0, zIndex: 9999,
          background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: "var(--bg-primary)", borderRadius: 16,
            boxShadow: "0 24px 80px rgba(0,0,0,0.4)",
            maxWidth: 680, width: "90vw", overflow: "hidden",
          }}>
            <div style={{ position: "relative", background: "#fff", padding: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 12, minHeight: 300 }}>
              <TecidoSwatch url={zoom.tecido_imagem} nome={zoom.tecido} size={104} />
              {fotosDe(zoom, imageMode).length ? (
                fotosDe(zoom, imageMode).map((u, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={u} alt={zoom.ref} style={{ maxWidth: fotosDe(zoom, imageMode).length > 1 ? "48%" : "100%", maxHeight: "50vh", objectFit: "contain" }} />
                ))
              ) : (
                <div style={{ color: "var(--label-tertiary)", fontSize: 13 }}>Sem imagem</div>
              )}
            </div>
            <div style={{ padding: "16px 20px 20px", borderTop: "1px solid var(--separator)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 800, fontSize: 13 }}>{zoom.ref}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20,
                      background: statusColor(zoom.status) + "22", color: statusColor(zoom.status) }}>
                      {statusLabel(zoom.status)}
                    </span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{zoom.desc}</div>
                </div>
                <button onClick={() => setZoom(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--label-tertiary)", padding: 4 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 20px", fontSize: 12, marginBottom: 12 }}>
                {zoom.tecido      && <div><span style={{ color: "var(--label-tertiary)" }}>Tecido: </span><span style={{ fontWeight: 500 }}>{zoom.tecido}</span></div>}
                {zoom.composicao  && <div><span style={{ color: "var(--label-tertiary)" }}>Comp.: </span><span>{zoom.composicao}</span></div>}
                {zoom.forn_tecido && <div><span style={{ color: "var(--label-tertiary)" }}>Forn. Tecido: </span><span>{zoom.forn_tecido}</span></div>}
                {zoom.fornecedor  && <div><span style={{ color: "var(--label-tertiary)" }}>Fornecedor: </span><span style={{ color: "var(--system-blue)", fontWeight: 600 }}>{zoom.fornecedor}</span></div>}
                {zoom.colecao     && <div><span style={{ color: "var(--label-tertiary)" }}>Coleção: </span><span>{zoom.colecao}</span></div>}
                {zoom.grupo       && <div><span style={{ color: "var(--label-tertiary)" }}>Grupo: </span><span>{zoom.grupo}</span></div>}
                <div><span style={{ color: "var(--label-tertiary)" }}>Entrega: </span><span style={{ fontWeight: 600 }}>{fmtDate(zoom.data_entrega)}</span></div>
                <div><span style={{ color: "var(--label-tertiary)" }}>Compra: </span><span>{zoom.compra_num}ª</span></div>
              </div>
              {zoom.variantes.length > 0 && (
                <div style={{ borderTop: "1px solid var(--separator)", paddingTop: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--label-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 7 }}>Variantes</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {zoom.variantes.map((v: any, i: number) => (
                      <div key={i} style={{
                        padding: "4px 10px", borderRadius: 6,
                        background: "var(--bg-secondary)", border: "1px solid var(--separator)",
                        fontSize: 12,
                      }}>
                        <span style={{ fontWeight: 700 }}>{v.cor}</span>
                        <span style={{ color: "var(--label-secondary)" }}> — {v.qtd} un.</span>
                        {v.pedido && <span style={{ color: "var(--label-tertiary)" }}> · Ped. {v.pedido}</span>}
                        {v.pedido && statusPPDoPedido(zoom, v.pedido) && (
                          <span style={{ color: STATUS_PRE_PRODUCAO_COLORS[statusPPDoPedido(zoom, v.pedido)]?.color, fontWeight: 700 }}> ({statusPPDoPedido(zoom, v.pedido)})</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Toolbar ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        marginBottom: filtersOpen ? 0 : 16, padding: "12px 0",
        borderBottom: filtersOpen ? "none" : "1px solid var(--separator)",
      }}>

        {/* Search */}
        <div style={{ position: "relative" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--label-tertiary)" strokeWidth="2.2" strokeLinecap="round"
            style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar…"
            style={{ fontSize: 12, padding: "5px 10px 5px 28px", borderRadius: 7, border: "1px solid var(--separator)",
              background: "var(--bg-secondary)", color: "var(--label-primary)", outline: "none", width: 180 }} />
        </div>

        <div style={{ width: 1, height: 24, background: "var(--separator)" }} />

        <div style={{ display: "flex", background: "var(--bg-secondary)", borderRadius: 8, border: "1px solid var(--separator)", padding: 2, gap: 2 }}>
          {(["desenho", "foto"] as const).map(mode => (
            <button key={mode} onClick={() => setImageMode(mode)} style={{
              fontSize: 12, fontWeight: 600, padding: "5px 14px", borderRadius: 6, border: "none",
              cursor: "pointer", transition: "all .15s",
              background: imageMode === mode ? "var(--bg-primary)" : "transparent",
              color: imageMode === mode ? "var(--system-blue)" : "var(--label-tertiary)",
              boxShadow: imageMode === mode ? "0 1px 4px rgba(0,0,0,0.10)" : "none",
            }}>
              {mode === "desenho" ? "✏️ Desenho" : "📷 Foto"}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 24, background: "var(--separator)" }} />

        <button onClick={() => setFiltersOpen(o => !o)} style={{
          display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600,
          padding: "5px 12px", borderRadius: 7, border: "1px solid", cursor: "pointer",
          background: activeCount > 0 ? "var(--system-blue)" : "var(--bg-secondary)",
          borderColor: activeCount > 0 ? "var(--system-blue)" : "var(--separator)",
          color: activeCount > 0 ? "#fff" : "var(--label-secondary)",
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
          Filtros{activeCount > 0 ? ` (${activeCount})` : ""}
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
            style={{ transform: filtersOpen ? "rotate(180deg)" : "none" }}>
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>

        {(activeCount > 0 || search) && (
          <button className="apple-btn-secondary" onClick={() => { setFilters({}); setSearch(""); }} style={{ fontSize: 12, padding: "5px 10px" }}>
            Limpar tudo
          </button>
        )}

        <span style={{ fontSize: 12, color: "var(--label-tertiary)", marginLeft: 4 }}>
          {filtered.length} entrega{filtered.length !== 1 ? "s" : ""} · {months.length} mês/meses
        </span>

        <div style={{ marginLeft: "auto" }}>
          <button
            className="apple-btn-primary"
            disabled={filtered.length === 0 || exporting}
            onClick={async () => {
              setExporting(true);
              try {
                const activeFilters: Record<string, string[]> = {};
                for (const [k, v] of Object.entries(filters)) if (v.length > 0) activeFilters[k] = v;
                await exportMapaEntregasPDF(filtered, activeFilters, imageMode, "mapa-entregas");
              } finally { setExporting(false); }
            }}
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, padding: "5px 14px" }}
          >
            {exporting ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                style={{ animation: "spin 1s linear infinite" }}>
                <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/><path d="M22 12a10 10 0 01-10 10"/>
              </svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            )}
            {exporting ? "Gerando PDF…" : "Exportar PDF"}
          </button>
        </div>
      </div>

      {/* ── Filter panel ── */}
      {filtersOpen && (
        <div style={{
          padding: "14px 16px", marginBottom: 16,
          background: "var(--bg-secondary)", borderRadius: "0 0 10px 10px",
          border: "1px solid var(--separator)", borderTop: "none",
        }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {FILTER_FIELDS.map(f => (
              <MultiSelect key={f.key} label={f.label} options={optionsFor[f.key] || []}
                selected={filters[f.key] || []} onChange={vals => setFilter(f.key, vals)} />
            ))}
          </div>
        </div>
      )}

      {/* ── Content ── */}
      {months.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--label-tertiary)", fontSize: 14 }}>
          Nenhuma entrega encontrada. Preencha as datas de entrega em Compras → Variantes.
        </div>
      ) : months.map(month => {
        const mCollapsed = collapsed.has(month.key);
        const totalEntries = month.weeks.reduce((s, w) => s + w.entries.length, 0);
        return (
          <div key={month.key} style={{ marginBottom: 40 }}>

            {/* Month header */}
            <div
              onClick={() => toggleCollapse(month.key)}
              style={{
                display: "flex", alignItems: "center", gap: 12, cursor: "pointer",
                background: "linear-gradient(135deg, #13131f 0%, #1e1e35 100%)",
                borderRadius: 10, padding: "12px 18px", marginBottom: mCollapsed ? 0 : 20,
                userSelect: "none",
              }}
            >
              <span style={{ fontWeight: 800, fontSize: 15, color: "#fff", letterSpacing: "0.08em" }}>{month.label}</span>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>
                · {totalEntries} produto{totalEntries !== 1 ? "s" : ""} · {month.weeks.length} semana{month.weeks.length !== 1 ? "s" : ""}
              </span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2.5" strokeLinecap="round"
                style={{ marginLeft: "auto", transform: mCollapsed ? "rotate(-90deg)" : "none", transition: "transform .2s" }}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>

            {!mCollapsed && month.weeks.map(week => {
              const wCollapsed = collapsed.has(week.key);
              return (
                <div key={week.key} style={{ marginBottom: 24, paddingLeft: 4 }}>

                  {/* Week header */}
                  <div
                    onClick={() => toggleCollapse(week.key)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
                      background: "var(--bg-secondary)", borderLeft: "3px solid var(--system-blue)",
                      borderRadius: "0 6px 6px 0", padding: "7px 14px", marginBottom: wCollapsed ? 0 : 14,
                      userSelect: "none",
                    }}
                  >
                    <span style={{ fontWeight: 700, fontSize: 12, color: "var(--label-primary)", letterSpacing: "0.04em" }}>
                      {week.label}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--label-tertiary)" }}>
                      · {week.entries.length} produto{week.entries.length !== 1 ? "s" : ""}
                    </span>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--label-tertiary)" strokeWidth="2.5" strokeLinecap="round"
                      style={{ marginLeft: "auto", transform: wCollapsed ? "rotate(-90deg)" : "none", transition: "transform .2s" }}>
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </div>

                  {!wCollapsed && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
                      {week.entries.map((item, idx) => (
                        <EntregaCard key={`${item.ref}-${item.data_entrega}-${idx}`} item={item} imageMode={imageMode} onClick={() => setZoom(item)} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
