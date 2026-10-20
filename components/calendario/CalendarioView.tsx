"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import type { CalendarioTarefa } from "@/lib/db";
import { lerCalendarioPlanilha, type CalendarioPlanilha, type LinhaPlanilha } from "@/lib/calendario-planilha";
import { salvarCalendarioPlanilha, carregarCalendarioPlanilha } from "@/lib/storage";
import { useAuth } from "@/lib/auth-context";
import { nomeUsuario } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import { getColecaoColor } from "@/lib/collection-colors";
import { parseISO } from "@/lib/calendario-utils";
import CalendarioResumoView from "./CalendarioResumoView";
import CalendarioControleView from "./CalendarioControleView";

// O Calendário é o espelho da planilha "Calendário 2026" do SharePoint
// (Produto › 0 - CALENDÁRIOS › 2026): mesmas linhas, mesmas semanas, mesmos
// textos e cores. Quem edita é a planilha. Filtros, Resumo e Controle
// continuam, calculados a partir das linhas da planilha.
//
// De onde vem a planilha:
//  1. direto do SharePoint (rota /api/calendario), quando o TI liberar o app
//     do Azure — aí cada abertura já traz a versão atual;
//  2. até lá, da última planilha enviada pelo botão "Atualizar com o Excel",
//     guardada no Storage para todo mundo ver a mesma.

const LINK_PLANILHA = "https://australbgb.sharepoint.com/:x:/r/sites/Produto/_layouts/15/Doc.aspx?sourcedoc=%7BFF4AC554-AD0A-4160-8749-11614B21F85F%7D&file=Calend%C3%A1rio%202026.xlsx&action=default&mobileredirect=true&DefaultItemOpen=1";

const corDoStatus = (status: string) => {
  const s = status.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (s.startsWith("CONCLU")) return "bg-[#4caf50] text-white";
  if (s.includes("ANDAMENTO")) return "bg-[#fbc02d] text-[#000]";
  if (s.includes("ATRAS")) return "bg-[#e53935] text-white";
  return "bg-[#9e9e9e] text-white";
};

// Texto legível sobre a cor de fundo da célula.
function textoSobre(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? "#1d1d1f" : "#ffffff";
}

export default function CalendarioView() {
  const [subTab, setSubTab] = useState<"planilha" | "resumo" | "controle">("planilha");
  const [cal, setCal] = useState<CalendarioPlanilha | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterColecao, setFilterColecao] = useState("");
  const [filterResponsavel, setFilterResponsavel] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [busca, setBusca] = useState("");
  const [detalhe, setDetalhe] = useState<LinhaPlanilha | null>(null);
  const todayColRef = useRef<HTMLTableCellElement | null>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const { user } = useAuth();
  const { success, error: showError, Container: ToastContainer } = useToast();
  const scrolledRef = useRef(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/calendario", { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (r.ok) { setCal(j); setErro(null); }
      else {
        // Sem acesso direto ao SharePoint (ou ele falhou): usa a última planilha enviada.
        const salvo = await carregarCalendarioPlanilha<CalendarioPlanilha>();
        if (salvo) { setCal(salvo); setErro(j?.error === "sem-graph" ? null : (j?.error || null)); }
        else setErro(j?.error === "sem-graph" ? "vazio" : (j?.error || "Não foi possível ler a planilha."));
      }
    } catch {
      const salvo = await carregarCalendarioPlanilha<CalendarioPlanilha>();
      if (salvo) setCal(salvo); else setErro("Não foi possível ler a planilha.");
    }
    setLoading(false);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const enviarPlanilha = async (file: File) => {
    setEnviando(true);
    try {
      const lido = lerCalendarioPlanilha(await file.arrayBuffer());
      if (!lido.linhas.length) throw new Error("A planilha não tem tarefas na aba com o cabeçalho “Tarefa”.");
      const dados: CalendarioPlanilha = { ...lido, origem: "upload", enviadoPor: nomeUsuario(user), arquivo: file.name };
      const err = await salvarCalendarioPlanilha(dados);
      if (err) throw new Error(err);
      setCal(dados); setErro(null);
      success(`Calendário atualizado: ${lido.linhas.length} tarefas.`);
    } catch (e: any) {
      showError(e?.message || "Não foi possível ler o arquivo.");
    }
    setEnviando(false);
    if (arquivoRef.current) arquivoRef.current.value = "";
  };

  const linhas = cal?.linhas || [];
  const semanas = cal?.semanas || [];
  const colecoes = useMemo(() => Array.from(new Set(linhas.map(l => l.colecao).filter(Boolean))).sort(), [linhas]);
  const responsaveis = useMemo(() => Array.from(new Set(linhas.map(l => l.responsavel).filter(Boolean))).sort(), [linhas]);
  const statusOpts = useMemo(() => Array.from(new Set(linhas.map(l => l.status).filter(Boolean))).sort(), [linhas]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return linhas.filter(l =>
      (!filterColecao || l.colecao === filterColecao) &&
      (!filterResponsavel || l.responsavel === filterResponsavel) &&
      (!filterStatus || l.status === filterStatus) &&
      (!q || [l.tarefa, l.colecao, l.responsavel, ...l.celulas.map(c => c.texto)].join(" ").toLowerCase().includes(q))
    );
  }, [linhas, filterColecao, filterResponsavel, filterStatus, busca]);

  // Resumo e Controle trabalham com tarefas de início/fim: cada linha da
  // planilha vira uma tarefa da primeira à última semana preenchida.
  const tarefas: CalendarioTarefa[] = useMemo(() => filtradas.flatMap(l => {
    const preenchidas = l.celulas.filter(c => c.texto);
    if (!preenchidas.length || !semanas.length) return [];
    const ini = Math.min(...preenchidas.map(c => c.col));
    const fim = Math.min(semanas.length - 1, Math.max(...preenchidas.map(c => c.col + c.span - 1)));
    return [{
      id: l.id, tarefa: l.tarefa, colecao: l.colecao, responsavel: l.responsavel, status: l.status,
      data_inicio: semanas[ini].ini, data_fim: semanas[fim].fim,
      descricao: preenchidas.map(c => c.texto).join(" · "),
    }];
  }), [filtradas, semanas]);

  const hojeIdx = useMemo(() => {
    const hoje = new Date(); hoje.setHours(12, 0, 0, 0);
    return semanas.findIndex(s => hoje >= parseISO(s.ini) && hoje <= new Date(parseISO(s.fim).getTime() + 86399000));
  }, [semanas]);

  useEffect(() => {
    if (subTab === "planilha" && !scrolledRef.current && todayColRef.current) {
      todayColRef.current.scrollIntoView({ inline: "center", block: "nearest" });
      scrolledRef.current = true;
    }
  }, [semanas, subTab]);

  // Sem nenhuma cor na planilha (ou se a leitura das cores falhar), pinta
  // pelo nome da coleção, como o calendário antigo.
  const temCorNaPlanilha = useMemo(() => linhas.some(l => l.celulas.some(c => c.cor)), [linhas]);

  const abrirDetalheTarefa = (t: CalendarioTarefa) => setDetalhe(linhas.find(l => l.id === t.id) || null);
  const ac = [filterColecao, filterResponsavel, filterStatus, busca].filter(Boolean).length;

  return (
    <div className="flex flex-col gap-5 min-h-screen pb-10">
      <div className="apple-card p-5">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div>
            <h2 className="text-[18px] font-bold tracking-[-0.02em]">Calendário</h2>
            <div className="text-[12px] text-[var(--label-tertiary)] mt-1">
              {cal ? <>
                {linhas.length} tarefa{linhas.length !== 1 ? "s" : ""} da planilha ·{" "}
                {cal.origem === "sharepoint"
                  ? `lida do SharePoint às ${new Date(cal.lidoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
                  : `atualizada em ${new Date(cal.lidoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}${cal.enviadoPor ? ` por ${cal.enviadoPor}` : ""}`}
              </> : "Planilha Calendário 2026 (SharePoint)"}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <a href={LINK_PLANILHA} target="_blank" rel="noopener noreferrer" className="apple-btn-secondary text-[13px]">Editar no SharePoint</a>
            <input ref={arquivoRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) enviarPlanilha(f); }} />
            {cal?.origem === "sharepoint"
              ? <button onClick={carregar} disabled={loading} className="apple-btn-primary text-[13px] disabled:opacity-50">{loading ? "Atualizando…" : "Atualizar"}</button>
              : <button onClick={() => arquivoRef.current?.click()} disabled={enviando} className="apple-btn-primary text-[13px] disabled:opacity-50">{enviando ? "Lendo planilha…" : "Atualizar com o Excel"}</button>}
          </div>
        </div>

        <div className="flex gap-1 mb-5 bg-[var(--surface-1)] rounded-lg p-1 w-fit border border-[var(--separator)]">
          {([["planilha", "Planilha"], ["resumo", "Resumo"], ["controle", "Controle"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setSubTab(k)} className="px-3 py-1.5 rounded-md text-[12px] font-semibold transition-colors"
              style={subTab === k ? { background: "var(--system-blue)", color: "white" } : { color: "var(--label-secondary)" }}>{l}</button>
          ))}
        </div>

        {/* Filtros: valem para as três visões */}
        <div className="flex flex-wrap gap-3 mb-5 items-end">
          <div className="flex flex-col gap-1 min-w-0">
            <label htmlFor="cal-busca" className="text-[12px] font-semibold uppercase text-[var(--label-tertiary)]">Buscar</label>
            <input id="cal-busca" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Tarefa, coleção, texto da semana…" className="apple-input w-64 max-w-full" />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="cal-col" className="text-[12px] font-semibold uppercase text-[var(--label-tertiary)]">Coleção</label>
            <select id="cal-col" value={filterColecao} onChange={e => setFilterColecao(e.target.value)} className="apple-input w-48">
              <option value="">Todas ({colecoes.length})</option>
              {colecoes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="cal-resp" className="text-[12px] font-semibold uppercase text-[var(--label-tertiary)]">Responsável</label>
            <select id="cal-resp" value={filterResponsavel} onChange={e => setFilterResponsavel(e.target.value)} className="apple-input w-48">
              <option value="">Todos ({responsaveis.length})</option>
              {responsaveis.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="cal-st" className="text-[12px] font-semibold uppercase text-[var(--label-tertiary)]">Status</label>
            <select id="cal-st" value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="apple-input w-48">
              <option value="">Todos</option>
              {statusOpts.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {ac > 0 && <button onClick={() => { setFilterColecao(""); setFilterResponsavel(""); setFilterStatus(""); setBusca(""); }} className="text-[12px] text-[var(--system-blue)] font-medium pb-2">Limpar filtros</button>}
        </div>

        {erro && !cal ? (
          <div className="rounded-xl border border-[var(--separator)] p-5 max-w-[620px]">
            {erro === "vazio" ? (<>
              <p className="text-[14px] font-semibold mb-1.5">Envie a planilha do calendário</p>
              <p className="text-[13px] text-[var(--label-secondary)] leading-relaxed">
                Abra a planilha no SharePoint, baixe uma cópia (Arquivo › Criar uma cópia › Baixar uma cópia) e clique em
                <b> Atualizar com o Excel</b> para escolher o arquivo. Todo mundo passa a ver o mesmo calendário.
              </p>
            </>) : (<>
              <p className="text-[14px] font-semibold mb-1.5">Não foi possível ler a planilha</p>
              <p className="text-[13px] text-[var(--label-secondary)]">{erro}</p>
            </>)}
          </div>
        ) : loading && !cal ? (
          <div className="plm-loading" style={{ padding: "48px 0" }}><div className="plm-loading-spinner" /></div>
        ) : subTab === "resumo" ? (
          <CalendarioResumoView tarefas={tarefas} loading={loading} onEditTask={abrirDetalheTarefa} />
        ) : subTab === "controle" ? (
          <CalendarioControleView tarefas={tarefas} loading={loading} onEditTask={abrirDetalheTarefa} />
        ) : (
          <div className="border border-[var(--separator)] rounded-xl overflow-auto" style={{ maxHeight: "calc(100vh - 260px)" }}>
            <table className="border-separate" style={{ borderSpacing: 0 }}>
              <thead>
                <tr>
                  {[["Tarefa", 260, 0], ["Coleção", 130, 260], ["Responsável", 130, 390], ["Status", 112, 520]].map(([h, w, left]) => (
                    <th key={h as string} className="px-3 py-2.5 text-left font-semibold text-[11.5px] bg-[var(--surface-1)] border-b border-r border-[var(--separator)] sticky top-0 z-20"
                      style={{ left: left as number, minWidth: w as number, maxWidth: w as number }}>{h}</th>
                  ))}
                  {semanas.map((s, i) => (
                    <th key={i} ref={i === hojeIdx ? todayColRef : undefined}
                      className={`px-2 py-2.5 text-center font-semibold text-[11px] border-b border-r border-[var(--separator)] whitespace-nowrap sticky top-0 z-10 ${i === hojeIdx ? "bg-[#e6f0ff] text-[var(--system-blue)]" : "bg-[var(--surface-1)]"}`}
                      style={{ minWidth: 150 }}>
                      {s.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtradas.length === 0 ? (
                  <tr><td colSpan={semanas.length + 4} className="px-4 py-8 text-center text-[var(--label-tertiary)] text-[13px]">Nenhuma tarefa encontrada para os filtros selecionados</td></tr>
                ) : filtradas.map(l => {
                  const corCol = getColecaoColor(l.colecao);
                  const porCol = new Map(l.celulas.map(c => [c.col, c]));
                  const tds: React.ReactNode[] = [];
                  for (let i = 0; i < semanas.length; i++) {
                    const c = porCol.get(i);
                    const hoje = i === hojeIdx;
                    if (!c) { tds.push(<td key={i} className={`border-b border-r border-[var(--separator)] ${hoje ? "bg-[rgba(0,122,255,0.04)]" : ""}`} />); continue; }
                    const fundo = c.cor || (!temCorNaPlanilha && c.texto ? corCol.bar : undefined);
                    tds.push(
                      <td key={i} colSpan={c.span} className="border-b border-r border-[var(--separator)] px-2 py-1.5 align-top text-[11.5px] leading-snug"
                        style={{ background: fundo, color: fundo ? textoSobre(fundo.startsWith("#") ? fundo : "#dddddd") : undefined, minWidth: 150 * c.span }}>
                        {c.texto}
                      </td>,
                    );
                    i += c.span - 1;
                  }
                  return (
                    <tr key={l.id} className="hover:brightness-[0.98]">
                      <td className="px-3 py-2 border-b border-r border-[var(--separator)] sticky left-0 z-[5] bg-[var(--bg-primary)] text-[12.5px] font-medium align-top"
                        style={{ minWidth: 260, maxWidth: 260 }}>
                        <button type="button" onClick={() => setDetalhe(l)} className="text-left hover:text-[var(--system-blue)]">{l.tarefa || "—"}</button>
                      </td>
                      <td className="px-3 py-2 border-b border-r border-[var(--separator)] sticky z-[5] bg-[var(--bg-primary)] align-top" style={{ left: 260, minWidth: 130, maxWidth: 130 }}>
                        {l.colecao && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full inline-block" style={{ background: corCol.bg, color: corCol.text }}>{l.colecao}</span>}
                      </td>
                      <td className="px-3 py-2 border-b border-r border-[var(--separator)] sticky z-[5] bg-[var(--bg-primary)] text-[12px] text-[var(--label-secondary)] align-top" style={{ left: 390, minWidth: 130, maxWidth: 130 }}>{l.responsavel}</td>
                      <td className="px-3 py-2 border-b border-r border-[var(--separator)] sticky z-[5] bg-[var(--bg-primary)] align-top" style={{ left: 520, minWidth: 112, maxWidth: 112 }}>
                        {l.status && <span className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-full inline-block ${corDoStatus(l.status)}`}>{l.status}</span>}
                      </td>
                      {tds}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ToastContainer />
      {detalhe && (
        <div className="fixed inset-0 z-[60] bg-black/35 flex items-end sm:items-center justify-center" onClick={() => setDetalhe(null)}>
          <div role="dialog" aria-modal="true" aria-label={detalhe.tarefa} onClick={e => e.stopPropagation()}
            className="bg-[var(--bg-primary)] w-full sm:max-w-[520px] max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-5 flex flex-col gap-3">
            <div>
              <h3 className="text-[16px] font-semibold">{detalhe.tarefa || "Tarefa"}</h3>
              <p className="text-[12.5px] text-[var(--label-secondary)] mt-0.5">{[detalhe.colecao, detalhe.responsavel, detalhe.status].filter(Boolean).join(" · ")}</p>
            </div>
            <ol className="flex flex-col">
              {detalhe.celulas.filter(c => c.texto).map(c => {
                const ini = semanas[c.col], fim = semanas[Math.min(semanas.length - 1, c.col + c.span - 1)];
                return (
                  <li key={c.col} className="grid gap-3 py-2 border-b border-[var(--separator)] last:border-0 text-[13px]" style={{ gridTemplateColumns: "118px 1fr" }}>
                    <span className="text-[11.5px] text-[var(--label-secondary)] tabnum">{ini?.ini.split("-").reverse().join("/")} – {fim?.fim.split("-").reverse().join("/")}</span>
                    <span>{c.texto}</span>
                  </li>
                );
              })}
            </ol>
            <p className="text-[12px] text-[var(--label-tertiary)]">Para mudar, edite a planilha no SharePoint e atualize o calendário.</p>
            <div className="flex justify-end gap-2">
              <a href={LINK_PLANILHA} target="_blank" rel="noopener noreferrer" className="apple-btn-secondary text-[13px]">Editar no SharePoint</a>
              <button onClick={() => setDetalhe(null)} className="apple-btn-primary text-[13px]">Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
