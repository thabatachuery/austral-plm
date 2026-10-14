"use client";
import { useState, useMemo, useEffect, useRef } from "react";
import { COR_PALETTE } from "@/lib/cor-palette";
import InlineCell from "@/components/ui/InlineCell";
import StatusPill from "@/components/ui/StatusPill";
import { updateProdutoField, fetchVarianteCompras, upsertVarianteCompra } from "@/lib/db";
import { exportToExcel, fmtExcelDate } from "@/lib/export-excel";
import ScrollTable from "@/components/ui/ScrollTable";
import { useToast } from "@/components/ui/Toast";

// Colunas ESTILO
const VC=[{key:"ref",label:"Referência",w:120},{key:"desc",label:"Descrição",w:260},{key:"cor",label:"Cor",w:180},{key:"colecao",label:"Coleção",w:140},{key:"tecido",label:"Tecido",w:200},{key:"composicao",label:"Composição",w:160},{key:"forn_tecido",label:"Forn. tecido",w:140},{key:"status",label:"Status",w:180},{key:"fornecedor",label:"Fornecedor",w:140},{key:"grupo",label:"Grupo",w:120},{key:"subgrupo",label:"Subgrupo",w:200},{key:"_ficha",label:"Ficha",w:70}];
// Colunas COMPRAS
const VC_COMPRAS=[
  {key:"ref",           label:"Referência",     w:120},
  {key:"desc",          label:"Descrição",       w:260},
  {key:"cor",           label:"Cor",             w:180},
  {key:"colecao",       label:"Coleção",         w:140},
  {key:"qtd_compra1",   label:"Qtd. Compra 1",  w:115, colType:"number"},
  {key:"pedido1",       label:"Pedido 1",        w:120, colType:"text"  },
  {key:"data_entrega1", label:"Entrega 1",       w:115, colType:"date"  },
  {key:"qtd_compra2",   label:"Qtd. Compra 2",  w:115, colType:"number"},
  {key:"pedido2",       label:"Pedido 2",        w:120, colType:"text"  },
  {key:"data_entrega2", label:"Entrega 2",       w:115, colType:"date"  },
  {key:"status_compras",label:"Status Compras",  w:215},
  {key:"status",        label:"Status",          w:180},
  {key:"fornecedor",    label:"Fornecedor",      w:140},
  {key:"grupo",         label:"Grupo",           w:120},
  {key:"_ficha",        label:"Ficha",           w:70 },
];

// Campos armazenados por variante (não por produto)
const COMPRA_FIELDS = new Set(["qtd_compra1","pedido1","data_entrega1","qtd_compra2","pedido2","data_entrega2"]);

const FK=["grupo","subgrupo","status","tecido","fornecedor","cor","colecao","estilista","linha"];
const FK_COMPRAS=["grupo","status","status_compras","fornecedor","cor","colecao"];
const FL:Record<string,string>={grupo:"Grupo",subgrupo:"Subgrupo",status:"Status",status_compras:"Status Compras",tecido:"Tecido",fornecedor:"Fornecedor",cor:"Cor",colecao:"Coleção",estilista:"Estilista",linha:"Linha"};
const SP:Record<string,string>={"MOSTRUÁRIO LIBERADO":"pill-green","PRODUÇÃO LIBERADA":"pill-blue","DESENVOLVIMENTO":"pill-orange","REPILOTANDO PRODUÇÃO":"pill-orange","CANCELADO":"pill-red"};
const SC_STYLE:Record<string,{bg:string;color:string}>={
  "PEDIDO MOST. COLOCADO":     {bg:"rgba(255,149,0,0.12)",  color:"#b86a00"},
  "MOSTRUÁRIO ENTREGUE":       {bg:"rgba(90,120,255,0.12)", color:"#3a4ec4"},
  "PED. DE PRODUÇÃO COLOCADO": {bg:"rgba(175,82,222,0.12)", color:"#7c2eaa"},
  "PRODUÇÃO ENTREGUE":         {bg:"rgba(52,199,89,0.15)",  color:"#1a7a35"},
};

type Props={
  rows:any[];
  variantes:Record<string,string[]>;
  variantesPorColecao?:Record<string,Record<string,string[]>>;
  onOpenFicha:(r:any)=>void;
  readOnly?:boolean;
  compras?:boolean;
  setRows?:(fn:any)=>void;
  canEditOrders?:boolean;
};

export default function VariantesTable({rows, variantes, variantesPorColecao={}, onOpenFicha, readOnly=false, compras=false, setRows, canEditOrders=false}:Props){
  const COLS = compras ? VC_COMPRAS : VC;

  // ── Compra data: fetched per-variant, stored locally ──────────────────
  // vcMap: Record<"produtoId:cor", {qtd_compra1, pedido1, data_entrega1, qtd_compra2, pedido2, data_entrega2}>
  const [vcMap, setVcMap] = useState<Record<string,any>>({});
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!compras || loadedRef.current) return;
    loadedRef.current = true;
    let active = true;
    fetchVarianteCompras().then(data => {
      if (active) setVcMap(prev => ({ ...data, ...prev }));
    });
    return () => { active = false; };
  }, [compras]);

  const { error: showError, Container: ToastContainer } = useToast();

  const updOrder = async (r: any, field: string, value: any) => {
    if (COMPRA_FIELDS.has(field)) {
      const key = `${r.id}:${r.cor}`;
      const prevValue = vcMap[key]?.[field];
      // Optimistic update
      setVcMap(prev => ({
        ...prev,
        [key]: { ...(prev[key] ?? {}), [field]: value }
      }));
      // Persist
      const err = await upsertVarianteCompra(r.id, r.cor, field, value);
      if (err) {
        showError(`Erro ao salvar: ${err}`);
        setVcMap(prev => ({ ...prev, [key]: { ...(prev[key] ?? {}), [field]: prevValue } }));
      }
    } else {
      const prevRow = rows.find((row:any) => row.id === r.id);
      setRows?.((p:any[]) => p.map((row:any) => row.id===r.id ? {...row,[field]:value} : row));
      const err = await updateProdutoField(r.id, field, value);
      if (err) {
        showError(`Erro ao salvar: ${err}`);
        setRows?.((p:any[]) => p.map((row:any) => row.id === r.id && prevRow ? { ...row, [field]: prevRow[field] } : row));
      }
    }
  };

  const handleExport = () => {
    const expCols = (COLS as any[]).filter(c => c.key !== "_ficha");
    const headers = expCols.map((c:any) => c.label);
    const dataRows = filtered.map((r:any) => expCols.map((c:any) => {
      if (c.key === "cor") return r.cor === "—" ? "" : r.cor;
      if (c.colType === "date") return fmtExcelDate(r[c.key]);
      if (c.colType === "number") return r[c.key] != null && r[c.key] !== "" ? Number(r[c.key]) : "";
      return r[c.key] ?? "";
    }));
    const section = compras ? "compras" : "estilo";
    const date = new Date().toLocaleDateString("pt-BR").replace(/\//g,"-");
    exportToExcel(`variantes_${section}_${date}`, headers, dataRows);
  };

  const FILTERS = compras ? FK_COMPRAS : FK;
  const [q,setQ]=useState("");
  const [fl,setFl]=useState<Record<string,string>>({});
  const [sf,setSf]=useState(false);
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const ac=Object.values(fl).filter(Boolean).length;

  const toggleSort = (k: string) => {
    setSort(prev => {
      if (!prev || prev.key !== k) return { key: k, dir: "asc" };
      if (prev.dir === "asc") return { key: k, dir: "desc" };
      return null;
    });
  };

  // Build variant rows, merging per-variant compra data from vcMap
  const vr = useMemo(() => {
    const o: any[] = [];
    const mkCompraFields = (vc: any) => ({
      qtd_compra1:   vc.qtd_compra1   ?? null,
      pedido1:       vc.pedido1       ?? "",
      data_entrega1: vc.data_entrega1 ?? "",
      qtd_compra2:   vc.qtd_compra2   ?? null,
      pedido2:       vc.pedido2       ?? "",
      data_entrega2: vc.data_entrega2 ?? "",
    });
    rows.forEach((p: any) => {
      // Ref de outra coleção que ganhou temporada (ex.: VERÃO 27 com temporada
      // INVERNO 27) se comporta como clássico: cor por temporada.
      const isClassic = (p.ref || "").startsWith("11") || /cl.ssic/i.test(p.colecao || "") || !!variantesPorColecao[p.ref];
      if (isClassic) {
        // Clássicos: uma linha por (temporada, cor) — cada cor pertence à
        // temporada da ficha em que foi cadastrada, não à coleção do produto.
        const porTemporada = variantesPorColecao[p.ref] || {};
        const temporadas = Object.keys(porTemporada);
        if (!temporadas.length) {
          const vc = vcMap[`${p.id}:—`] ?? {};
          o.push({ ...p, cor: "—", _vid: `${p.ref}-`, ...mkCompraFields(vc) });
        } else {
          temporadas.forEach(temporada => {
            (porTemporada[temporada] || []).forEach(x => {
              const vc = vcMap[`${p.id}:${x}`] ?? {};
              o.push({ ...p, cor: x, colecao: temporada, _vid: `${p.ref}-${temporada}-${x}`, ...mkCompraFields(vc) });
            });
          });
        }
      } else {
        const cores = variantes[p.ref] ?? [];
        if (!cores.length) {
          const vc = vcMap[`${p.id}:—`] ?? {};
          o.push({ ...p, cor: "—", _vid: `${p.ref}-`, ...mkCompraFields(vc) });
        } else {
          cores.forEach(x => {
            const vc = vcMap[`${p.id}:${x}`] ?? {};
            o.push({ ...p, cor: x, _vid: `${p.ref}-${x}`, ...mkCompraFields(vc) });
          });
        }
      }
    });
    return o;
  }, [rows, variantes, variantesPorColecao, vcMap]);

  const filtered = useMemo(() => {
    let r = vr;
    Object.entries(fl).forEach(([k,v]) => {
      if (!v) return;
      r = r.filter(x => x[k] === v);
    });
    if(q){ const s=q.toLowerCase(); r=r.filter(x=>(x.ref+x.desc+x.cor+x.tecido+x.composicao+x.fornecedor).toLowerCase().includes(s)); }
    if (sort) {
      r = [...r].sort((a, b) => {
        const av = a[sort.key] ?? "", bv = b[sort.key] ?? "";
        const cmp = String(av).localeCompare(String(bv), "pt-BR", { numeric: true, sensitivity: "base" });
        return sort.dir === "asc" ? cmp : -cmp;
      });
    }
    return r;
  }, [vr, fl, q, sort]);

  const uv = (k: string): string[] => Array.from(new Set(vr.map(r => r[k]).filter(Boolean))).sort();
  const sf2 = (k: string, v: string) => setFl(p => { const n={...p}; if(v) n[k]=v; else delete n[k]; return n; });

  return (
    <div>
      <div className="flex gap-2 mb-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-0 sm:min-w-[240px]"><svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--label-tertiary)] pointer-events-none" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><input type="text" placeholder="Buscar referência, cor, tecido..." value={q} onChange={e=>setQ(e.target.value)} className="apple-input w-full !pl-10"/></div>
        <button onClick={()=>setSf(!sf)} className={`apple-input flex items-center gap-2 cursor-pointer ${sf||ac>0?"!border-[var(--system-blue)] !bg-blue-50 text-[var(--system-blue)] font-semibold":""}`}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/></svg>Filtros{ac>0&&<span className="bg-[var(--system-blue)] text-white text-[10px] font-bold w-[18px] h-[18px] rounded-full flex items-center justify-center">{ac}</span>}</button>
        <button onClick={handleExport} className="apple-input flex items-center gap-2 cursor-pointer transition-all hover:!border-[var(--system-green)] hover:text-[var(--system-green)]" title="Exportar para Excel">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Exportar
        </button>
      </div>
      {sf&&(<div className="apple-card p-4 mb-4 bg-[var(--bg-secondary)]"><div className="flex items-center justify-between mb-3"><span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--label-secondary)]">Filtrar por</span>{ac>0&&<button onClick={()=>{setFl({});setQ("");}} className="text-[12px] text-[var(--system-blue)] font-medium">Limpar</button>}</div><div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">{FILTERS.map(k=>(<div key={k}><label className="text-[11px] text-[var(--label-secondary)] mb-1 block font-medium">{FL[k]}</label><select value={fl[k]||""} onChange={e=>sf2(k,e.target.value)} className={`apple-select w-full text-[12px] py-1.5 ${fl[k]?"!border-[var(--system-blue)] !bg-blue-50/60 text-[var(--system-blue)] font-semibold":""}`}><option value="">Todos</option>{uv(k).map(v=><option key={v}>{v}</option>)}</select></div>))}</div></div>)}
      {ac>0&&!sf&&(<div className="flex flex-wrap gap-1.5 mb-3">{Object.entries(fl).map(([k,v])=>{if(!v)return null;return(<span key={k} className="inline-flex items-center gap-1 bg-blue-50 text-[var(--system-blue)] rounded-lg px-2.5 py-1 text-[12px] font-medium"><span className="text-blue-300">{FL[k]}:</span>{v}<button onClick={()=>sf2(k,"")} className="ml-0.5 text-blue-300">×</button></span>);})}<button onClick={()=>{setFl({});setQ("");}} className="text-[12px] text-[var(--label-tertiary)] px-2">Limpar</button></div>)}

      <div className="flex items-baseline gap-3 mb-4"><span className="text-[28px] font-bold tabnum tracking-[-0.03em]">{filtered.length}</span><span className="text-[14px] text-[var(--label-secondary)]">variante{filtered.length!==1&&"s"}</span>{ac>0&&<span className="text-[12px] text-[var(--label-tertiary)]">de {vr.length}</span>}<span className="text-[11px] text-[var(--label-quaternary)] ml-auto">Cores cadastradas na ficha técnica</span></div>

      <ScrollTable><table className="plm-table" style={{width:"max-content",minWidth:"100%"}}><thead><tr>{COLS.map(c=>{
        const sortable = c.key !== "_ficha";
        const isActive = sort?.key === c.key;
        return (
          <th key={c.key} style={{width:c.w,minWidth:c.w}}>
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
      })}</tr></thead><tbody>
        {filtered.map((r:any)=>(<tr key={r._vid}>{COLS.map((c:any)=>(<td key={c.key} style={{width:c.w,minWidth:c.w,textAlign:c.colType==="number"?"right":"left"}}>
          {c.key==="_ficha"
            ?<button onClick={()=>onOpenFicha(r)} className="apple-btn-secondary text-[12px] py-1 px-3">Abrir</button>
          :c.key==="status"&&r.status
            ?<StatusPill status={r.status} />
          :c.key==="status_compras"
            ?(() => { const s=r.status_compras||""; const st=SC_STYLE[s]; return s?<span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap" style={st?{background:st.bg,color:st.color}:{background:"rgba(142,142,147,0.12)",color:"var(--label-tertiary)"}}>{s}</span>:<span className="text-[var(--label-quaternary)] text-[13px] px-2.5">—</span>; })()
          :c.key==="cor"&&r.cor!=="—"
            ?(() => { const pal = COR_PALETTE[r.cor]; return <span className="inline-flex items-center rounded-md px-2.5 py-1 text-[12px] font-bold" style={pal ? { background: pal.bg, color: pal.text } : { background: "var(--bg-secondary)" }}>{r.cor}</span>; })()
          :c.colType
            ?(canEditOrders
              ?<InlineCell value={r[c.key]??""} type={c.colType} displayFn={c.colType==="number"?(v:number)=>v>0?String(Math.round(v)):"—":undefined} onChange={v=>updOrder(r,c.key,v)}/>
              :<span className={`text-[13px] px-2.5 py-1.5 block ${c.colType==="number"?"tabnum":""} ${r[c.key]?"":"text-[var(--label-quaternary)]"}`}>{c.colType==="date"&&r[c.key]?String(r[c.key]).split("-").reverse().join("/"):c.colType==="number"&&r[c.key]?String(Math.round(Number(r[c.key]))):r[c.key]||"—"}</span>)
          :<span className={`text-[13px] px-2.5 py-1 block ${r[c.key]?"":"text-[var(--label-quaternary)]"}`}>{r[c.key]||"—"}</span>}
        </td>))}</tr>))}
        {filtered.length===0&&<tr><td colSpan={COLS.length} className="py-16 text-center text-[var(--label-tertiary)]">Nenhuma variante</td></tr>}
      </tbody></table></ScrollTable>
      <ToastContainer />
    </div>
  );
}
