"use client";
import { useState, useEffect } from "react";
import {
  fetchFichaResolvida, fetchLaudoPPPedidos, criarLaudoPPPedido, deleteLaudoPPPedido, upsertLaudoPPPedido,
  fetchControleFluxoByRef, upsertControleFluxo, fetchPedidosProducao, type LaudoPPPedido,
} from "@/lib/db";
import { STATUS_PRE_PRODUCAO_COLORS, STATUS_PP_LIBERADA_ANTES } from "@/lib/constants";
import { juntarPedidos, mesclarFontes, fmtBR, hojeISO, SITUACAO_PP, type PedidoPP, type PedidoListaPP } from "@/lib/preproducao";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import LaudoPPModal from "./LaudoPPModal";

function Pill({ label, bg, color }: { label: string; bg: string; color: string }) {
  return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap" style={{ background: bg, color }}>{label}</span>;
}

function SituacaoPill({ p }: { p: PedidoPP }) {
  const s = SITUACAO_PP[p.situacao];
  if (p.situacao === "concluido" && p.status) {
    const st = STATUS_PRE_PRODUCAO_COLORS[p.status];
    return <Pill label={`Laudo concluído · ${p.status}`} bg={st?.bg || s.bg} color={st?.color || s.color} />;
  }
  if (p.atrasada) return <Pill label={`Pré atrasada (prev. ${fmtBR(p.previsaoPre)})`} bg="#FBE6E5" color="#A8221D" />;
  return <Pill label={s.label} bg={s.bg} color={s.color} />;
}

function Data({ l, v }: { l: string; v: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-[var(--label-tertiary)] font-semibold">{l}</div>
      <div className="text-[13px] font-semibold tabnum">{v ? fmtBR(v) : "—"}</div>
    </div>
  );
}

function DataInput({ l, v, onChange }: { l: string; v: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wide text-[var(--label-tertiary)] font-semibold">{l}</span>
      <input type="date" value={v} onChange={e => onChange(e.target.value)} className="apple-input text-[12px] py-1 w-full" />
    </label>
  );
}

type Props = { row: any; onClose: () => void };

export default function LaudoPPPedidosModal({ row, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [fichaId, setFichaId] = useState<number | null>(null);
  const [laudos, setLaudos] = useState<LaudoPPPedido[]>([]);
  const [lista, setLista] = useState<PedidoListaPP[]>([]);
  const [editing, setEditing] = useState<{ id: number; cores: string[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { confirm, Dialog: ConfirmDialog } = useConfirm();

  const load = async () => {
    setLoading(true);
    let ficha;
    try {
      ficha = await fetchFichaResolvida(row.ref, row.colecao);
    } catch (e: any) {
      // Sem a ficha não dá pra saber os laudos: não recalcula o status (ele
      // seria zerado como se a ref não tivesse laudo nenhum).
      alert(`Não foi possível carregar a ficha ${row.ref}.\n\n${e?.message || e}`);
      setLoading(false);
      return;
    }
    const fid = ficha?.id ?? null;
    setFichaId(fid);
    const [list, peds, linx] = await Promise.all([
      fid ? fetchLaudoPPPedidos(fid) : Promise.resolve([] as LaudoPPPedido[]),
      fetchPedidosProducao(row.id).catch(() => ({} as Record<number, PedidoListaPP[]>)),
      fetch(`/api/linx/pedidos?ref=${encodeURIComponent(row.ref)}`).then(r => r.ok ? r.json() : { pedidos: {} }).catch(() => ({ pedidos: {} })),
    ]);
    setLaudos(list);
    setLista(mesclarFontes(linx.pedidos?.[row.ref] || [], peds[row.id] || []));
    // status_pre_producao (Controle de Fluxo) reflete o resultado do laudo
    // mais recente que tem resultado — ou fica vazio se não há nenhum.
    const fluxo = await fetchControleFluxoByRef(row.ref);
    // Sem laudo nenhum, preserva a marcação manual "liberada antes do PLM".
    const atual = fluxo?.status_pre_producao || "";
    const comStatus = list.find(l => l.status);
    const novoStatus = comStatus?.status || (atual === STATUS_PP_LIBERADA_ANTES ? atual : "");
    if (atual !== novoStatus) await upsertControleFluxo(row.ref, "status_pre_producao", novoStatus || null);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [row.ref]);

  const pedidos = juntarPedidos(lista, laudos);

  // O laudo do pedido nasce quando alguém mexe nele (abre ou marca uma data).
  const garanteLaudo = async (p: PedidoPP): Promise<number | null> => {
    if (p.laudoId) {
      const l = laudos.find(x => x.id === p.laudoId);
      if (l && p.entregaProducao && l.data_entrega_producao !== p.entregaProducao)
        await upsertLaudoPPPedido(p.laudoId, { data_entrega_producao: p.entregaProducao });
      return p.laudoId;
    }
    if (!fichaId) return null;
    return criarLaudoPPPedido(fichaId, { numero_pedido: p.numero, data_entrega_producao: p.entregaProducao || null });
  };

  const chave = (p: PedidoPP) => `${p.laudoId ?? ""}|${p.numero}|${p.entregaProducao}`;

  const abrir = async (p: PedidoPP) => {
    setBusy(chave(p));
    const id = await garanteLaudo(p);
    setBusy(null);
    if (id) setEditing({ id, cores: p.cores });
    else alert("Não foi possível criar o laudo deste pedido.");
  };

  const setData = async (p: PedidoPP, campo: "data_entrega_pre" | "data_laudo", v: string) => {
    setBusy(chave(p));
    const id = await garanteLaudo(p);
    if (!id) { setBusy(null); alert("Não foi possível criar o laudo deste pedido."); return; }
    const err = await upsertLaudoPPPedido(id, { [campo]: v || null });
    // O kanban (etapa 19) lê a entrega da pré na referência.
    if (!err && campo === "data_entrega_pre" && v) await upsertControleFluxo(row.ref, "data_entrega_pre_producao", v);
    if (!err && campo === "data_laudo" && v) await upsertControleFluxo(row.ref, "data_retorno_pre_producao", v);
    setBusy(null);
    if (err) alert(`Não foi possível salvar a data.\n\n${err}\n\nSe o erro fala de coluna inexistente, falta rodar a migration 039 no Supabase.`);
    load();
  };

  const novoAvulso = async () => {
    if (!fichaId) return;
    setBusy("novo");
    const id = await criarLaudoPPPedido(fichaId);
    setBusy(null);
    if (id) setEditing({ id, cores: [] });
  };

  const handleExcluir = async (p: PedidoPP) => {
    if (!p.laudoId) return;
    const ok = await confirm({
      title: "Excluir laudo",
      message: `Isso apaga o laudo${p.numero ? ` do pedido ${p.numero}` : ""} — medidas, comentários, fotos e datas. Não pode ser desfeito.${p.cores.length ? " O pedido continua na lista, sem laudo." : ""}`,
      confirmLabel: "Excluir",
      variant: "danger",
    });
    if (!ok) return;
    setBusy(chave(p));
    await deleteLaudoPPPedido(p.laudoId);
    setBusy(null);
    load();
  };

  if (editing) {
    return (
      <LaudoPPModal
        row={row}
        fichaId={fichaId!}
        laudoPedidoId={editing.id}
        coresPedido={editing.cores}
        onClose={() => { setEditing(null); load(); }}
      />
    );
  }

  const conta = { pendente: 0, recebida: 0, concluido: 0 };
  pedidos.forEach(p => { conta[p.situacao]++; });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-2 sm:p-8 overflow-y-auto bg-black/30 backdrop-blur-[6px] no-print" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="laudo-pedidos-title" className="bg-[var(--bg-primary)] rounded-2xl w-full max-w-[760px] shadow-[0_24px_80px_rgba(0,0,0,0.18)] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--separator)]">
          <div id="laudo-pedidos-title">
            <h2 className="text-[16px] font-bold">Laudos de Pré-Produção</h2>
            <p className="text-[12px] text-[var(--label-tertiary)]">{row.ref} — {row.desc}</p>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="w-8 h-8 rounded-full bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] flex items-center justify-center text-[var(--label-secondary)] flex-shrink-0">
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div className="p-5">
          {loading ? (
            <div className="p-10 text-center"><div className="plm-loading"><div className="plm-loading-spinner" /></div></div>
          ) : !fichaId ? (
            <div className="apple-card p-8 text-center"><p className="text-[14px] font-medium text-[var(--label-secondary)]">Esta referência ainda não tem ficha técnica cadastrada.</p></div>
          ) : (
            <>
              {pedidos.length > 0 && (
                <div className="flex gap-4 mb-3 text-[12px] flex-wrap">
                  <span style={{ color: SITUACAO_PP.pendente.color }}>● Aguardando pré {conta.pendente}</span>
                  <span style={{ color: SITUACAO_PP.recebida.color, fontWeight: 700 }}>● Pré entregue, sem laudo {conta.recebida}</span>
                  <span style={{ color: SITUACAO_PP.concluido.color }}>● Laudo concluído {conta.concluido}</span>
                </div>
              )}

              {pedidos.length === 0 ? (
                <p className="text-[13px] text-[var(--label-tertiary)] text-center py-6">
                  Nenhum pedido de produção em aberto no Linx nem na lista de Variantes para esta referência.<br />
                  Quando o pedido for lançado (ou preenchido em Variantes), o laudo aparece aqui.
                </p>
              ) : (
                <div className="space-y-2">
                  {pedidos.map(p => {
                    const k = chave(p);
                    return (
                      <div key={k} className="apple-card p-3" style={{ opacity: busy === k ? 0.6 : 1 }}>
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="min-w-0">
                            <div className="text-[14px] font-semibold">{p.numero ? `Pedido ${p.numero}` : "Pedido sem número"}{p.qtd ? <span className="text-[12px] font-normal text-[var(--label-tertiary)]"> · {p.qtd} pçs</span> : null}</div>
                            {(p.tipo || p.fornecedor) && <div className="text-[11px] text-[var(--label-tertiary)]">{[p.tipo, p.fornecedor].filter(Boolean).join(" · ")}</div>}
                            <div className="flex gap-1 flex-wrap mt-1">
                              {p.cores.length
                                ? p.cores.map(c => <span key={c} className="text-[11px] px-2 py-0.5 rounded-md bg-[var(--bg-secondary)] text-[var(--label-secondary)]">{c}</span>)
                                : <span className="text-[11px] text-[var(--label-quaternary)]">{p.laudoId && !p.entregaProducao ? "laudo avulso" : "pedido fora da lista"}</span>}
                            </div>
                          </div>
                          <SituacaoPill p={p} />
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 items-end">
                          <Data l="Entrega produção" v={p.entregaProducao} />
                          <Data l="Previsão da pré" v={p.previsaoPre} />
                          <DataInput l="Pré entregue" v={p.entregaPre} onChange={v => setData(p, "data_entrega_pre", v)} />
                          <DataInput l="Laudo feito" v={p.dataLaudo} onChange={v => setData(p, "data_laudo", v)} />
                        </div>

                        <div className="flex gap-2 mt-3 justify-end">
                          {!p.entregaPre && !p.dataLaudo && (
                            <button onClick={() => setData(p, "data_entrega_pre", hojeISO())} disabled={busy === k}
                              className="text-[12px] py-1.5 px-3 rounded-lg border border-[var(--separator)] text-[var(--label-secondary)] hover:bg-[var(--bg-secondary)]">
                              Pré chegou hoje
                            </button>
                          )}
                          <button onClick={() => abrir(p)} disabled={busy === k} className={`${p.situacao === "concluido" ? "apple-btn-secondary" : "apple-btn-primary"} text-[12px] py-1.5 px-4`}>
                            {p.situacao === "concluido" ? "Abrir laudo" : "Preencher laudo"}
                          </button>
                          {p.laudoId && (
                            <button onClick={() => handleExcluir(p)} disabled={busy === k} title="Excluir este laudo"
                              className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--label-quaternary)] hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-50">
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></svg>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <button onClick={novoAvulso} disabled={busy === "novo"} className="mt-4 text-[12px] text-[var(--label-tertiary)] hover:underline">
                {busy === "novo" ? "Criando..." : "+ Laudo avulso (pedido fora da lista)"}
              </button>
            </>
          )}
        </div>
      </div>
      <ConfirmDialog />
    </div>
  );
}
