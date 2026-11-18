"use client";
import { useState, useEffect, useMemo } from "react";
import { fetchControleFluxo, upsertControleFluxo } from "@/lib/db";
import { subscribeRealtime } from "@/lib/realtime";
import { STATUS_ESTILO, STATUS_PRE_PRODUCAO_COLORS, STATUS_PP_LIBERADA_ANTES } from "@/lib/constants";
import ScrollTable from "@/components/ui/ScrollTable";

function StatusPPPill({ status }: { status: string }) {
  if (!status) return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap bg-[var(--bg-secondary)] text-[var(--label-secondary)]">Sem laudo</span>;
  const st = STATUS_PRE_PRODUCAO_COLORS[status];
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap" style={st ? { background: st.bg, color: st.color } : { background: "var(--bg-secondary)", color: "var(--label-tertiary)" }}>
      {status}
    </span>
  );
}

// Categoria do status de pré-produção, usada no resumo e no filtro.
type Cat = "ok" | "antes" | "restr" | "reprov" | "sem";
const catDe = (st: string): Cat =>
  !st ? "sem" : st === "LIBERADA" ? "ok" : st === STATUS_PP_LIBERADA_ANTES ? "antes" : st.startsWith("LIBERADA") ? "restr" : "reprov";

const CATS: { key: Cat; label: string; cor: string; tx: string; opacity?: number }[] = [
  { key: "ok",     label: "Liberada",              cor: "var(--st-prod)", tx: "var(--st-prod-tx)" },
  { key: "antes",  label: "Liberada antes do PLM", cor: "var(--st-prod)", tx: "var(--st-prod-tx)", opacity: 0.45 },
  { key: "restr",  label: "Com restrição",         cor: "var(--st-rep)",  tx: "var(--st-rep-tx)" },
  { key: "reprov", label: "Reprovada",             cor: "var(--st-canc)", tx: "var(--st-canc-tx)" },
  { key: "sem",    label: "Sem laudo",             cor: "var(--bg-tertiary, #d9d4cc)", tx: "var(--st-canc-tx)" },
];

type Contagem = Record<Cat, number> & { total: number };
const vazio = (): Contagem => ({ ok: 0, antes: 0, restr: 0, reprov: 0, sem: 0, total: 0 });

function Barra({ c }: { c: Contagem }) {
  const tot = c.total || 1;
  return (
    <div className="h-2.5 rounded-full bg-[var(--bg-secondary)] overflow-hidden flex">
      {CATS.filter(k => k.key !== "sem").map(k => (
        <div key={k.key} style={{ width: `${(c[k.key] / tot) * 100}%`, background: k.cor, opacity: k.opacity }} />
      ))}
    </div>
  );
}

const uniq = (xs: string[]) => Array.from(new Set(xs.filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR"));

type Props = { rows: any[]; onOpenLaudo: (row: any) => void };

export default function PreProducaoView({ rows, onOpenLaudo }: Props) {
  const [fluxoMap, setFluxoMap] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [fColecao, setFColecao] = useState("");
  const [fStatus, setFStatus] = useState<"" | Cat>("");
  const [fFornecedor, setFFornecedor] = useState("");
  const [fGrupo, setFGrupo] = useState("");

  // Marca/desmarca "liberada antes do PLM" (sem laudo) — tira da contagem.
  const marcarAntes = async (ref: string, marcar: boolean) => {
    const novo = marcar ? STATUS_PP_LIBERADA_ANTES : "";
    const anterior = fluxoMap[ref];
    setFluxoMap(m => ({ ...m, [ref]: { ...(m[ref] || { produto_ref: ref }), status_pre_producao: novo } }));
    const err = await upsertControleFluxo(ref, "status_pre_producao", novo || null);
    if (err) {
      setFluxoMap(m => ({ ...m, [ref]: anterior }));
      alert(`Não foi possível salvar o status de ${ref}.\n\n${err}`);
    }
  };

  const load = () => fetchControleFluxo().then(data => {
    const m: Record<string, any> = {};
    data.forEach(r => { m[r.produto_ref] = r; });
    setFluxoMap(m);
    setLoading(false);
  });

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const unsub = subscribeRealtime("preproducao-sync", [
      { table: "controle_fluxo", onInsert: load, onUpdate: load, onDelete: load },
    ]);
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stDe = (r: any) => fluxoMap[r.ref]?.status_pre_producao || "";

  const elegiveis = useMemo(
    () => rows.filter(r => r.status === STATUS_ESTILO.PRODUCAO_LIBERADA),
    [rows],
  );

  const opColecao = useMemo(() => uniq(elegiveis.map(r => r.colecao || "")), [elegiveis]);
  const opFornecedor = useMemo(() => uniq(elegiveis.map(r => r.fornecedor || "")), [elegiveis]);
  const opGrupo = useMemo(() => uniq(elegiveis.map(r => r.grupo || "")), [elegiveis]);

  // Fornecedor e grupo valem para tudo; coleção, status e busca só para a lista.
  const base = useMemo(
    () => elegiveis.filter(r => (!fFornecedor || r.fornecedor === fFornecedor) && (!fGrupo || r.grupo === fGrupo)),
    [elegiveis, fFornecedor, fGrupo],
  );

  // Resumo por coleção (ignora o filtro de coleção, pra servir de atalho).
  const porColecao = useMemo(() => {
    const m: Record<string, Contagem> = {};
    base.forEach(r => {
      const c = (m[r.colecao || "—"] ||= vazio());
      c[catDe(stDe(r))]++; c.total++;
    });
    return Object.entries(m).sort((a, b) => b[1].sem - a[1].sem || b[1].total - a[1].total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, fluxoMap]);

  const doColecao = useMemo(() => base.filter(r => !fColecao || (r.colecao || "—") === fColecao), [base, fColecao]);

  const resumo = useMemo(() => {
    const c = vazio();
    doColecao.forEach(r => { c[catDe(stDe(r))]++; c.total++; });
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doColecao, fluxoMap]);

  const sorted = useMemo(() => {
    const s = q.toLowerCase();
    return doColecao
      .filter(r => !fStatus || catDe(stDe(r)) === fStatus)
      .filter(r => !s || `${r.ref} ${r.desc}`.toLowerCase().includes(s))
      .sort((a, b) => String(a.ref || "").localeCompare(String(b.ref || ""), "pt-BR", { numeric: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doColecao, fStatus, q, fluxoMap]);

  const temFiltro = !!(q || fColecao || fStatus || fFornecedor || fGrupo);
  const limpar = () => { setQ(""); setFColecao(""); setFStatus(""); setFFornecedor(""); setFGrupo(""); };

  if (loading) return <div className="plm-loading"><div className="plm-loading-spinner" /><span>Carregando...</span></div>;

  return (
    <div>
      {/* Resumo geral (respeita coleção, fornecedor e grupo) */}
      <div className="apple-card flex items-center gap-6 px-5 py-4 mb-4 flex-wrap">
        <div>
          <div className="text-[12px] text-[var(--label-secondary)]">Produção liberada{fColecao ? ` · ${fColecao}` : ""}</div>
          <div className="text-[22px] font-bold tabnum tracking-[-0.02em]">{resumo.total - resumo.sem} de {resumo.total} <span className="text-[13px] font-medium text-[var(--label-secondary)]">com pré-produção</span></div>
        </div>
        <div className="flex-1 min-w-[260px]">
          <Barra c={resumo} />
          <div className="flex gap-4 mt-2 text-[12px] flex-wrap">
            {CATS.map(k => (k.key === "sem" || k.key === "ok" || k.key === "restr" || resumo[k.key] > 0) && (
              <button key={k.key} onClick={() => setFStatus(fStatus === k.key ? "" : k.key)}
                className="hover:underline" style={{ color: k.tx, opacity: k.opacity ? 0.75 : 1, fontWeight: k.key === "sem" || fStatus === k.key ? 700 : 400 }}>
                ● {k.label} {resumo[k.key]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Resumo por coleção — clicar filtra a lista */}
      <div className="apple-card mb-4 overflow-x-auto">
        <table className="w-full text-[12px]" style={{ minWidth: 640 }}>
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-[var(--label-secondary)] text-left">
              <th className="px-4 py-2 font-semibold">Coleção</th>
              <th className="px-2 py-2 font-semibold text-right">Total</th>
              {CATS.map(k => <th key={k.key} className="px-2 py-2 font-semibold text-right whitespace-nowrap">{k.label}</th>)}
              <th className="px-4 py-2 font-semibold" style={{ width: 160 }}></th>
            </tr>
          </thead>
          <tbody>
            {porColecao.map(([col, c]) => {
              const ativo = fColecao === col;
              return (
                <tr key={col} onClick={() => setFColecao(ativo ? "" : col)} title={ativo ? "Mostrar todas as coleções" : `Filtrar ${col}`}
                  className="cursor-pointer border-t border-[var(--separator)] hover:bg-[var(--bg-secondary)]"
                  style={ativo ? { background: "var(--bg-secondary)" } : undefined}>
                  <td className="px-4 py-2 font-medium whitespace-nowrap">{ativo ? "▸ " : ""}{col}</td>
                  <td className="px-2 py-2 text-right tabnum font-semibold">{c.total}</td>
                  {CATS.map(k => (
                    <td key={k.key} className="px-2 py-2 text-right tabnum"
                      style={{ color: c[k.key] ? k.tx : "var(--label-quaternary)", fontWeight: k.key === "sem" && c.sem ? 700 : 400 }}>
                      {c[k.key] || "–"}
                    </td>
                  ))}
                  <td className="px-4 py-2"><Barra c={c} /></td>
                </tr>
              );
            })}
            {porColecao.length === 0 && (
              <tr><td colSpan={CATS.length + 3} className="px-4 py-6 text-center text-[var(--label-tertiary)]">Nenhuma referência.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div style={{ position: "relative", flex: "1 1 240px", maxWidth: 320 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--label-tertiary)" strokeWidth="2.2" strokeLinecap="round"
            style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por referência ou descrição..."
            className="apple-input w-full" style={{ paddingLeft: 28 }} />
        </div>
        <select value={fColecao} onChange={e => setFColecao(e.target.value)} className="apple-select text-[12px] py-1.5" aria-label="Coleção">
          <option value="">Todas as coleções</option>
          {opColecao.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <select value={fStatus} onChange={e => setFStatus(e.target.value as any)} className="apple-select text-[12px] py-1.5" aria-label="Status pré-produção">
          <option value="">Todos os status</option>
          {CATS.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}
        </select>
        <select value={fFornecedor} onChange={e => setFFornecedor(e.target.value)} className="apple-select text-[12px] py-1.5" aria-label="Fornecedor">
          <option value="">Todos os fornecedores</option>
          {opFornecedor.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <select value={fGrupo} onChange={e => setFGrupo(e.target.value)} className="apple-select text-[12px] py-1.5" aria-label="Grupo">
          <option value="">Todos os grupos</option>
          {opGrupo.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        {temFiltro && <button onClick={limpar} className="apple-btn-secondary text-[12px] py-1 px-3">Limpar filtros</button>}
        <span className="text-[12px] text-[var(--label-tertiary)] ml-auto">{sorted.length} de {elegiveis.length} com produção liberada</span>
      </div>

      <ScrollTable>
        <table className="plm-table" style={{ width: "max-content", minWidth: "100%" }}>
          <thead><tr>
            <th style={{ width: 120 }}>Referência</th>
            <th style={{ width: 260 }}>Descrição</th>
            <th style={{ width: 150 }}>Coleção</th>
            <th style={{ width: 140 }}>Grade</th>
            <th style={{ width: 180 }}>Tab. medidas</th>
            <th style={{ width: 160 }}>Fornecedor</th>
            <th style={{ width: 280 }}>Status Pré-Produção</th>
            <th style={{ width: 90 }}></th>
          </tr></thead>
          <tbody>
            {sorted.map(r => {
              const st = stDe(r);
              return (
                <tr key={r.id}>
                  <td className="font-medium px-3">{r.ref}</td>
                  <td className="px-3">{r.desc || "—"}</td>
                  <td className="px-3">{r.colecao || "—"}</td>
                  <td className="px-3">{r.grade || "—"}</td>
                  <td className="px-3">{r.tab_medidas || "—"}</td>
                  <td className="px-3">{r.fornecedor || "—"}</td>
                  <td className="px-3">
                    <div className="flex items-center gap-2">
                      <StatusPPPill status={st} />
                      {!st && (
                        <button onClick={() => marcarAntes(r.ref, true)} title="Pré-produção já liberada antes do PLM — tira da contagem de pendentes"
                          className="text-[11px] font-medium hover:underline whitespace-nowrap" style={{ color: "var(--st-prod-tx)" }}>Marcar liberada</button>
                      )}
                      {st === STATUS_PP_LIBERADA_ANTES && (
                        <button onClick={() => marcarAntes(r.ref, false)} title="Voltar para sem laudo"
                          className="text-[11px] hover:underline whitespace-nowrap text-[var(--label-tertiary)]">Desfazer</button>
                      )}
                    </div>
                  </td>
                  <td className="text-center px-2">
                    <button onClick={() => onOpenLaudo(r)} className="apple-btn-secondary text-[12px] py-1 px-3 whitespace-nowrap">Abrir laudo</button>
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr><td colSpan={8} className="py-16 text-center text-[var(--label-tertiary)]">
                Nenhuma referência com produção liberada{temFiltro ? " para esses filtros" : ""}.
              </td></tr>
            )}
          </tbody>
        </table>
      </ScrollTable>
    </div>
  );
}
