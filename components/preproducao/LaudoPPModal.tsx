"use client";
import { useState, useEffect, useMemo, useRef, Fragment } from "react";
import {
  fetchFichaResolvida, fetchPontosByTabelaNome, fetchGraduacoesByTabelaNome, fetchTabelasMedidas,
  fetchLaudoPPMedidas, upsertLaudoPPMedidas, fetchLaudoPPPedido, upsertLaudoPPPedido,
  fetchControleFluxoByRef, upsertControleFluxo,
} from "@/lib/db";
import { tamanhosParaExibir, valorNoTamanho, calcularDaBase, num, parseTolerancia } from "@/lib/tamanhos";
import { uploadImage, deleteImage } from "@/lib/storage";
import { STATUS_PRE_PRODUCAO_OPTS, STATUS_PRE_PRODUCAO_COLORS } from "@/lib/constants";
import { useToast } from "@/components/ui/Toast";
import LaudoPPPDF from "./LaudoPPPDF";
import FichaModal from "@/components/ficha/FichaModal";

type Ponto = { cod: string; desc: string; tabela: string; tol: string };
type Grad = { desc: string; valores: Record<string, string>; ampliacoes: Record<string, string>; tol: string };

function Field({ l, v }: { l: string; v: any }) {
  return (
    <div className="flex items-baseline gap-2.5 px-4 py-2 border-b border-r border-[var(--separator)]">
      <span className="text-[11px] text-[var(--label-secondary)] whitespace-nowrap font-medium">{l}:</span>
      <span className="text-[13px] font-semibold">{v || "—"}</span>
    </div>
  );
}

function EditableField({ l, children }: { l: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2.5 px-4 py-2 border-b border-r border-[var(--separator)]">
      <span className="text-[11px] text-[var(--label-secondary)] whitespace-nowrap font-medium shrink-0">{l}:</span>
      {children}
    </div>
  );
}

// Compara o medido com o esperado e devolve o veredito da célula.
export function cellStatus(esperado: string, medido: string, tol: string): "vazio" | "ok" | "acima" | "abaixo" {
  if (!medido || !String(medido).trim()) return "vazio";
  const e = num(esperado), m = num(medido);
  if (isNaN(e) || isNaN(m)) return "vazio";
  const dif = m - e;
  const t = parseTolerancia(tol);
  if (Math.abs(dif) <= t) return "ok";
  return dif > 0 ? "acima" : "abaixo";
}

const CELL_STYLE: Record<string, React.CSSProperties> = {
  ok:     { color: "#1a7a35" },
  acima:  { color: "#c41e3a", background: "rgba(234,47,70,0.08)", fontWeight: 700 },
  abaixo: { color: "#b86a00", background: "rgba(255,149,0,0.10)", fontWeight: 700 },
  vazio:  {},
};

const fmtDateInput = (v: any) => (v ? String(v).slice(0, 10) : "");

type Props = { row: any; fichaId: number; laudoPedidoId: number; onClose: () => void };

export default function LaudoPPModal({ row, fichaId, laudoPedidoId, onClose }: Props) {
  // Ficha completa ao lado do laudo, só para conferir o que foi entregue
  // (tecidos, aviamentos, estamparia, medidas). Não grava nada.
  const [verFicha, setVerFicha] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pts, setPts] = useState<Ponto[]>([]);
  const [grad, setGrad] = useState<Grad[]>([]);
  const [tabTamanhos, setTabTamanhos] = useState<string[]>([]);
  const [tabBase, setTabBase] = useState("");
  const [medidas, setMedidas] = useState<Record<string, Record<string, string>>>({});
  const [status, setStatus] = useState("");
  const [numeroPedido, setNumeroPedido] = useState("");
  const [coresTamanho, setCoresTamanho] = useState<Record<string, string>>({});
  const [coresDisponiveis, setCoresDisponiveis] = useState<string[]>([]);
  const [fluxo, setFluxo] = useState<any>(null);
  const [imgModoMedir, setImgModoMedir] = useState<string | null>(null);
  const [comentarios, setComentarios] = useState("");
  const [fotos, setFotos] = useState<string[]>([]);
  const [fotoUploading, setFotoUploading] = useState(false);
  const [fotoDragOver, setFotoDragOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const fotoInputRef = useRef<HTMLInputElement>(null);
  const { success, Container: ToastContainer } = useToast();

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [ficha, fluxoData, tabs, pedido] = await Promise.all([
        fetchFichaResolvida(row.ref),
        fetchControleFluxoByRef(row.ref),
        fetchTabelasMedidas(),
        fetchLaudoPPPedido(laudoPedidoId),
      ]);
      setFluxo(fluxoData);
      const tabInfo = tabs.find((t: any) => t.nome === row.tab_medidas);
      setImgModoMedir((tabInfo as any)?.imagem_modo_medir || null);
      const cores = Array.from(new Set((ficha?.tecidos || []).flatMap((t: any) => t.cores || []).filter(Boolean)));
      setCoresDisponiveis(cores as string[]);

      if (row.tab_medidas) {
        const [p, g] = await Promise.all([
          fetchPontosByTabelaNome(row.tab_medidas),
          fetchGraduacoesByTabelaNome(row.tab_medidas),
        ]);
        setPts(p);
        setGrad(g.linhas);
        setTabTamanhos(g.tamanhos);
        setTabBase(g.base);
      }
      if (pedido) {
        setNumeroPedido(pedido.numero_pedido);
        setStatus(pedido.status);
        setComentarios(pedido.comentarios);
        setFotos(pedido.fotos);
        setCoresTamanho(pedido.cores_tamanho);
      }
      setMedidas(await fetchLaudoPPMedidas(laudoPedidoId));
      setLoading(false);
    })();
  }, [row.ref, row.tab_medidas, laudoPedidoId]);

  const gradTamanhos = useMemo(() => tamanhosParaExibir(tabTamanhos, row.grade), [tabTamanhos, row.grade]);
  const gradBase = tabBase || tabTamanhos[Math.floor(tabTamanhos.length / 2)] || "";
  const valorGrad = (g: Grad, t: string) => valorNoTamanho(g as any, t, tabTamanhos);

  // Graduação aprovada: mesma conta da aba "Graduação de Produção" da ficha
  // técnica — parte do valor nominal da tabela no tamanho base e acumula as
  // ampliações pros demais tamanhos.
  const esperados = useMemo(() => grad.map(g => {
    const medidaBase = valorGrad(g, gradBase);
    if (isNaN(num(medidaBase))) {
      const out: Record<string, string> = {};
      gradTamanhos.forEach(t => { out[t] = valorGrad(g, t); });
      return out;
    }
    return calcularDaBase(g as any, gradTamanhos, gradBase, medidaBase);
  }), [grad, gradTamanhos, gradBase, tabTamanhos]);

  const setMedido = (cod: string, t: string, v: string) => {
    setMedidas(prev => ({ ...prev, [cod]: { ...(prev[cod] || {}), [t]: v } }));
  };

  const statusSugerido = (): string => {
    let algumMedido = false, algumFora = false;
    pts.forEach((pt, i) => {
      gradTamanhos.forEach(t => {
        const medido = medidas[pt.cod]?.[t];
        if (!medido || !String(medido).trim()) return;
        algumMedido = true;
        const st = cellStatus(esperados[i]?.[t], medido, pt.tol);
        if (st === "acima" || st === "abaixo") algumFora = true;
      });
    });
    return algumMedido ? (algumFora ? "REPROVADA - CORRIGIR" : "LIBERADA") : status;
  };

  const handleSave = async () => {
    setSaving(true);
    await Promise.all([
      upsertLaudoPPMedidas(laudoPedidoId, medidas),
      upsertLaudoPPPedido(laudoPedidoId, { comentarios }),
    ]);
    const sugerido = statusSugerido();
    setStatus(sugerido);
    await Promise.all([
      upsertLaudoPPPedido(laudoPedidoId, { status: sugerido }),
      upsertControleFluxo(row.ref, "status_pre_producao", sugerido || null),
    ]);
    setSaving(false);
    success("Laudo salvo.");
  };

  const handleStatusChange = async (v: string) => {
    setStatus(v);
    await Promise.all([
      upsertLaudoPPPedido(laudoPedidoId, { status: v }),
      upsertControleFluxo(row.ref, "status_pre_producao", v || null),
    ]);
  };

  const handleNumeroPedidoChange = async (v: string) => {
    if (v === numeroPedido) return;
    setNumeroPedido(v);
    await upsertLaudoPPPedido(laudoPedidoId, { numero_pedido: v });
  };

  const handleFluxoDateChange = async (field: "data_entrega_pre_producao" | "data_retorno_pre_producao", v: string) => {
    setFluxo((prev: any) => ({ ...(prev || {}), [field]: v }));
    await upsertControleFluxo(row.ref, field, v || null);
  };

  const setCorTamanho = (t: string, cor: string) => {
    const next = { ...coresTamanho, [t]: cor };
    setCoresTamanho(next);
    upsertLaudoPPPedido(laudoPedidoId, { cores_tamanho: next });
  };

  const bullets: string[] = comentarios ? comentarios.split("\n") : [""];
  const setBullet = (i: number, v: string) => {
    const nb = [...bullets]; nb[i] = v;
    setComentarios(nb.join("\n"));
  };
  const removeBullet = (i: number) => {
    setComentarios(bullets.filter((_, j) => j !== i).join("\n"));
  };
  const addBullet = () => setComentarios(comentarios ? comentarios + "\n" : "\n");

  // Fotos anexadas ao laudo — a lista persiste na hora (upload já é uma
  // ação de rede concluída; não faz sentido depender do botão "Salvar" pra
  // não perder o anexo se a pessoa fechar o modal antes de clicar salvar).
  const handleAddFotos = async (files: FileList | null) => {
    if (!files || !files.length) return;
    const imgs = Array.from(files).filter(f => f.type.startsWith("image/"));
    if (!imgs.length) return;
    setFotoUploading(true);
    const urls = await Promise.all(
      imgs.map((f, i) => uploadImage(f, `${row.ref}/laudo_pp_${Date.now()}_${i}`)),
    );
    const novasFotos = [...fotos, ...urls.filter((u): u is string => !!u)];
    setFotos(novasFotos);
    await upsertLaudoPPPedido(laudoPedidoId, { fotos: novasFotos });
    setFotoUploading(false);
    if (fotoInputRef.current) fotoInputRef.current.value = "";
  };
  const handleRemoveFoto = async (url: string) => {
    const novasFotos = fotos.filter(f => f !== url);
    setFotos(novasFotos);
    await upsertLaudoPPPedido(laudoPedidoId, { fotos: novasFotos });
    await deleteImage(url);
  };
  const handleDropFotos = (e: React.DragEvent) => {
    e.preventDefault();
    setFotoDragOver(false);
    handleAddFotos(e.dataTransfer.files);
  };

  const doExport = () => {
    setShowPrint(true);
    document.body.classList.add("printing-pdf");
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, "0");
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const yyyy = today.getFullYear();
    const pdfName = `${row.ref} - Laudo Pré-Produção${numeroPedido ? ` - Pedido ${numeroPedido}` : ""} - ${dd}-${mm}-${yyyy}`;
    const prevTitle = document.title;
    const onBefore = () => { document.title = pdfName; };
    const onAfter = () => {
      document.title = prevTitle;
      window.removeEventListener("beforeprint", onBefore);
      window.removeEventListener("afterprint", onAfter);
      setTimeout(() => { setShowPrint(false); document.body.classList.remove("printing-pdf"); }, 300);
    };
    window.addEventListener("beforeprint", onBefore);
    window.addEventListener("afterprint", onAfter);
    document.title = pdfName;
    setTimeout(() => { window.print(); }, 300);
  };

  const statusStyle = STATUS_PRE_PRODUCAO_COLORS[status];

  if (showPrint) {
    return (
      <div className="print-overlay">
        <LaudoPPPDF
          row={row} pts={pts} gradTamanhos={gradTamanhos} gradBase={gradBase} esperados={esperados} medidas={medidas}
          statusPP={status} imgModoMedir={imgModoMedir} comentarios={comentarios} fotos={fotos}
          numeroPedido={numeroPedido} coresTamanho={coresTamanho}
          dataRecebimentoPre={fmtDateInput(fluxo?.data_entrega_pre_producao)} dataLiberacao={fmtDateInput(fluxo?.data_retorno_pre_producao)}
        />
      </div>
    );
  }

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-start justify-center p-2 sm:p-8 overflow-y-auto bg-black/30 backdrop-blur-[6px] no-print" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="laudo-pp-title" className="bg-[var(--bg-primary)] rounded-2xl w-full max-w-[1200px] shadow-[0_24px_80px_rgba(0,0,0,0.18)] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-[var(--separator)] gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <div id="laudo-pp-title">
              <h2 className="text-[16px] font-bold">Laudo de Pré-Produção</h2>
              <p className="text-[12px] text-[var(--label-tertiary)]">{row.ref} — {row.desc}{numeroPedido && ` — Pedido ${numeroPedido}`}</p>
            </div>
            {!loading && (
              <select
                value={status} onChange={e => handleStatusChange(e.target.value)}
                className="text-[13px] font-bold rounded-full px-4 py-1.5 border-none outline-none cursor-pointer"
                style={statusStyle ? { background: statusStyle.bg, color: statusStyle.color } : { background: "var(--bg-secondary)", color: "var(--label-secondary)" }}
              >
                {STATUS_PRE_PRODUCAO_OPTS.map(s => <option key={s} value={s}>{s || "— sem status —"}</option>)}
              </select>
            )}
          </div>
          <div className="flex gap-2 items-center">
            <button onClick={() => setVerFicha(true)} className="text-[12px] sm:text-[13px] font-medium text-[var(--system-blue)] hover:bg-blue-50 px-2 sm:px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap">
              <svg aria-hidden="true" className="inline mr-1" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></svg>
              Ver ficha completa
            </button>
            {!loading && (
              <button onClick={doExport} className="text-[12px] sm:text-[13px] font-medium text-[var(--system-blue)] hover:bg-blue-50 px-2 sm:px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap">
                <svg aria-hidden="true" className="inline mr-1" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                Exportar PDF
              </button>
            )}
            <button onClick={onClose} aria-label="Fechar" className="w-8 h-8 rounded-full bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] flex items-center justify-center text-[var(--label-secondary)] flex-shrink-0">
              <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-16 text-center"><div className="plm-loading"><div className="plm-loading-spinner" /></div></div>
        ) : (
          <div className="px-3 sm:px-6 py-4 sm:py-5 space-y-4 max-h-[calc(100vh-160px)] overflow-y-auto">
            <div className="apple-card">
              <div className="grid grid-cols-2 sm:grid-cols-4">
                <Field l="Referência" v={row.ref} />
                <Field l="Descrição" v={row.desc} />
                <Field l="Grade" v={row.grade} />
                <Field l="Tabela de medidas" v={row.tab_medidas} />
                <Field l="Fornecedor" v={row.fornecedor} />
                <Field l="Tamanho base" v={gradBase} />
                <EditableField l="Número do pedido">
                  <input type="text" defaultValue={numeroPedido} placeholder="—" className="apple-input text-[12px] py-1 flex-1 min-w-0" onBlur={e => handleNumeroPedidoChange(e.target.value.trim())} />
                </EditableField>
                <EditableField l="Data receb. da pré">
                  <input type="date" value={fmtDateInput(fluxo?.data_entrega_pre_producao)} onChange={e => handleFluxoDateChange("data_entrega_pre_producao", e.target.value)} className="apple-input text-[12px] py-1" />
                </EditableField>
                <EditableField l="Data de liberação">
                  <input type="date" value={fmtDateInput(fluxo?.data_retorno_pre_producao)} onChange={e => handleFluxoDateChange("data_retorno_pre_producao", e.target.value)} className="apple-input text-[12px] py-1" />
                </EditableField>
              </div>
            </div>

            {row.tab_medidas && (
              <div className="apple-card p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--label-secondary)] mb-1.5">
                  Modo de medir<span className="ml-1.5 font-normal normal-case text-[var(--label-tertiary)]">— {row.tab_medidas}</span>
                </div>
                <div className="bg-[var(--bg-secondary)] rounded-xl flex items-center justify-center overflow-hidden min-h-[100px] max-h-[280px]">
                  {imgModoMedir
                    ? <img src={imgModoMedir} alt="Modo de medir" className="max-h-[280px] object-contain p-2" />
                    : <p className="text-[12px] text-[var(--label-tertiary)] py-6">Sem imagem cadastrada — adicione na aba Tab. medidas.</p>}
                </div>
              </div>
            )}

            {!numeroPedido.trim() && pts.length > 0 && (
              <p className="text-[11px] text-[var(--system-blue)] bg-blue-50 rounded-lg px-3 py-2">Preencha o número do pedido acima pra poder escolher a cor medida em cada tamanho.</p>
            )}

            {!row.tab_medidas || pts.length === 0 ? (
              <div className="apple-card p-16 text-center"><p className="text-[15px] font-medium text-[var(--label-secondary)]">Esta referência não tem tabela de medidas com pontos cadastrados.</p></div>
            ) : (
              <div className="apple-card overflow-x-auto">
                <table className="plm-table">
                  <thead>
                    <tr>
                      <th rowSpan={2} className="text-left min-w-[180px]">Ponto</th>
                      {gradTamanhos.map(t => (
                        <th key={t} colSpan={2} className={`text-center ${t === gradBase ? "bg-[rgba(255,204,0,0.14)] text-[#856500] font-bold" : "bg-[rgba(0,122,255,0.04)]"}`}>
                          <div>{t}{t === gradBase ? " (base)" : ""}</div>
                          {numeroPedido.trim() && (
                            <select
                              value={coresTamanho[t] || ""} onChange={e => setCorTamanho(t, e.target.value)}
                              className="apple-select mt-1 text-[10px] font-normal py-0.5 px-1 w-full"
                              title={`Cor medida no tamanho ${t}`}
                            >
                              <option value="">cor...</option>
                              {coresDisponiveis.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          )}
                        </th>
                      ))}
                      <th rowSpan={2} className="text-center w-24">Tolerância</th>
                    </tr>
                    <tr>
                      {gradTamanhos.map(t => (
                        <Fragment key={t}>
                          <th className="text-center w-20 text-[10px] font-normal text-[var(--label-tertiary)]">Aprovado</th>
                          <th className="text-center w-24 text-[10px] font-normal text-[var(--label-tertiary)]">Medido</th>
                        </Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pts.map((pt, i) => (
                      <tr key={pt.cod}>
                        <td className="px-3">
                          <div className="font-medium text-[13px]">{pt.cod}</div>
                          <div className="text-[11px] text-[var(--label-tertiary)]">{pt.desc}</div>
                        </td>
                        {gradTamanhos.map((t, colIdx) => {
                          const esperado = esperados[i]?.[t] || "";
                          const medido = medidas[pt.cod]?.[t] || "";
                          const st = cellStatus(esperado, medido, pt.tol);
                          return (
                            <Fragment key={t}>
                              <td className="text-center tabnum text-[12px] px-1 text-[var(--label-secondary)]">{esperado || "—"}</td>
                              <td className="px-1 py-1" style={CELL_STYLE[st]}>
                                <input
                                  id={`laudo-medida-${colIdx}-${i}`}
                                  key={`${pt.cod}-${t}-${medido}`}
                                  type="text" inputMode="decimal" title={st === "acima" ? "Acima da tolerância" : st === "abaixo" ? "Abaixo da tolerância" : undefined}
                                  defaultValue={medido} placeholder="—"
                                  className="w-full text-[12px] text-center tabnum border border-transparent rounded-lg px-1 py-1 outline-none bg-transparent hover:border-[var(--separator-opaque)] focus:border-[var(--system-blue)] focus:bg-[var(--bg-primary)] transition-all"
                                  style={{ color: "inherit", fontWeight: "inherit" }}
                                  onBlur={e => setMedido(pt.cod, t, e.target.value.trim())}
                                  onKeyDown={e => {
                                    if (e.key !== "Enter" && e.key !== "Tab") return;
                                    const next = document.getElementById(`laudo-medida-${colIdx}-${i + 1}`) as HTMLInputElement | null;
                                    if (!next) return;
                                    e.preventDefault();
                                    (e.target as HTMLInputElement).blur();
                                    next.focus();
                                    next.select();
                                  }}
                                />
                              </td>
                            </Fragment>
                          );
                        })}
                        <td className="text-center text-[12px] text-[var(--label-secondary)] px-2">{pt.tol || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Comentários em tópicos */}
              <div className="apple-card p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--label-secondary)] mb-2">Comentários</div>
                <div className="space-y-1.5">
                  {bullets.map((line, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-[var(--label-tertiary)] text-[13px] select-none shrink-0">•</span>
                      <input type="text" value={line} onChange={e => setBullet(i, e.target.value)} placeholder="Comentário..." className="apple-input flex-1 text-[12px]" />
                      {bullets.length > 1 && (
                        <button onClick={() => removeBullet(i)} className="text-[var(--label-tertiary)] hover:text-[var(--system-red)] text-[16px] leading-none shrink-0">×</button>
                      )}
                    </div>
                  ))}
                  <button onClick={addBullet} className="text-[11px] text-[var(--system-blue)] font-medium ml-5 mt-0.5">+ Adicionar tópico</button>
                </div>
              </div>

              {/* Fotos */}
              <div className="apple-card p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--label-secondary)] mb-2">Fotos</div>
                <div
                  className={`flex flex-wrap gap-2 rounded-xl transition-colors ${fotoDragOver ? "bg-[rgba(0,122,255,0.06)] outline-dashed outline-2 outline-[var(--system-blue)]" : ""}`}
                  style={{ padding: fotoDragOver ? 6 : 0, margin: fotoDragOver ? -6 : 0 }}
                  onDragOver={e => { e.preventDefault(); setFotoDragOver(true); }}
                  onDragLeave={() => setFotoDragOver(false)}
                  onDrop={handleDropFotos}
                >
                  {fotos.map(url => (
                    <div key={url} className="relative w-[72px] h-[72px] group">
                      <img src={url} alt="Foto do laudo" className="w-full h-full object-cover rounded-lg border border-[var(--separator)]" />
                      <button onClick={() => handleRemoveFoto(url)} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-black/60 hover:bg-red-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" title="Remover foto">
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => fotoInputRef.current?.click()}
                    disabled={fotoUploading}
                    title="Clique ou arraste fotos aqui"
                    className="w-[72px] h-[72px] border-2 border-dashed border-[var(--separator-opaque)] rounded-lg flex flex-col items-center justify-center gap-0.5 text-[var(--label-quaternary)] hover:border-[var(--system-blue)] hover:text-[var(--system-blue)] transition-colors disabled:opacity-50"
                  >
                    {fotoUploading ? <span className="text-[10px]">...</span> : (
                      <>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" /></svg>
                        <span className="text-[9px] font-medium leading-none">foto</span>
                      </>
                    )}
                  </button>
                </div>
                <p className="text-[10px] text-[var(--label-quaternary)] mt-1.5">Clique ou arraste — pode soltar várias fotos de uma vez.</p>
                <input ref={fotoInputRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={e => handleAddFotos(e.target.files)} />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-[11px] text-[var(--label-tertiary)]">
                <span className="inline-flex items-center gap-1 mr-3"><span style={{ width: 10, height: 10, borderRadius: 3, background: "rgba(234,47,70,0.6)", display: "inline-block" }} /> acima da tolerância</span>
                <span className="inline-flex items-center gap-1"><span style={{ width: 10, height: 10, borderRadius: 3, background: "rgba(255,149,0,0.7)", display: "inline-block" }} /> abaixo da tolerância</span>
              </p>
              <button onClick={handleSave} disabled={saving} className="apple-btn-primary text-[13px] px-4 py-2">{saving ? "Salvando..." : "Salvar laudo"}</button>
            </div>
          </div>
        )}
      </div>
      <ToastContainer />
    </div>
    {/* Fora do overlay do laudo: o clique de fechar da ficha não fecha o laudo junto. */}
    {verFicha && <FichaModal row={row} somenteLeitura onClose={() => setVerFicha(false)} onSave={() => {}} />}
    </>
  );
}
