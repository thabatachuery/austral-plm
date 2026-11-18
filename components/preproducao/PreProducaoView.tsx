"use client";
import { useState, useEffect, useMemo } from "react";
import { fetchControleFluxo } from "@/lib/db";
import { subscribeRealtime } from "@/lib/realtime";
import { STATUS_ESTILO, STATUS_PRE_PRODUCAO_COLORS } from "@/lib/constants";
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

type Props = { rows: any[]; onOpenLaudo: (row: any) => void };

export default function PreProducaoView({ rows, onOpenLaudo }: Props) {
  const [fluxoMap, setFluxoMap] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

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

  const elegiveis = useMemo(
    () => rows.filter(r => r.status === STATUS_ESTILO.PRODUCAO_LIBERADA),
    [rows],
  );

  const filtered = useMemo(() => {
    if (!q) return elegiveis;
    const s = q.toLowerCase();
    return elegiveis.filter(r => `${r.ref} ${r.desc}`.toLowerCase().includes(s));
  }, [elegiveis, q]);

  const sorted = useMemo(
    () => [...filtered].sort((a, b) => String(a.ref || "").localeCompare(String(b.ref || ""), "pt-BR", { numeric: true })),
    [filtered],
  );

  // Resumo do topo: laudos aprovados, com restrição e pendentes (sem laudo).
  const resumo = useMemo(() => {
    let ok = 0, restr = 0, reprov = 0, sem = 0;
    elegiveis.forEach(r => {
      const st = fluxoMap[r.ref]?.status_pre_producao || "";
      if (!st) sem++; else if (st === "LIBERADA") ok++; else if (st.startsWith("LIBERADA")) restr++; else reprov++;
    });
    return { ok, restr, reprov, sem };
  }, [elegiveis, fluxoMap]);

  if (loading) return <div className="plm-loading"><div className="plm-loading-spinner" /><span>Carregando...</span></div>;

  return (
    <div>
      {(() => {
        const tot = elegiveis.length || 1;
        const pct = (n: number) => `${(n / tot) * 100}%`;
        return (
          <div className="apple-card flex items-center gap-6 px-5 py-4 mb-4 flex-wrap">
            <div>
              <div className="text-[12px] text-[var(--label-secondary)]">Produção liberada</div>
              <div className="text-[22px] font-bold tabnum tracking-[-0.02em]">{sorted.length} de {elegiveis.length}</div>
            </div>
            <div className="flex-1 min-w-[260px]">
              <div className="h-2.5 rounded-full bg-[var(--bg-secondary)] overflow-hidden flex">
                <div style={{ width: pct(resumo.ok), background: "var(--st-prod)" }} />
                <div style={{ width: pct(resumo.restr), background: "var(--st-rep)" }} />
                <div style={{ width: pct(resumo.reprov), background: "var(--st-canc)" }} />
              </div>
              <div className="flex gap-4 mt-2 text-[12px] flex-wrap">
                <span style={{ color: "var(--st-prod-tx)" }}>● Liberada {resumo.ok}</span>
                <span style={{ color: "var(--st-rep-tx)" }}>● Com restrição {resumo.restr}</span>
                {resumo.reprov > 0 && <span style={{ color: "var(--st-canc-tx)" }}>● Reprovada {resumo.reprov}</span>}
                <span style={{ color: "var(--st-canc-tx)", fontWeight: 700 }}>● Sem laudo {resumo.sem}</span>
              </div>
            </div>
          </div>
        );
      })()}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div style={{ position: "relative", flex: "1 1 280px", maxWidth: 360 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--label-tertiary)" strokeWidth="2.2" strokeLinecap="round"
            style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por referência ou descrição..."
            className="apple-input w-full" style={{ paddingLeft: 28 }} />
        </div>
        <span className="text-[12px] text-[var(--label-tertiary)]">{sorted.length} de {elegiveis.length} com produção liberada</span>
      </div>

      <ScrollTable>
        <table className="plm-table" style={{ width: "max-content", minWidth: "100%" }}>
          <thead><tr>
            <th style={{ width: 120 }}>Referência</th>
            <th style={{ width: 260 }}>Descrição</th>
            <th style={{ width: 140 }}>Grade</th>
            <th style={{ width: 180 }}>Tab. medidas</th>
            <th style={{ width: 160 }}>Fornecedor</th>
            <th style={{ width: 200 }}>Status Pré-Produção</th>
            <th style={{ width: 90 }}></th>
          </tr></thead>
          <tbody>
            {sorted.map(r => (
              <tr key={r.id}>
                <td className="font-medium px-3">{r.ref}</td>
                <td className="px-3">{r.desc || "—"}</td>
                <td className="px-3">{r.grade || "—"}</td>
                <td className="px-3">{r.tab_medidas || "—"}</td>
                <td className="px-3">{r.fornecedor || "—"}</td>
                <td className="px-3"><StatusPPPill status={fluxoMap[r.ref]?.status_pre_producao || ""} /></td>
                <td className="text-center px-2">
                  <button onClick={() => onOpenLaudo(r)} className="apple-btn-secondary text-[12px] py-1 px-3 whitespace-nowrap">Abrir laudo</button>
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr><td colSpan={7} className="py-16 text-center text-[var(--label-tertiary)]">
                Nenhuma referência com produção liberada{q ? " para essa busca" : ""}.
              </td></tr>
            )}
          </tbody>
        </table>
      </ScrollTable>
    </div>
  );
}
