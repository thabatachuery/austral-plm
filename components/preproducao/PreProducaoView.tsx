"use client";
import { useState, useEffect, useMemo } from "react";
import { fetchControleFluxo, upsertControleFluxo, fetchLaudosPPTodos, fetchPedidosProducao, type LaudoPPPedido } from "@/lib/db";
import { subscribeRealtime } from "@/lib/realtime";
import { STATUS_ESTILO, STATUS_PRE_PRODUCAO_COLORS, STATUS_PP_LIBERADA_ANTES } from "@/lib/constants";
import { juntarPedidos, mesclarFontes, fmtBR, SITUACAO_PP, type PedidoPP, type PedidoListaPP, type SituacaoPP } from "@/lib/preproducao";

// Situação de pré-produção da referência, a partir dos pedidos: o que pede
// ação primeiro (pré entregue sem laudo > aguardando pré > concluído).
function SituacaoRef({ peds }: { peds: PedidoPP[] }) {
  const rec = peds.filter(p => p.situacao === "recebida").length;
  const pend = peds.filter(p => p.situacao === "pendente");
  const atras = pend.filter(p => p.atrasada).length;
  const conc = peds.filter(p => p.situacao === "concluido").length;
  let pill: { label: string; bg: string; color: string };
  if (rec) pill = { ...SITUACAO_PP.recebida, label: rec > 1 ? `${rec} pré entregues · laudo pendente` : SITUACAO_PP.recebida.label };
  else if (atras) pill = { label: `Pré atrasada (prev. ${fmtBR(pend.find(p => p.atrasada)!.previsaoPre)})`, bg: "#FBE6E5", color: "#A8221D" };
  else if (pend.length) {
    const prox = pend.map(p => p.previsaoPre).filter(Boolean).sort()[0];
    pill = { ...SITUACAO_PP.pendente, label: `Aguardando pré${prox ? ` · prev. ${fmtBR(prox)}` : ""}` };
  } else {
    const ult = [...peds].sort((a, b) => (b.dataLaudo || "").localeCompare(a.dataLaudo || ""))[0];
    const st = STATUS_PRE_PRODUCAO_COLORS[ult?.status || ""];
    pill = { label: `Laudo concluído${ult?.status ? ` · ${ult.status}` : ""}`, bg: st?.bg || SITUACAO_PP.concluido.bg, color: st?.color || SITUACAO_PP.concluido.color };
  }
  return (
    <div className="flex flex-col gap-0.5">
      <span className="inline-flex self-start items-center px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap" style={{ background: pill.bg, color: pill.color }}>{pill.label}</span>
      {peds.length > 1 && <span className="text-[11px] text-[var(--label-tertiary)]">{peds.length} pedidos · {conc} concluído{conc === 1 ? "" : "s"}</span>}
    </div>
  );
}
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
  const [fSit, setFSit] = useState<"" | SituacaoPP | "atrasada">("");
  const [laudos, setLaudos] = useState<(LaudoPPPedido & { ref: string })[]>([]);
  const [listaPorProduto, setListaPorProduto] = useState<Record<number, PedidoListaPP[]>>({});
  const [linxPorRef, setLinxPorRef] = useState<Record<string, PedidoListaPP[]>>({});
  const [linxErro, setLinxErro] = useState("");

  const loadLaudos = () => fetchLaudosPPTodos().then(setLaudos).catch(() => {});
  useEffect(() => {
    loadLaudos();
    fetchPedidosProducao().then(setListaPorProduto).catch(() => {});
    fetch("/api/linx/pedidos").then(async r => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setLinxPorRef(j.pedidos || {});
    }).catch(e => setLinxErro(String(e?.message || e)));
    const unsub = subscribeRealtime("preproducao-laudos", [
      { table: "ficha_laudo_pp_pedidos", onInsert: loadLaudos, onUpdate: loadLaudos, onDelete: loadLaudos },
    ]);
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Pedidos de cada ref (Linx + lista de Variantes + laudos gravados).
  const pedidosPorRef = useMemo(() => {
    const laudosRef: Record<string, typeof laudos> = {};
    laudos.forEach(l => { (laudosRef[l.ref] ||= []).push(l); });
    const out: Record<string, PedidoPP[]> = {};
    elegiveis.forEach(r => {
      const peds = juntarPedidos(mesclarFontes(linxPorRef[r.ref] || [], listaPorProduto[r.id] || []), laudosRef[r.ref] || []);
      if (peds.length) out[r.ref] = peds;
    });
    return out;
  }, [elegiveis, laudos, listaPorProduto, linxPorRef]);

  // Ref marcada "liberada antes do PLM" sem nenhum laudo gravado: os pedidos
  // dela não entram como pendência (a pré já foi aprovada fora do PLM).
  const pedidosQueContam = (r: any): PedidoPP[] => {
    const peds = pedidosPorRef[r.ref] || [];
    if (stDe(r) === STATUS_PP_LIBERADA_ANTES && !peds.some(p => p.laudoId)) return [];
    return peds;
  };

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

  // Resumo por pedido: laudos pendentes (aguardando pré), pré recebida sem
  // laudo e laudo concluído — respeita coleção, fornecedor e grupo.
  const resumoPed = useMemo(() => {
    const c = { pendente: 0, atrasada: 0, recebida: 0, concluido: 0 };
    doColecao.forEach(r => pedidosQueContam(r).forEach(p => { c[p.situacao]++; if (p.atrasada) c.atrasada++; }));
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doColecao, pedidosPorRef, fluxoMap]);

  const sorted = useMemo(() => {
    const s = q.toLowerCase();
    return doColecao
      .filter(r => !fSit || pedidosQueContam(r).some(p => (fSit === "atrasada" ? p.atrasada : p.situacao === fSit)))
      .filter(r => !fStatus || catDe(stDe(r)) === fStatus)
      .filter(r => !s || `${r.ref} ${r.desc}`.toLowerCase().includes(s))
      .sort((a, b) => String(a.ref || "").localeCompare(String(b.ref || ""), "pt-BR", { numeric: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doColecao, fStatus, fSit, q, fluxoMap, pedidosPorRef]);

  const temFiltro = !!(q || fColecao || fStatus || fFornecedor || fGrupo || fSit);
  const limpar = () => { setQ(""); setFColecao(""); setFStatus(""); setFFornecedor(""); setFGrupo(""); setFSit(""); };

  const CARDS_PED: { key: SituacaoPP | "atrasada"; label: string; n: number; cor: string; dica: string }[] = [
    { key: "pendente",  label: "Laudos pendentes",            n: resumoPed.pendente,  cor: SITUACAO_PP.pendente.color,  dica: "Pedidos aguardando a pré-produção chegar" },
    { key: "recebida",  label: "Pré recebida · sem laudo",    n: resumoPed.recebida,  cor: SITUACAO_PP.recebida.color,  dica: "A pré chegou e o laudo ainda não foi feito" },
    { key: "concluido", label: "Laudos concluídos",           n: resumoPed.concluido, cor: SITUACAO_PP.concluido.color, dica: "Pedidos com laudo feito" },
  ];

  if (loading) return <div className="plm-loading"><div className="plm-loading-spinner" /><span>Carregando...</span></div>;

  return (
    <div>
      {/* Resumo por pedido — clicar filtra a lista */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        {CARDS_PED.map(c => {
          const ativo = fSit === c.key;
          return (
            <button key={c.key} onClick={() => setFSit(ativo ? "" : c.key)} title={c.dica}
              className="apple-card px-4 py-3 text-left transition-shadow hover:shadow-md"
              style={ativo ? { outline: `2px solid ${c.cor}`, outlineOffset: -2 } : undefined}>
              <div className="text-[12px] text-[var(--label-secondary)]">{c.label}</div>
              <div className="flex items-baseline gap-2">
                <span className="text-[24px] font-bold tabnum tracking-[-0.02em]" style={{ color: c.cor }}>{c.n}</span>
                <span className="text-[11px] text-[var(--label-tertiary)]">pedido{c.n === 1 ? "" : "s"}</span>
                {c.key === "pendente" && resumoPed.atrasada > 0 && (
                  <span role="button" onClick={e => { e.stopPropagation(); setFSit(fSit === "atrasada" ? "" : "atrasada"); }}
                    className="ml-auto text-[11px] font-semibold px-2 py-0.5 rounded-full hover:underline" style={{ background: "#FBE6E5", color: "#A8221D" }}>
                    {resumoPed.atrasada} atrasada{resumoPed.atrasada === 1 ? "" : "s"}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
      {linxErro && <div className="text-[12px] mb-3" style={{ color: "var(--st-canc-tx)" }}>Não foi possível ler os pedidos do Linx ({linxErro}) — mostrando só os pedidos da lista de Variantes.</div>}

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
            <th style={{ width: 200 }}>Pedidos (entrega)</th>
            <th style={{ width: 300 }}>Status Pré-Produção</th>
            <th style={{ width: 90 }}></th>
          </tr></thead>
          <tbody>
            {sorted.map(r => {
              const st = stDe(r);
              const todos = pedidosPorRef[r.ref] || [];
              const peds = pedidosQueContam(r);
              return (
                <tr key={r.id}>
                  <td className="font-medium px-3">{r.ref}</td>
                  <td className="px-3">{r.desc || "—"}</td>
                  <td className="px-3">{r.colecao || "—"}</td>
                  <td className="px-3">{r.grade || "—"}</td>
                  <td className="px-3">{r.tab_medidas || "—"}</td>
                  <td className="px-3">{r.fornecedor || "—"}</td>
                  <td className="px-3 text-[12px] tabnum">
                    {todos.length ? todos.map(p => (
                      <div key={`${p.laudoId}|${p.numero}|${p.entregaProducao}`} className="whitespace-nowrap" style={{ color: SITUACAO_PP[p.situacao].color }}>
                        {p.numero || "s/ nº"}{p.entregaProducao ? ` · ${fmtBR(p.entregaProducao)}` : ""}
                      </div>
                    )) : <span className="text-[var(--label-quaternary)]">—</span>}
                  </td>
                  <td className="px-3">
                    {peds.length ? <SituacaoRef peds={peds} /> : (
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
                    )}
                  </td>
                  <td className="text-center px-2">
                    <button onClick={() => onOpenLaudo(r)} className="apple-btn-secondary text-[12px] py-1 px-3 whitespace-nowrap">Abrir laudo</button>
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr><td colSpan={9}className="py-16 text-center text-[var(--label-tertiary)]">
                Nenhuma referência com produção liberada{temFiltro ? " para esses filtros" : ""}.
              </td></tr>
            )}
          </tbody>
        </table>
      </ScrollTable>
    </div>
  );
}
