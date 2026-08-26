"use client";
import { useState, useMemo, useEffect, useRef } from "react";
import InlineCell from "@/components/ui/InlineCell";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import COLUMNS from "@/lib/columns";
import { fetchCadastros, fetchTecidos, fetchNomesTabelasMedidas, updateProdutoField, insertProduto, deleteProduto, cloneProduto, bulkUpdateStatus, criarAlerta } from "@/lib/db";
import { useAuth } from "@/lib/auth-context";
import { exportToExcel, fmtExcelDate } from "@/lib/export-excel";
import { STATUS_ESTILO, STATUS_COMPRAS_OPTS } from "@/lib/constants";
import { fmtBRL, nomeUsuario } from "@/lib/utils";

// Status em que qualquer alteração dispara o popup de alerta pros outros usuários.
const STATUS_ALERTA = [STATUS_ESTILO.MOSTARIO_LIBERADO, STATUS_ESTILO.PRODUCAO_LIBERADA, STATUS_ESTILO.REPILOTANDO_PRODUCAO] as string[];
import ScrollTable from "@/components/ui/ScrollTable";

// "2026-03-13" -> "13/03/26" (compacto para a lista de pedidos)
function fmtDataBR(iso?: string): string {
  if (!iso) return "";
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : String(iso);
}

type Props = { rows: any[]; setRows: (fn: any) => void; onOpenFicha: (row: any) => void; userEmail?: string; readOnly?: boolean; permPrefix?: string; hiddenColumns?: string[] };
const FC = COLUMNS.filter(c => c.type === "select" && c.cad && c.key !== "colecao");
const ALWAYS_VISIBLE = ["ref"];

// ── Colunas de status exclusivas de Compras ───────────────────────────────
const STATUS_PRECO_OPTS = ["SEM CUSTO","CUSTO SOLICITADO","EM NEGOCIAÇÃO","CUSTO FECHADO"];
const SP_PRECO_STYLE: Record<string,{bg:string;color:string}> = {
  "SEM CUSTO":         {bg:"rgba(142,142,147,0.15)",color:"var(--label-secondary)"},
  "CUSTO SOLICITADO":  {bg:"rgba(255,149,0,0.15)",  color:"#b86a00"},
  "EM NEGOCIAÇÃO":     {bg:"rgba(0,122,255,0.12)",  color:"var(--system-blue)"},
  "CUSTO FECHADO":     {bg:"rgba(52,199,89,0.15)",  color:"#1a7a35"},
};
const SP_COMPRAS_STYLE: Record<string,{bg:string;color:string}> = {
  "PEDIDO MOST. COLOCADO":     {bg:"rgba(255,149,0,0.12)",  color:"#b86a00"},
  "MOSTRUÁRIO ENTREGUE":       {bg:"rgba(90,120,255,0.12)", color:"#3a4ec4"},
  "PED. DE PRODUÇÃO COLOCADO": {bg:"rgba(175,82,222,0.12)", color:"#7c2eaa"},
  "PRODUÇÃO ENTREGUE":         {bg:"rgba(52,199,89,0.15)",  color:"#1a7a35"},
};
const COMPRAS_STATUS_COLS = [
  {key:"status_preco",   label:"Status Preço",   width:165, opts:STATUS_PRECO_OPTS,   styles:SP_PRECO_STYLE},
  {key:"status_compras", label:"Status Compras", width:210, opts:STATUS_COMPRAS_OPTS, styles:SP_COMPRAS_STYLE},
];

// ── Colunas financeiras exclusivas de Compras ──────────────────────────────
const PRICE_COLS = [
  { key: "custo_inicial",   label: "Custo inicial",    width: 115, computed: false },
  { key: "markup_inicial",  label: "Markup inicial",   width: 115, computed: false },
  { key: "_varejo_ini",     label: "$ Varejo inicial", width: 125, computed: true  },
  { key: "preco_target",    label: "$ Target",         width: 105, computed: false },
  { key: "_markup_target",  label: "Markup target",    width: 115, computed: true  },
  { key: "custo_final",     label: "Custo final",      width: 105, computed: false },
  { key: "_markup_final",   label: "Markup final",     width: 110, computed: true  },
  { key: "varejo_final",    label: "$ Varejo final",   width: 120, computed: false },
];
const MULT_KEYS = new Set(["markup_inicial", "_markup_target", "_markup_final"]);

function getPriceVal(key: string, row: any): number | null {
  const n = (k: string) => { const v = parseFloat(row[k]); return isNaN(v) || row[k] == null ? null : v; };
  if (key === "_varejo_ini")    { const c = n("custo_inicial"),  m = n("markup_inicial"); return c !== null && m !== null ? c * m : null; }
  if (key === "_markup_target") { const t = n("preco_target"),   c = n("custo_inicial");  return t !== null && c !== null && c > 0 ? t / c : null; }
  if (key === "_markup_final")  { const v = n("varejo_final"),   c = n("custo_final");    return v !== null && c !== null && c > 0 ? v / c : null; }
  return n(key);
}

export default function DevTable({ rows, setRows, onOpenFicha, userEmail, readOnly = false, permPrefix = "", hiddenColumns = [] }: Props) {
  const { user } = useAuth();
  const isAdmin = user?.app_metadata?.role === "admin";
  const perms: Record<string, boolean> = user?.app_metadata?.permissions || {};
  const canEdit   = (key: string) => isAdmin || perms[permPrefix + key] === true;
  const canAdd    = isAdmin || perms[permPrefix + "can_add"] === true;
  const canDelete = isAdmin || perms[permPrefix + "can_delete"] === true;

  const colsStorageKey = `plm_cols_${permPrefix || "estilo"}`;
  const filtersKey = `plm_filters_${permPrefix || "estilo"}`;

  const loadFilters = () => {
    if (typeof window === "undefined") return { q: "", fl: {}, colecaoAtiva: null as string | null, sort: null as { key: string; dir: "asc" | "desc" } | null };
    try { return JSON.parse(localStorage.getItem(filtersKey) || "{}"); } catch { return {}; }
  };
  const saved = loadFilters();

  const [cad, setCad] = useState<Record<string, any>>({});
  const [q, setQ] = useState<string>(saved.q || "");
  const [fl, setFl] = useState<Record<string,string>>(saved.fl || {});
  const [sf, setSf] = useState(false);
  const [colecaoAtiva, setColecaoAtiva] = useState<string | null>(saved.colecaoAtiva || null);
  const [dupAlert, setDupAlert] = useState<string|null>(null);
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(saved.sort || null);
  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    try { return JSON.parse(localStorage.getItem(`plm_cols_${permPrefix || "estilo"}`) || "{}"); }
    catch { return {}; }
  });
  const [showColMenu, setShowColMenu] = useState(false);
  const colMenuRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkStatus, setBulkStatus] = useState("");
  const [cloneSource, setCloneSource] = useState<any>(null);
  const [cloneRef, setCloneRef] = useState("");
  const ac = Object.values(fl).filter(Boolean).length;

  // Estoque atual (map ref -> total) e futuro/a receber (map ref -> pendente),
  // ambos do Linx via rota server-side /api/linx/estoque (a chave nunca chega
  // ao browser).
  const [estoqueMap, setEstoqueMap] = useState<Record<string, number> | null>(null);
  const [futuroMap, setFuturoMap] = useState<Record<string, number>>({});
  const [estoqueDetalhe, setEstoqueDetalhe] = useState<import("@/lib/linx-client").EstoqueDetalhe | null>(null);
  const [estoqueDetalheRef, setEstoqueDetalheRef] = useState<string | null>(null);
  const [estoqueDetalheLoading, setEstoqueDetalheLoading] = useState(false);

  useEffect(() => {
    let active = true;
    import("@/lib/linx-client").then(({ fetchEstoqueTotals }) =>
      fetchEstoqueTotals()
        .then(({ totals, futuros }) => { if (active) { setEstoqueMap(totals); setFuturoMap(futuros); } })
        .catch(() => { if (active) setEstoqueMap({}); })
    );
    return () => { active = false; };
  }, []);

  const abrirEstoqueDetalhe = async (ref: string) => {
    setEstoqueDetalheRef(ref);
    setEstoqueDetalhe(null);
    setEstoqueDetalheLoading(true);
    try {
      const { fetchEstoqueDetalhe } = await import("@/lib/linx-client");
      const d = await fetchEstoqueDetalhe(ref);
      setEstoqueDetalhe(d);
    } catch {
      setEstoqueDetalhe(null);
    } finally {
      setEstoqueDetalheLoading(false);
    }
  };

  // Column visibility helpers
  const isColVisible = (key: string) => {
    if (ALWAYS_VISIBLE.includes(key)) return true;
    if (hiddenColumns.includes(key)) return false;
    return visibleCols[key] !== false;
  };
  const toggleCol = (key: string) => setVisibleCols(p => ({ ...p, [key]: !isColVisible(key) }));
  const toggleableCols = [
    ...COLUMNS.filter(c => !ALWAYS_VISIBLE.includes(c.key) && !hiddenColumns.includes(c.key)),
    ...(permPrefix === "compras_" ? [...COMPRAS_STATUS_COLS, ...PRICE_COLS] : []),
  ];
  const hiddenCount = toggleableCols.filter(c => !isColVisible(c.key)).length;

  const toggleSort = (k: string) => {
    setSort(prev => {
      if (!prev || prev.key !== k) return { key: k, dir: "asc" };
      if (prev.dir === "asc") return { key: k, dir: "desc" };
      return null; // terceiro clique: remove ordenação
    });
  };

  useEffect(() => {
    (async () => {
      const [cadastros, tecidos, tabNomes] = await Promise.all([
        fetchCadastros(), fetchTecidos(), fetchNomesTabelasMedidas(),
      ]);
      setCad({ ...cadastros, tecido: tecidos.map((t: any) => t.nome), tab_medidas: tabNomes, _tecidoData: tecidos });
    })();
  }, []);

  useEffect(() => {
    localStorage.setItem(colsStorageKey, JSON.stringify(visibleCols));
  }, [visibleCols, colsStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(filtersKey, JSON.stringify({ q, fl, colecaoAtiva, sort }));
  }, [q, fl, colecaoAtiva, sort, filtersKey]);

  useEffect(() => {
    if (!showColMenu) return;
    const handler = (e: MouseEvent) => {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) setShowColMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showColMenu]);

  const colecoes = useMemo(() => Array.from(new Set(rows.map((r: any) => r.colecao).filter(Boolean))).sort((a, b) => String(b).localeCompare(String(a), "pt-BR", { numeric: true })), [rows]);

  const filtered = useMemo(() => {
    let r = rows;
    if (colecaoAtiva) r = r.filter((x: any) => x.colecao === colecaoAtiva);
    Object.entries(fl).forEach(([k,v]) => { if(v) r = r.filter((x:any) => x[k]===v); });
    if(q) { const s=q.toLowerCase(); r = r.filter((x:any) => (x.ref+x.desc+x.tecido+x.composicao+x.fornecedor+x.forn_tecido+x.estilista+x.tab_medidas).toLowerCase().includes(s)); }
    if (sort) {
      const col = COLUMNS.find(c => c.key === sort.key);
      const isNum = col?.type === "number";
      r = [...r].sort((a, b) => {
        const av = a[sort.key] ?? "", bv = b[sort.key] ?? "";
        if (isNum) {
          const an = parseFloat(av) || 0, bn = parseFloat(bv) || 0;
          return sort.dir === "asc" ? an - bn : bn - an;
        }
        const cmp = String(av).localeCompare(String(bv), "pt-BR", { numeric: true, sensitivity: "base" });
        return sort.dir === "asc" ? cmp : -cmp;
      });
    }
    return r;
  }, [rows, fl, q, sort, colecaoAtiva]);

  // Popup de alerta pros outros usuários quando um SKU já liberado/repilotando tem campo alterado.
  const alertarCampoAlterado = (prevRow: any, campoKey: string, valorAnterior: any, valorNovo: any) => {
    if (!prevRow || !user || !STATUS_ALERTA.includes(prevRow.status)) return;
    if (String(valorAnterior ?? "") === String(valorNovo ?? "")) return;
    const label = COLUMNS.find(c => c.key === campoKey)?.label || campoKey;
    criarAlerta({
      produtoRef: prevRow.ref,
      categoria: campoKey === "status" ? "STATUS" : "CAMPO",
      campo: label,
      valorAnterior: String(valorAnterior ?? ""),
      valorNovo: String(valorNovo ?? ""),
      statusProduto: prevRow.status,
      alteradoPorNome: nomeUsuario(user),
      alteradoPorUserId: user.id,
    });
  };

  const upd = async (id:number, k:string, v:string|number) => {
    // Validate unique ref
    if (k === "ref" && v) {
      const dup = rows.find((r:any) => r.ref === v && r.id !== id);
      if (dup) {
        setDupAlert(`Referência "${v}" já existe no produto "${dup.desc}"`);
        setTimeout(() => setDupAlert(null), 4000);
        return; // Don't save
      }
    }

    const prevRow = rows.find((r:any) => r.id === id);
    const tecidoInfo = k === "tecido" ? (cad._tecidoData||[]).find((t:any)=>t.nome===v) : null;

    setRows((p:any[]) => p.map((r:any) => {
      if(r.id!==id) return r;
      const u={...r,[k]:v};
      if(tecidoInfo){u.forn_tecido=tecidoInfo.forn;u.composicao=tecidoInfo.comp||"";}
      return u;
    }));

    const err = await updateProdutoField(id, k, v);
    if (err) {
      showError(`Erro ao salvar: ${err}`);
      setRows((p:any[]) => p.map((r:any) => r.id === id && prevRow ? { ...r, [k]: prevRow[k] } : r));
      return;
    }
    alertarCampoAlterado(prevRow, k, prevRow?.[k], v);

    if (tecidoInfo) {
      const err2 = await updateProdutoField(id, "forn_tecido", tecidoInfo.forn);
      const err3 = await updateProdutoField(id, "composicao", tecidoInfo.comp || "");
      if (err2 || err3) showError(`Tecido salvo, mas houve erro ao atualizar fornecedor/composição: ${err2 || err3}`);
    }
  };

  const { confirm, Dialog: ConfirmDialog } = useConfirm();
  const { success, error: showError, Container: ToastContainer } = useToast();

  const add = async () => {
    const blank: any = {};
    COLUMNS.forEach(c => { if(c.type!=="action") blank[c.key] = ""; });
    blank.status = STATUS_ESTILO.DESENVOLVIMENTO;
    const { data: result, error } = await insertProduto(blank);
    if (error) { showError(`Erro ao criar SKU: ${error}`); return; }
    if (result) {
      const newRow = { ...blank, id: result.id, ref: result.ref || "" };
      setRows((p:any) => [...p, newRow]);
      success("SKU criado com sucesso");
    }
  };

  const del = async (id:number) => {
    const confirmed = await confirm({
      title: "Excluir SKU?",
      message: "Esta ação não pode ser desfeita. Todos os dados associados serão removidos.",
      confirmLabel: "Excluir",
      cancelLabel: "Cancelar",
      variant: "danger",
    });
    if (!confirmed) return;
    const target = rows.find((r:any) => r.id === id);
    setRows((p:any[]) => p.filter((r:any) => r.id!==id));
    const error = await deleteProduto(id, target?.ref);
    if (error) {
      showError(`Erro ao excluir: ${error}`);
      setRows((p:any[]) => [...p]);
    } else {
      success("SKU excluído");
    }
  };

  const handleClone = async () => {
    if (!cloneSource || !cloneRef.trim()) return;
    const dup = rows.find((r:any) => r.ref === cloneRef.trim());
    if (dup) {
      showError(`Referência "${cloneRef.trim()}" já existe.`);
      return;
    }
    const { data, error } = await cloneProduto(cloneSource.id, cloneRef.trim());
    if (error) {
      showError(`Erro ao clonar: ${error}`);
      return;
    }
    if (data) {
      const newRow = { ...cloneSource, id: data.id, ref: data.ref, status: STATUS_ESTILO.DESENVOLVIMENTO };
      setRows((p:any) => [...p, newRow]);
      success("SKU clonado com sucesso");
    }
    setCloneSource(null);
    setCloneRef("");
  };

  const handleBulkStatus = async () => {
    if (!bulkStatus || selected.size === 0) return;
    const ids = Array.from(selected);
    ids.forEach(id => alertarCampoAlterado(rows.find((r:any) => r.id === id), "status", rows.find((r:any) => r.id === id)?.status, bulkStatus));
    setRows((p:any[]) => p.map((r:any) => ids.includes(r.id) ? { ...r, status: bulkStatus } : r));
    const error = await bulkUpdateStatus(ids, bulkStatus);
    if (error) {
      showError(`Erro: ${error}`);
    } else {
      success(`Status atualizado para ${selected.size} SKU(s)`);
    }
    setSelected(new Set());
    setBulkStatus("");
  };

  const toggleSelect = (id: number) => setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleSelectAll = () => setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map((r:any) => r.id)));

  const opts = (k:string):string[] => cad[k] || [];
  const uv = (k:string):string[] => Array.from(new Set(rows.map((r:any)=>r[k]).filter(Boolean))).sort();
  const sf2 = (k:string,v:string) => setFl(p=>{const n={...p};if(v)n[k]=v;else delete n[k];return n;});

  const handleExport = () => {
    const visReg  = COLUMNS.filter(c => isColVisible(c.key) && c.type !== "action");
    const visStat = permPrefix === "compras_" ? COMPRAS_STATUS_COLS.filter(c => isColVisible(c.key)) : [];
    const visPrice= permPrefix === "compras_" ? PRICE_COLS.filter(c => isColVisible(c.key)) : [];
    const headers = [
      ...visReg.map(c => c.label),
      ...visStat.map(c => c.label),
      ...visPrice.map(c => c.label),
    ];
    const dataRows = filtered.map(row => [
      ...visReg.map(c => {
        if (c.type === "readonly") return row[c.key] || "";
        return row[c.key] ?? "";
      }),
      ...visStat.map(c => row[c.key] || ""),
      ...visPrice.map(c => {
        if (c.computed) { const v = getPriceVal(c.key, row); return v !== null ? v : ""; }
        return row[c.key] != null && row[c.key] !== "" ? Number(row[c.key]) : "";
      }),
    ]);
    const section = permPrefix === "compras_" ? "compras" : "estilo";
    const date = new Date().toLocaleDateString("pt-BR").replace(/\//g,"-");
    exportToExcel(`desenvolvimento_${section}_${date}`, headers, dataRows);
  };

  return (
    <div>
      {/* Banner modo visualização ou compras */}
      {(readOnly || permPrefix) && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(0,122,255,0.06)", border: "1px solid rgba(0,122,255,0.18)", borderRadius: 10, padding: "10px 16px", marginBottom: 16, fontSize: 13, color: "var(--system-blue)", fontWeight: 500 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
          {readOnly
            ? <>Modo visualização — edição disponível apenas em <strong style={{ marginLeft: 4 }}>Estilo › Desenvolvimento</strong></>
            : <>Seção Compras — campos do produto são somente leitura · edite em <strong style={{marginLeft:4}}>Estilo › Desenvolvimento</strong></>}
        </div>
      )}
      {/* Seletor de coleção */}
      {colecoes.length > 0 && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--label-tertiary)] mr-1">Coleção</span>
          <button
            onClick={() => setColecaoAtiva(null)}
            className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-all border ${colecaoAtiva === null ? "bg-[var(--label-primary)] text-[var(--bg-primary)] border-[var(--label-primary)]" : "bg-transparent text-[var(--label-secondary)] border-[var(--separator)] hover:border-[var(--label-tertiary)]"}`}
          >
            Todas
          </button>
          {colecoes.map((col: string) => (
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

      {/* Duplicate ref alert */}
      {dupAlert && (
        <div className="mb-3 px-4 py-3 rounded-xl bg-[rgba(255,59,48,0.08)] border border-[rgba(255,59,48,0.2)] text-[var(--system-red)] text-[13px] font-medium flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          {dupAlert}
        </div>
      )}

      <div className="flex gap-2 mb-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-0 sm:min-w-[240px]">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--label-tertiary)] pointer-events-none" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" placeholder="Buscar referência, descrição, tecido, fornecedor..." value={q} onChange={e=>setQ(e.target.value)} className="apple-input w-full !pl-10 pr-3"/>
        </div>
        <button onClick={()=>setSf(!sf)} className={`apple-input flex items-center gap-2 cursor-pointer transition-all ${sf||ac>0?"!border-[var(--system-blue)] !bg-blue-50 text-[var(--system-blue)] font-semibold":""}`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/></svg>
          Filtros{ac>0&&<span className="bg-[var(--system-blue)] text-white text-[10px] font-bold w-[18px] h-[18px] rounded-full flex items-center justify-center">{ac}</span>}
        </button>
        {/* Column visibility toggle */}
        <div className="relative" ref={colMenuRef}>
          <button onClick={()=>setShowColMenu(v=>!v)} className={`apple-input flex items-center gap-2 cursor-pointer transition-all ${showColMenu||hiddenCount>0?"!border-[var(--system-blue)] !bg-blue-50 text-[var(--system-blue)] font-semibold":""}`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            Colunas{hiddenCount>0&&<span className="bg-[var(--system-blue)] text-white text-[10px] font-bold w-[18px] h-[18px] rounded-full flex items-center justify-center">{hiddenCount}</span>}
          </button>
          {showColMenu&&(
            <div className="absolute top-full left-0 mt-1 z-50 apple-card p-3 shadow-xl" style={{minWidth:260,maxHeight:380,overflowY:"auto"}}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--label-secondary)]">Mostrar colunas</span>
                <div className="flex gap-2">
                  <button onClick={()=>setVisibleCols(Object.fromEntries(toggleableCols.map(c=>[c.key,true])))} className="text-[11px] text-[var(--system-blue)] font-medium">Todas</button>
                  <span className="text-[var(--separator)]">·</span>
                  <button onClick={()=>setVisibleCols(Object.fromEntries(toggleableCols.map(c=>[c.key,false])))} className="text-[11px] text-[var(--label-tertiary)] font-medium">Nenhuma</button>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-[var(--bg-secondary)] cursor-not-allowed opacity-60 select-none">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                  <span className="text-[12px] text-[var(--label-secondary)]">Referência</span>
                  <span className="ml-auto text-[10px] text-[var(--label-quaternary)]">sempre visível</span>
                </label>
                {toggleableCols.map(c=>(
                  <label key={c.key} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[var(--bg-secondary)] cursor-pointer select-none">
                    <input type="checkbox" checked={isColVisible(c.key)} onChange={()=>toggleCol(c.key)} className="w-3.5 h-3.5 accent-[var(--system-blue)]"/>
                    <span className="text-[12px] text-[var(--label-primary)]">{c.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        <button onClick={handleExport} className="apple-input flex items-center gap-2 cursor-pointer transition-all hover:!border-[var(--system-green)] hover:text-[var(--system-green)]" title="Exportar para Excel">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Exportar
        </button>
        {!readOnly && canAdd && <button onClick={add} className="apple-btn-primary">+ Novo SKU</button>}
        {!readOnly && !isAdmin && <span style={{ fontSize: 11, color: "var(--label-tertiary)" }}>Apenas campos com permissão podem ser editados</span>}
      </div>

      {sf&&(<div className="apple-card p-4 mb-4 bg-[var(--bg-secondary)]"><div className="flex items-center justify-between mb-3"><span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--label-secondary)]">Filtrar por</span>{ac>0&&<button onClick={()=>{setFl({});setQ("");}} className="text-[12px] text-[var(--system-blue)] font-medium">Limpar todos</button>}</div><div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5">{FC.map(c=>(<div key={c.key}><label className="text-[11px] text-[var(--label-secondary)] mb-1 block font-medium">{c.label}</label><select value={fl[c.key]||""} onChange={e=>sf2(c.key,e.target.value)} className={`apple-select w-full text-[12px] py-1.5 ${fl[c.key]?"!border-[var(--system-blue)] !bg-blue-50/60 text-[var(--system-blue)] font-semibold":""}`}><option value="">Todos</option>{uv(c.key).map(v=><option key={v}>{v}</option>)}</select></div>))}</div></div>)}

      {ac>0&&!sf&&(<div className="flex flex-wrap gap-1.5 mb-3">{Object.entries(fl).map(([k,v])=>{if(!v)return null;const c=COLUMNS.find(x=>x.key===k);return(<span key={k} className="inline-flex items-center gap-1 bg-blue-50 text-[var(--system-blue)] rounded-lg px-2.5 py-1 text-[12px] font-medium"><span className="text-blue-300">{c?.label}:</span>{v}<button onClick={()=>sf2(k,"")} className="ml-0.5 text-blue-300 hover:text-[var(--system-blue)]">×</button></span>);})} <button onClick={()=>{setFl({});setQ("");}} className="text-[12px] text-[var(--label-tertiary)] px-2 py-1">Limpar</button></div>)}

      {/* Clone modal */}
      {cloneSource && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setCloneSource(null)}>
          <div className="apple-card" style={{width:360,padding:"28px 24px"}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:16,fontWeight:700,marginBottom:4}}>Clonar SKU</div>
            <div style={{fontSize:13,color:"var(--label-secondary)",marginBottom:16}}>Copiando <strong>{cloneSource.ref}</strong> — {cloneSource.desc}</div>
            <label style={{fontSize:12,fontWeight:600,color:"var(--label-secondary)",textTransform:"uppercase",letterSpacing:"0.04em",display:"block",marginBottom:6}}>Nova referência</label>
            <input autoFocus className="apple-input" style={{width:"100%",marginBottom:16}} placeholder="Ex: 1234" value={cloneRef} onChange={e=>setCloneRef(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleClone()}/>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              <button className="apple-btn-secondary" onClick={()=>setCloneSource(null)}>Cancelar</button>
              <button className="apple-btn-primary" onClick={handleClone} disabled={!cloneRef.trim()}>Clonar</button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && !readOnly && (
        <div style={{display:"flex",alignItems:"center",gap:10,background:"var(--system-blue)",borderRadius:10,padding:"10px 16px",marginBottom:12,flexWrap:"wrap"}}>
          <span style={{fontSize:13,fontWeight:600,color:"#fff"}}>{selected.size} SKU{selected.size!==1?"s":""} selecionado{selected.size!==1?"s":""}</span>
          <select value={bulkStatus} onChange={e=>setBulkStatus(e.target.value)} style={{fontSize:12,padding:"4px 10px",borderRadius:6,border:"none",background:"rgba(255,255,255,0.2)",color:"#fff",flex:1,minWidth:160,maxWidth:260}}>
            <option value="">Alterar status para…</option>
            {(opts("status")||[STATUS_ESTILO.DESENVOLVIMENTO,STATUS_ESTILO.MOSTARIO_LIBERADO,STATUS_ESTILO.PRODUCAO_LIBERADA,STATUS_ESTILO.CANCELADO]).map((s:string)=><option key={s} value={s} style={{color:"#000"}}>{s}</option>)}
          </select>
          <button onClick={handleBulkStatus} disabled={!bulkStatus} style={{fontSize:12,fontWeight:600,padding:"5px 14px",borderRadius:6,background:bulkStatus?"#fff":"rgba(255,255,255,0.3)",color:bulkStatus?"var(--system-blue)":"rgba(255,255,255,0.6)",border:"none",cursor:bulkStatus?"pointer":"default"}}>Aplicar</button>
          <button onClick={()=>setSelected(new Set())} style={{fontSize:12,color:"rgba(255,255,255,0.8)",background:"none",border:"none",cursor:"pointer",marginLeft:"auto"}}>Cancelar</button>
        </div>
      )}

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-4"><span className="text-[28px] font-bold tabnum tracking-[-0.03em]">{filtered.length}</span><span className="text-[14px] text-[var(--label-secondary)]">SKU{filtered.length!==1&&"s"}</span>{ac>0&&<span className="text-[12px] text-[var(--label-tertiary)]">de {rows.length}</span>}<span className="text-[11px] text-[var(--label-quaternary)] ml-auto italic hidden sm:inline">duplo-clique para editar · salva automaticamente</span></div>

      <ScrollTable><table className="plm-table" style={{width:"max-content",minWidth:"100%"}}>
      <caption className="sr-only">Tabela de SKUs com filtros e opções de edição</caption>
      <thead><tr>
        {!readOnly && canAdd && <th style={{width:36,padding:"0 8px"}}><input type="checkbox" aria-label="Selecionar todos" checked={selected.size===filtered.length&&filtered.length>0} onChange={toggleSelectAll} style={{cursor:"pointer"}}/></th>}
        {COLUMNS.filter(c=>isColVisible(c.key)).flatMap(c=>{
        const sortable = c.type !== "action";
        const isActive = sort?.key === c.key;
        const isSticky = c.key === "ref";
        const isMobileHidden = ["forn", "composicao", "taxa_cliente", "estilista", "operacao", "fornecedor"].includes(c.key);
        const mainTh = (
          <th key={c.key} className={isMobileHidden ? "hidden sm:table-cell" : ""} style={{width:c.width,minWidth:c.width,textAlign:c.type==="number"?"right":"left",...(isSticky?{position:"sticky",left:0,zIndex:3,background:"var(--bg-primary)",boxShadow:"2px 0 4px rgba(0,0,0,0.06)"}:{})}}>
            {sortable ? (
              <button onClick={() => toggleSort(c.key)} className={`inline-flex items-center gap-1 select-none cursor-pointer hover:text-[var(--label-primary)] transition-colors ${isActive ? "text-[var(--system-blue)]" : ""}`}>
                <span>{c.label}</span>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className={isActive ? "opacity-100" : "opacity-30"}>
                  {isActive && sort?.dir === "desc" ? <path d="M6 9l6 6 6-6"/> : <path d="M18 15l-6-6-6 6"/>}
                </svg>
              </button>
            ) : c.label}
          </th>
        );
        if (c.key === "ref" && permPrefix === "compras_") {
          return [mainTh, ...COMPRAS_STATUS_COLS.filter(sc => isColVisible(sc.key)).map(sc => (
            <th key={sc.key} style={{width:sc.width,minWidth:sc.width}}>
              <button onClick={() => toggleSort(sc.key)} className={`inline-flex items-center gap-1 select-none cursor-pointer hover:text-[var(--label-primary)] transition-colors ${sort?.key===sc.key?"text-[var(--system-blue)]":""}`}>
                <span>{sc.label}</span>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className={sort?.key===sc.key?"opacity-100":"opacity-30"}>
                  {sort?.key===sc.key&&sort?.dir==="desc"?<path d="M6 9l6 6 6-6"/>:<path d="M18 15l-6-6-6 6"/>}
                </svg>
              </button>
            </th>
          ))];
        }
        return [mainTh];
      })}
      {permPrefix === "compras_" && PRICE_COLS.filter(c => isColVisible(c.key)).map(c => (
        <th key={c.key} style={{width:c.width,minWidth:c.width,textAlign:"right"}}>
          <span className={c.computed ? "text-[var(--label-tertiary)] italic" : ""}>{c.label}</span>
        </th>
      ))}
      <th style={{width:120,minWidth:120,textAlign:"right"}}>
        <span className="inline-flex items-center gap-1" title="Estoque atual no Linx (todas as cores e filiais). Em verde, o que está a receber (pedidos de compra/produção pendentes).">
          Estoque
          <span className="text-[9px] font-semibold px-1 py-0.5 rounded bg-[rgba(0,122,255,0.1)] text-[var(--system-blue)]">Linx</span>
        </span>
      </th>
      <th style={{width:36}}/></tr></thead><tbody>
        {filtered.map((row:any)=>(<tr key={row.id} style={selected.has(row.id)?{background:"rgba(0,122,255,0.06)"}:{}}>
          {!readOnly && canAdd && <td style={{width:36,padding:"0 8px"}}><input type="checkbox" aria-label={`Selecionar SKU ${row.ref}`} checked={selected.has(row.id)} onChange={()=>toggleSelect(row.id)} style={{cursor:"pointer"}}/></td>}
          {COLUMNS.filter(c=>isColVisible(c.key)).flatMap(c=>{
          const isSticky = c.key === "ref";
          const mainTd = <td key={c.key} style={{width:c.width,minWidth:c.width,...(isSticky?{position:"sticky",left:0,zIndex:2,background:"var(--bg-primary)",boxShadow:"2px 0 4px rgba(0,0,0,0.04)"}:{})}}>{c.type==="action"?<div style={{display:"flex",gap:4}}><button onClick={()=>onOpenFicha(row)} className="apple-btn-secondary text-[12px] py-1 px-3">Abrir</button>{!readOnly&&canAdd&&<button onClick={()=>{setCloneSource(row);setCloneRef("");}} title="Clonar SKU" className="apple-btn-secondary text-[12px] py-1 px-2" style={{color:"var(--system-blue)"}}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button>}</div>:c.type==="readonly"?<span className="text-[13px] px-2.5 py-1.5 block text-[var(--label-secondary)]">{row[c.key]||"—"}</span>:(readOnly||permPrefix==="compras_")?<span style={{fontSize:13,padding:"6px 10px",display:"block",color:"var(--label-secondary)"}}>{row[c.key]||"—"}</span>:canEdit(c.key)?<InlineCell value={row[c.key]} type={c.type} options={c.cad?opts(c.cad):undefined} isStatus={c.key==="status"} onChange={v=>upd(row.id,c.key,v)}/>:<span style={{fontSize:13,padding:"6px 10px",display:"block",color:"var(--label-tertiary)",cursor:"default"}} title="Sem permissão para editar">{row[c.key]||"—"}</span>}</td>;
          if (c.key === "ref" && permPrefix === "compras_") {
            return [mainTd, ...COMPRAS_STATUS_COLS.filter(sc => isColVisible(sc.key)).map(sc => {
              const sv = row[sc.key] || "";
              const ss = sc.styles[sv];
              const pill = sv ? <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap" style={ss?{background:ss.bg,color:ss.color}:{background:"rgba(142,142,147,0.12)",color:"var(--label-tertiary)"}}>{sv}</span> : <span className="text-[var(--label-quaternary)] text-[13px] px-2.5">—</span>;
              return <td key={sc.key} style={{width:sc.width,minWidth:sc.width}}>
                {canEdit(sc.key)
                  ? <InlineCell value={sv} type="select" options={sc.opts} displayEl={pill} onChange={v=>upd(row.id,sc.key,String(v))}/>
                  : <div className="px-1 py-0.5">{pill}</div>}
              </td>;
            })];
          }
          return [mainTd];
        })}
        {permPrefix === "compras_" && PRICE_COLS.filter(c => isColVisible(c.key)).map(c => {
          const isMult = MULT_KEYS.has(c.key);
          if (c.computed) {
            const val = getPriceVal(c.key, row);
            return <td key={c.key} style={{width:c.width,minWidth:c.width,textAlign:"right"}}><span className="text-[13px] px-2.5 py-1.5 block text-[var(--label-tertiary)] italic tabnum">{fmtBRL(val,{mult:isMult})}</span></td>;
          }
          const rawVal = row[c.key];
          const canEditPrice = isAdmin || perms["compras_precos"] === true;
          const dispFn = isMult
            ? (v: number) => v.toFixed(2).replace(".", ",") + "×"
            : (v: number) => "R$ " + v.toFixed(2).replace(".", ",");
          return <td key={c.key} style={{width:c.width,minWidth:c.width,textAlign:"right"}}>
            {canEditPrice
              ? <InlineCell value={rawVal ?? ""} type="number" displayFn={dispFn} onChange={v => upd(row.id, c.key, v)} />
              : <span className="text-[13px] px-2.5 py-1.5 block tabnum">{fmtBRL(rawVal != null && rawVal !== "" ? Number(rawVal) : null, {mult:isMult})}</span>
            }
          </td>;
        })}
        <td style={{textAlign:"right"}}>{(() => {
          if (estoqueMap === null) return <span className="text-[12px] text-[var(--label-quaternary)] px-2.5 tabnum">…</span>;
          const rk = String(row.ref).trim();
          const total = estoqueMap[rk];
          const futuro = futuroMap[rk] || 0;
          if (total === undefined && futuro === 0) return <span className="text-[13px] text-[var(--label-quaternary)] px-2.5">—</span>;
          const atual = total ?? 0;
          return (
            <button
              onClick={() => abrirEstoqueDetalhe(rk)}
              title="Ver estoque por cor e filial + pedidos a receber"
              className="px-2.5 py-1 rounded-md hover:bg-[rgba(0,122,255,0.08)] transition-colors inline-flex flex-col items-end leading-tight"
            >
              <span className="text-[13px] tabnum font-semibold" style={{ color: atual > 0 ? "var(--system-blue)" : "var(--label-tertiary)" }}>
                {atual.toLocaleString("pt-BR")}
              </span>
              {futuro > 0 && (
                <span className="text-[11px] tabnum font-semibold" style={{ color: "var(--system-green)" }} title="A receber (pedidos pendentes)">
                  +{futuro.toLocaleString("pt-BR")}
                </span>
              )}
            </button>
          );
        })()}</td>
        <td className="text-center">{!readOnly&&canDelete&&<button onClick={()=>del(row.id)} className="text-[var(--label-quaternary)] hover:text-[var(--system-red)] rounded-lg w-7 h-7 inline-flex items-center justify-center transition-colors"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>}</td></tr>))}
        {filtered.length===0&&<tr><td colSpan={COLUMNS.length+2} className="py-16 text-center text-[var(--label-tertiary)] text-[14px]">Nenhum item encontrado</td></tr>}
      </tbody></table></ScrollTable>

      {/* Modal: detalhe de estoque do Linx por cor e filial */}
      {estoqueDetalheRef && (
        <div onClick={() => setEstoqueDetalheRef(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
          <div onClick={e => e.stopPropagation()} className="apple-card" style={{ width: 460, maxHeight: "85vh", overflowY: "auto", padding: 24 }}>
            <div className="flex items-center justify-between mb-1">
              <div className="text-[16px] font-bold">Estoque atual — {estoqueDetalheRef}</div>
              <button onClick={() => setEstoqueDetalheRef(null)} className="text-[var(--label-tertiary)] hover:text-[var(--label-primary)] w-7 h-7 flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="text-[11px] text-[var(--label-tertiary)] mb-4">Fonte: Linx · atualiza a cada ~5 min</div>

            {estoqueDetalheLoading ? (
              <div className="plm-loading" style={{ padding: "32px 0" }}><div className="plm-loading-spinner" /></div>
            ) : !estoqueDetalhe || estoqueDetalhe.semDados ? (
              <div className="py-8 text-center text-[13px] text-[var(--label-tertiary)]">Este produto não tem estoque no Linx.</div>
            ) : (
              <div className="flex flex-col gap-5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl px-4 py-3" style={{ background: "rgba(0,122,255,0.08)" }}>
                    <div className="text-[11px] font-medium text-[var(--label-secondary)]">Estoque atual</div>
                    <div className="text-[26px] font-bold tabnum" style={{ color: "var(--system-blue)" }}>{estoqueDetalhe.total.toLocaleString("pt-BR")}</div>
                  </div>
                  <div className="rounded-xl px-4 py-3" style={{ background: "rgba(52,199,89,0.10)" }}>
                    <div className="text-[11px] font-medium text-[var(--label-secondary)]">A receber (futuro)</div>
                    <div className="text-[26px] font-bold tabnum" style={{ color: "var(--system-green)" }}>{(estoqueDetalhe.futuro || 0).toLocaleString("pt-BR")}</div>
                  </div>
                </div>

                {estoqueDetalhe.pedidos && estoqueDetalhe.pedidos.length > 0 && (
                  <div>
                    <div className="text-[12px] font-semibold uppercase text-[var(--label-tertiary)] mb-2">Pedidos a receber</div>
                    <div className="flex flex-col gap-1.5">
                      {estoqueDetalhe.pedidos.map((p, i) => (
                        <div key={`${p.numero}-${p.cor}-${i}`} className="flex items-center gap-2 text-[13px]">
                          <span className="tabnum text-[var(--label-tertiary)]" style={{ minWidth: 74 }}>{p.numero}</span>
                          <span className="text-[var(--label-secondary)] flex-1 truncate">{p.corNome}<span className="text-[var(--label-quaternary)]"> ({p.cor})</span></span>
                          <span className="text-[11px] text-[var(--label-tertiary)] tabnum">{fmtDataBR(p.data)}</span>
                          <span className="tabnum font-semibold" style={{ color: "var(--system-green)", minWidth: 44, textAlign: "right" }}>+{p.qtd.toLocaleString("pt-BR")}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <div className="text-[12px] font-semibold uppercase text-[var(--label-tertiary)] mb-2">Por cor</div>
                  <div className="flex flex-col gap-1.5">
                    {estoqueDetalhe.porCor.map(c => (
                      <div key={c.cor} className="flex items-center gap-2 text-[13px]">
                        <span className="text-[var(--label-secondary)] flex-1 truncate">{c.nome}<span className="text-[var(--label-quaternary)]"> ({c.cor})</span></span>
                        <span className="tabnum font-semibold">{c.qtd.toLocaleString("pt-BR")}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[12px] font-semibold uppercase text-[var(--label-tertiary)] mb-2">Por filial</div>
                  <div className="flex flex-col gap-1.5">
                    {estoqueDetalhe.porFilial.map(f => (
                      <div key={f.filial} className="flex items-center gap-2 text-[13px]">
                        <span className="text-[var(--label-secondary)] flex-1 truncate">{f.filial}</span>
                        <span className="tabnum font-semibold">{f.qtd.toLocaleString("pt-BR")}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog />
      <ToastContainer />
    </div>
  );
}
