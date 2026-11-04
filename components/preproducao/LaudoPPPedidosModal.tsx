"use client";
import { useState, useEffect } from "react";
import { fetchFichaResolvida, fetchLaudoPPPedidos, criarLaudoPPPedido, deleteLaudoPPPedido, fetchControleFluxoByRef, upsertControleFluxo, type LaudoPPPedido } from "@/lib/db";
import { STATUS_PRE_PRODUCAO_COLORS } from "@/lib/constants";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import LaudoPPModal from "./LaudoPPModal";

function StatusPill({ status }: { status: string }) {
  if (!status) return <span className="text-[var(--label-quaternary)] text-[12px]">sem status ainda</span>;
  const st = STATUS_PRE_PRODUCAO_COLORS[status];
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap" style={st ? { background: st.bg, color: st.color } : { background: "rgba(142,142,147,0.12)", color: "var(--label-tertiary)" }}>
      {status}
    </span>
  );
}

type Props = { row: any; onClose: () => void };

export default function LaudoPPPedidosModal({ row, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [fichaId, setFichaId] = useState<number | null>(null);
  const [pedidos, setPedidos] = useState<LaudoPPPedido[]>([]);
  const [editingPedidoId, setEditingPedidoId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const { confirm, Dialog: ConfirmDialog } = useConfirm();

  const load = async () => {
    setLoading(true);
    const ficha = await fetchFichaResolvida(row.ref, row.colecao);
    const fid = ficha?.id ?? null;
    setFichaId(fid);
    const list = fid ? await fetchLaudoPPPedidos(fid) : [];
    setPedidos(list);
    // status_pre_producao (Controle de Fluxo) deve refletir sempre o laudo
    // mais recente — ou ficar vazio se não há mais nenhum. Recalcula aqui (não
    // só ao salvar/excluir um laudo) pra também corrigir referências que já
    // ficaram com status "preso" de laudos apagados antes desse recálculo existir.
    const novoStatus = list[0]?.status || "";
    const fluxo = await fetchControleFluxoByRef(row.ref);
    if ((fluxo?.status_pre_producao || "") !== novoStatus) {
      await upsertControleFluxo(row.ref, "status_pre_producao", novoStatus || null);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [row.ref]);

  const handleNovo = async () => {
    if (!fichaId || creating) return;
    setCreating(true);
    const id = await criarLaudoPPPedido(fichaId);
    setCreating(false);
    if (id) setEditingPedidoId(id);
  };

  const handleExcluir = async (p: LaudoPPPedido) => {
    const ok = await confirm({
      title: "Excluir laudo",
      message: `Isso apaga o laudo${p.numero_pedido ? ` do pedido ${p.numero_pedido}` : ""} — medidas, comentários e fotos. Não pode ser desfeito.`,
      confirmLabel: "Excluir",
      variant: "danger",
    });
    if (!ok) return;
    setDeletingId(p.id);
    await deleteLaudoPPPedido(p.id);
    setDeletingId(null);
    load();
  };

  if (editingPedidoId) {
    return (
      <LaudoPPModal
        row={row}
        fichaId={fichaId!}
        laudoPedidoId={editingPedidoId}
        onClose={() => { setEditingPedidoId(null); load(); }}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-2 sm:p-8 overflow-y-auto bg-black/30 backdrop-blur-[6px] no-print" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="laudo-pedidos-title" className="bg-[var(--bg-primary)] rounded-2xl w-full max-w-[640px] shadow-[0_24px_80px_rgba(0,0,0,0.18)] overflow-hidden" onClick={e => e.stopPropagation()}>
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
              <button onClick={handleNovo} disabled={creating} className="apple-btn-primary text-[13px] px-4 py-2.5 mb-4 w-full">
                {creating ? "Criando..." : "+ Novo laudo (pedido)"}
              </button>

              {pedidos.length === 0 ? (
                <p className="text-[13px] text-[var(--label-tertiary)] text-center py-6">Nenhum laudo criado ainda pra esta referência.</p>
              ) : (
                <div className="space-y-2">
                  {pedidos.map(p => (
                    <div key={p.id} className="apple-card p-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[13px] font-semibold">{p.numero_pedido ? `Pedido ${p.numero_pedido}` : "Sem número de pedido"}</div>
                        <div className="mt-1"><StatusPill status={p.status} /></div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => setEditingPedidoId(p.id)} className="apple-btn-secondary text-[12px] py-1.5 px-3">Abrir</button>
                        <button
                          onClick={handleNovo} disabled={creating}
                          title="Cria um novo laudo em branco pra outro pedido desta referência"
                          className="text-[12px] py-1.5 px-3 rounded-lg border border-[var(--separator)] text-[var(--label-secondary)] hover:border-[var(--system-blue)] hover:text-[var(--system-blue)] transition-colors"
                        >
                          Duplicar
                        </button>
                        <button
                          onClick={() => handleExcluir(p)} disabled={deletingId === p.id}
                          title="Excluir este laudo"
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--label-quaternary)] hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-50"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <ConfirmDialog />
    </div>
  );
}
