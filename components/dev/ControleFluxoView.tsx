"use client";
import { useEffect, useMemo, useState } from "react";
import COLUMNS from "@/lib/columns";
import { fetchControleFluxo, upsertControleFluxo, FLUXO_MOSTRUARIO_LIBERADO, FLUXO_AGUARDANDO_MOSTRUARIO } from "@/lib/db";
import ScrollTable from "@/components/ui/ScrollTable";
import { useToast } from "@/components/ui/Toast";

const PILOTAGEM_COLS = [
  { field: "data_desenvolvimento",  label: "Data Desenv.",         type: "date", width: 140 },
  { field: "prev_entrega_piloto",   label: "Prev. Entrega Piloto", type: "date", width: 140 },
  { field: "status_mostruario",     label: "Status Mostruário",    type: "select", width: 200,
    options: ["","AGUARDANDO PILOTO","PILOTO RECEBIDA - AGUARDANDO PROVA","MOSTRUÁRIO LIBERADO","INCLUÍDO DIRETO P/ MOSTRUÁRIO"] },
  { field: "data_entrega_piloto",   label: "Data Entrega Piloto",  type: "date", width: 140 },
  { field: "data_prova_piloto",     label: "Data Prova Piloto",    type: "date", width: 130 },
  { field: "data_retorno_laudo_forn", label: "Retorno Laudo Forn.", type: "date", width: 140 },
  { field: "prev_entrega_mostruario", label: "Prev. Entrega Mostruário", type: "date", width: 150 },
];

const PRODUCAO_COLS = [
  { field: "status_producao",          label: "Status Produção",         type: "select", width: 260,
    options: ["","AGUARDANDO MOSTRUÁRIO","MOSTRUÁRIO RECEBIDO - AGUARDANDO PROVA DE PRODUÇÃO","PRODUÇÃO REPROVADA - AGUARDANDO REPILOTAGEM","PRODUÇÃO LIBERADA"] },
  { field: "data_entrega_mostruario",  label: "Data Entrega Mostruário", type: "date", width: 150 },
  { field: "data_prova_producao_1",    label: "Data Prova Produção 1",   type: "date", width: 140 },
  { field: "data_retorno_laudo_forn_1",label: "Retorno Laudo Forn. 1",   type: "date", width: 140 },
  { field: "data_entrega_repilotagem", label: "Data Entrega Repilotagem",type: "date", width: 150 },
  { field: "data_prova_producao_2",    label: "Data Prova Produção 2",   type: "date", width: 140 },
  { field: "data_retorno_laudo_forn_2",label: "Retorno Laudo Forn. 2",   type: "date", width: 140 },
];

const PRE_PRODUCAO_COLS = [
  { field: "data_entrega_pre_producao", label: "Data Entrega Pré-Prod.",  type: "date", width: 150 },
  { field: "data_retorno_pre_producao", label: "Data Retorno Pré-Prod.",  type: "date", width: 150 },
  { field: "status_pre_producao",       label: "Status Pré-Produção",     type: "select", width: 200,
    options: ["","LIBERADA","LIBERADA COM RESTRIÇÃO","REPROVADA - CORRIGIR","REPROVADA - NEGOCIAR"] },
];

const STATUS_COLORS: Record<string, string> = {
  "AGUARDANDO PILOTO": "#3b82f6",
  "PILOTO RECEBIDA - AGUARDANDO PROVA": "#f97316",
  "MOSTRUÁRIO LIBERADO": "#22c55e",
  "INCLUÍDO DIRETO P/ MOSTRUÁRIO": "#a855f7",
  "AGUARDANDO MOSTRUÁRIO": "#3b82f6",
  "MOSTRUÁRIO RECEBIDO - AGUARDANDO PROVA DE PRODUÇÃO": "#f97316",
  "PRODUÇÃO REPROVADA - AGUARDANDO REPILOTAGEM": "#ef4444",
  "PRODUÇÃO LIBERADA": "#22c55e",
  "LIBERADA": "#22c55e",
  "LIBERADA COM RESTRIÇÃO": "#f97316",
  "REPROVADA - CORRIGIR": "#ef4444",
  "REPROVADA - NEGOCIAR": "#ef4444",
};

function fmtDate(v: string) {
  if (!v) return "";
  return v.includes("T") ? v.split("T")[0] : v;
}

// Mesmos filtros do Desenvolvimento: selects de cadastro (menos coleção,
// que vira o seletor de pílulas no topo).
const FC = COLUMNS.filter(c => c.type === "select" && c.cad && c.key !== "colecao");
const FILTERS_KEY = "plm_filters_fluxo";

interface Props { rows: any[] }

export default function ControleFluxoView({ rows }: Props) {
  const [fluxoMap, setFluxoMap] = useState<Record<string, any>>({});
  const [localData, setLocalData] = useState<Record<string, Record<string, string>>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchControleFluxo().then(data => {
      const m: Record<string, any> = {};
      data.forEach(r => { m[r.produto_ref] = r; });
      setFluxoMap(m);
      setLoading(false);
    });
  }, []);

  const { error: showError, Container: ToastContainer } = useToast();

  const val = (ref: string, field: string) =>
    localData[ref]?.[field] !== undefined ? localData[ref][field] : fmtDate(fluxoMap[ref]?.[field] ?? "");

  const handleChange = async (ref: string, field: string, value: string) => {
    const prevValue = val(ref, field);
    setLocalData(prev => ({ ...prev, [ref]: { ...(prev[ref] || {}), [field]: value } }));
    const err = await upsertControleFluxo(ref, field, value || null);
    if (err) {
      showError(`Erro ao salvar: ${err}`);
      setLocalData(prev => ({ ...prev, [ref]: { ...(prev[ref] || {}), [field]: prevValue } }));
      return;
    }
    // Mostruário liberado puxa a produção para "aguardando mostruário" — o
    // passo seguinte do fluxo, que antes era digitado a mão em toda linha.
    // Só preenche quando está vazio: sobrescrever levaria um SKU já em
    // "PRODUÇÃO LIBERADA" de volta, apagando o andamento.
    if (field === "status_mostruario" && value === FLUXO_MOSTRUARIO_LIBERADO) {
      const atual = val(ref, "status_producao");
      if (!atual) {
        const err2 = await upsertControleFluxo(ref, "status_producao", FLUXO_AGUARDANDO_MOSTRUARIO);
        if (!err2) setLocalData(prev => ({ ...prev, [ref]: { ...(prev[ref] || {}), status_producao: FLUXO_AGUARDANDO_MOSTRUARIO } }));
      }
    }
  };

  const saved = (() => {
    if (typeof window === "undefined") return {};
    try { return JSON.parse(localStorage.getItem(FILTERS_KEY) || "{}"); } catch { return {}; }
  })();
  const [search, setSearch] = useState<string>(saved.q || "");
  const [fl, setFl] = useState<Record<string, string>>(saved.fl || {});
  const [colecaoAtiva, setColecaoAtiva] = useState<string | null>(saved.colecaoAtiva || null);
  const [sf, setSf] = useState(false);
  const ac = Object.values(fl).filter(Boolean).length;

  useEffect(() => {
    try { localStorage.setItem(FILTERS_KEY, JSON.stringify({ q: search, fl, colecaoAtiva })); } catch {}
  }, [search, fl, colecaoAtiva]);

  const colecoes = useMemo(() => Array.from(new Set(rows.map((r: any) => r.colecao).filter(Boolean))).sort((a, b) => String(b).localeCompare(String(a), "pt-BR", { numeric: true })) as string[], [rows]);
  const uv = (k: string): string[] => Array.from(new Set(rows.map((r: any) => r[k]).filter(Boolean))).sort() as string[];
  const sf2 = (k: string, v: string) => setFl(p => { const n = { ...p }; if (v) n[k] = v; else delete n[k]; return n; });

  let filtrados = rows;
  if (colecaoAtiva) filtrados = filtrados.filter((x: any) => x.colecao === colecaoAtiva);
  Object.entries(fl).forEach(([k, v]) => { if (v) filtrados = filtrados.filter((x: any) => x[k] === v); });
  if (search) {
    const q = search.toLowerCase();
    filtrados = filtrados.filter((x: any) => [x.ref, x.desc, x.descricao, x.tecido, x.composicao, x.fornecedor, x.forn_tecido, x.estilista, x.tab_medidas].map(v => v || "").join(" ").toLowerCase().includes(q));
  }
  const sorted = [...filtrados].sort((a, b) => (a.ref || "").localeCompare(b.ref || ""));
  const allCols = [...PILOTAGEM_COLS, ...PRODUCAO_COLS, ...PRE_PRODUCAO_COLS];

  const stickyStyle = (left: number): React.CSSProperties => ({
    position: "sticky", left, zIndex: 2, background: "var(--bg-primary)",
  });

  if (loading) return (
    <div className="plm-loading"><div className="plm-loading-spinner" /><span>Carregando...</span></div>
  );

  return (
    <div>
      {colecoes.length > 0 && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--label-tertiary)] mr-1">Coleção</span>
          <button
            onClick={() => setColecaoAtiva(null)}
            className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-all border ${colecaoAtiva === null ? "bg-[var(--label-primary)] text-[var(--bg-primary)] border-[var(--label-primary)]" : "bg-transparent text-[var(--label-secondary)] border-[var(--separator)] hover:border-[var(--label-tertiary)]"}`}
          >
            Todas
          </button>
          {colecoes.map(col => (
            <button
              key={col}
              onClick={() => setColecaoAtiva(col === colecaoAtiva ? null : col)}
              className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-all border ${colecaoAtiva === col ? "bg-[var(--system-blue)] text-white border-[var(--system-blue)]" : "bg-transparent text-[var(--label-secondary)] border-[var(--separator)] hover:border-[var(--system-blue)] hover:text-[var(--system-blue)]"}`}
            >
              {col}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2 mb-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-0 sm:min-w-[240px]">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--label-tertiary)] pointer-events-none" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" placeholder="Buscar referência, descrição, tecido, fornecedor..." value={search} onChange={e => setSearch(e.target.value)} className="apple-input w-full !pl-10 pr-3"/>
        </div>
        <button onClick={() => setSf(!sf)} className={`apple-input flex items-center gap-2 cursor-pointer transition-all ${sf || ac > 0 ? "!border-[var(--system-blue)] !bg-blue-50 text-[var(--system-blue)] font-semibold" : ""}`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/></svg>
          Filtros{ac > 0 && <span className="bg-[var(--system-blue)] text-white text-[10px] font-bold w-[18px] h-[18px] rounded-full flex items-center justify-center">{ac}</span>}
        </button>
        <span style={{ fontSize: 12, color: "var(--label-secondary)", fontWeight: 500 }}>
          {sorted.length} produto(s){(ac > 0 || search || colecaoAtiva) ? ` de ${rows.length}` : ""}
        </span>
      </div>

      {sf && (
        <div className="apple-card p-4 mb-4 bg-[var(--bg-secondary)]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--label-secondary)]">Filtrar por</span>
            {ac > 0 && <button onClick={() => { setFl({}); setSearch(""); }} className="text-[12px] text-[var(--system-blue)] font-medium">Limpar todos</button>}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
            {FC.map(c => (
              <div key={c.key}>
                <label className="text-[11px] text-[var(--label-secondary)] mb-1 block font-medium">{c.label}</label>
                <select value={fl[c.key] || ""} onChange={e => sf2(c.key, e.target.value)} className={`apple-select w-full text-[12px] py-1.5 ${fl[c.key] ? "!border-[var(--system-blue)] !bg-blue-50/60 text-[var(--system-blue)] font-semibold" : ""}`}>
                  <option value="">Todos</option>
                  {uv(c.key).map(v => <option key={v}>{v}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {ac > 0 && !sf && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {Object.entries(fl).map(([k, v]) => {
            if (!v) return null;
            const c = COLUMNS.find(x => x.key === k);
            return (
              <span key={k} className="inline-flex items-center gap-1 bg-blue-50 text-[var(--system-blue)] rounded-lg px-2.5 py-1 text-[12px] font-medium">
                <span className="text-blue-300">{c?.label}:</span>{v}
                <button onClick={() => sf2(k, "")} className="ml-0.5 text-blue-300 hover:text-[var(--system-blue)]">×</button>
              </span>
            );
          })}
          <button onClick={() => { setFl({}); setSearch(""); }} className="text-[12px] text-[var(--label-tertiary)] px-2 py-1">Limpar</button>
        </div>
      )}
      <ScrollTable maxHeight="calc(100vh - 180px)">
      <table className="plm-table" style={{ minWidth: 2200, borderCollapse: "collapse" }}>
        <thead>
          {/* Group header row */}
          <tr>
            <th colSpan={3} style={{ ...stickyStyle(0), background: "var(--bg-secondary)", borderBottom: "2px solid var(--separator)" }} />
            <th colSpan={PILOTAGEM_COLS.length}
              style={{ background: "#dbeafe", color: "#1d4ed8", textAlign: "center", fontWeight: 700, fontSize: 11, letterSpacing: ".05em", borderBottom: "2px solid #93c5fd" }}>
              PILOTAGEM
            </th>
            <th colSpan={PRODUCAO_COLS.length}
              style={{ background: "#dcfce7", color: "#15803d", textAlign: "center", fontWeight: 700, fontSize: 11, letterSpacing: ".05em", borderBottom: "2px solid #86efac" }}>
              PRODUÇÃO
            </th>
            <th colSpan={PRE_PRODUCAO_COLS.length}
              style={{ background: "#f3e8ff", color: "#7e22ce", textAlign: "center", fontWeight: 700, fontSize: 11, letterSpacing: ".05em", borderBottom: "2px solid #d8b4fe" }}>
              PRÉ-PRODUÇÃO
            </th>
          </tr>
          {/* Column headers */}
          <tr>
            <th style={{ ...stickyStyle(0), width: 110, minWidth: 110 }}>Referência</th>
            <th style={{ ...stickyStyle(110), width: 200, minWidth: 200 }}>Descrição</th>
            <th style={{ ...stickyStyle(310), width: 130, minWidth: 130, borderRight: "2px solid var(--separator)" }}>Fornecedor</th>
            {PILOTAGEM_COLS.map(c => (
              <th key={c.field} style={{ minWidth: c.width, background: "#f0f9ff", fontSize: 11, color: "#1d4ed8" }}>{c.label}</th>
            ))}
            {PRODUCAO_COLS.map(c => (
              <th key={c.field} style={{ minWidth: c.width, background: "#f0fdf4", fontSize: 11, color: "#15803d" }}>{c.label}</th>
            ))}
            {PRE_PRODUCAO_COLS.map(c => (
              <th key={c.field} style={{ minWidth: c.width, background: "#faf5ff", fontSize: 11, color: "#7e22ce" }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map(row => (
            <tr key={row.ref}>
              <td style={{ ...stickyStyle(0), fontWeight: 600, fontSize: 12 }}>{row.ref}</td>
              <td style={{ ...stickyStyle(110), fontSize: 12 }}>{row.descricao || row.desc || ""}</td>
              <td style={{ ...stickyStyle(310), fontSize: 12, borderRight: "2px solid var(--separator)" }}>{row.fornecedor || ""}</td>
              {allCols.map(col => {
                const v = val(row.ref, col.field);
                if (col.type === "date") {
                  return (
                    <td key={col.field} style={{ padding: "4px 6px" }}>
                      <input
                        type="date"
                        className="apple-input"
                        style={{ fontSize: 12, padding: "4px 6px", width: "100%", minWidth: col.width - 12 }}
                        value={v}
                        onChange={e => handleChange(row.ref, col.field, e.target.value)}
                      />
                    </td>
                  );
                }
                // select
                const color = STATUS_COLORS[v];
                return (
                  <td key={col.field} style={{ padding: "4px 6px" }}>
                    <select
                      className="apple-select"
                      style={{
                        fontSize: 11, width: "100%", minWidth: col.width - 12,
                        background: color ? color + "22" : undefined,
                        color: color || undefined,
                        fontWeight: color ? 600 : undefined,
                        borderColor: color ? color + "66" : undefined,
                      }}
                      value={v}
                      onChange={e => handleChange(row.ref, col.field, e.target.value)}
                    >
                      {(col as any).options.map((o: string) => (
                        <option key={o} value={o}>{o || "—"}</option>
                      ))}
                    </select>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      </ScrollTable>
      <ToastContainer />
    </div>
  );
}
