"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import COLUMNS from "@/lib/columns";
import { fetchFluxoKanban, fetchMapaColecao, moverFluxo, salvarFluxoMeta, atualizarPrevisaoFluxo } from "@/lib/db";
import {
  ETAPAS, TOTAL_ETAPAS, etapaInfo, AREA_NOME, podeMoverPara, hojeISO, addDias, diasEntre, fmtBR,
  prazoPreProducao, provasDaFicha, encadearAutomaticos, metaAoEntrar,
  type FluxoEstado, type FluxoEvento, type FluxoMeta, type LinxFluxo, type Movimento, type PermFluxo,
} from "@/lib/fluxo";
import { naColecao, colecoesComTemporadas, type TemporadasPorRef } from "@/lib/colecao";
import { subscribeRealtime } from "@/lib/realtime";
import TecidoSwatch from "@/components/ui/TecidoSwatch";
import { useToast } from "@/components/ui/Toast";

// Mesmos filtros do Desenvolvimento (selects de cadastro, menos coleção — que
// vira o seletor de pílulas — e forn. tecido).
const FC = COLUMNS.filter(c => (c.type === "select" && c.cad && c.key !== "colecao") || c.key === "forn_tecido");
const FILTERS_KEY = "plm_filters_kanban";

// Fases do fluxo, com as cores que a tabela do Controle de Fluxo usava —
// o resumo e as colunas do quadro falam a mesma cor.
const FASES = [
  { nome: "Pilotagem",    de: 1,  ate: 6,  cor: "#1d4ed8" },
  { nome: "Mostruário",   de: 7,  ate: 9,  cor: "#b45309" },
  { nome: "Produção",     de: 10, ate: 17, cor: "#15803d" },
  { nome: "Pré-produção", de: 18, ate: 19, cor: "#7e22ce" },
];
const faseDe = (n: number) => FASES.find(f => n >= f.de && n <= f.ate) || FASES[0];

// Datas que podem ser informadas ou corrigidas com o card parado na etapa.
const CAMPO_PREVISAO: Record<number, { meta: "prevPiloto" | "prevMost" | "preEntrega"; coluna: string; rotulo: string }> = {
  2:  { meta: "prevPiloto", coluna: "prev_entrega_piloto",       rotulo: "Previsão do piloto" },
  8:  { meta: "prevMost",   coluna: "prev_entrega_mostruario",   rotulo: "Previsão do mostruário" },
  18: { meta: "preEntrega", coluna: "data_entrega_pre_producao", rotulo: "Entrega da pré-produção" },
};

interface Props {
  rows: any[];
  temporadasPorRef?: TemporadasPorRef;
  perm: PermFluxo;
  userNome: string;
  onOpenFicha?: (row: any) => void;
}

type Dialogo = { ref: string; alvo: number } | null;

export default function FluxoKanbanView({ rows, temporadasPorRef = {}, perm, userNome, onOpenFicha }: Props) {
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [estados, setEstados] = useState<Record<string, FluxoEstado>>({});
  const [eventos, setEventos] = useState<FluxoEvento[]>([]);
  const [provaInfos, setProvaInfos] = useState<Record<string, any[]>>({});
  const [mapa, setMapa] = useState<Record<string, any>>({});
  const [linx, setLinx] = useState<LinxFluxo | null>(null);
  const [linxPronto, setLinxPronto] = useState(false);
  const [dlg, setDlg] = useState<Dialogo>(null);
  const [detalhe, setDetalhe] = useState<string | null>(null);
  // Seleção em lote: marcar vários cards (ou todos os filtrados) e mover de uma vez.
  const [selecionando, setSelecionando] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [dlgLote, setDlgLote] = useState<number | null>(null);
  const [dlgPrev, setDlgPrev] = useState<string | null>(null);
  const alternar = (ref: string) => setSel(prev => { const n = new Set(prev); if (n.has(ref)) n.delete(ref); else n.add(ref); return n; });
  const sairDaSelecao = () => { setSelecionando(false); setSel(new Set()); setDlgLote(null); };
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<number | null>(null);
  const { success, error: showError, Container: ToastContainer } = useToast();
  const hoje = hojeISO();

  const carregar = useCallback(async () => {
    const r = await fetchFluxoKanban();
    setErro(r.erro); setEstados(r.estados); setEventos(r.eventos); setProvaInfos(r.provaInfos);
    return r;
  }, []);

  useEffect(() => {
    Promise.all([carregar(), fetchMapaColecao()]).then(([, m]) => {
      const mm: Record<string, any> = {};
      m.forEach((i: any) => { mm[String(i.ref).trim()] = i; });
      setMapa(mm);
      setLoading(false);
    });
    fetch("/api/linx/fluxo").then(r => r.ok ? r.json() : null).then(j => setLinx(j?.cadastrados ? j : null)).catch(() => setLinx(null)).finally(() => setLinxPronto(true));
  }, [carregar]);

  // Outro usuário moveu um card: recarrega o quadro (com folga, porque um
  // movimento grava controle_fluxo e fluxo_eventos em sequência).
  const recarregaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const agenda = () => { if (recarregaTimer.current) clearTimeout(recarregaTimer.current); recarregaTimer.current = setTimeout(() => { carregar(); }, 800); };
    return subscribeRealtime("fluxo-kanban", [
      { table: "fluxo_eventos", onInsert: agenda },
      { table: "controle_fluxo", onUpdate: agenda },
    ]);
  }, [carregar]);

  /* ── filtros (os mesmos do Desenvolvimento) ── */
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
    try { const v = JSON.parse(localStorage.getItem(FILTERS_KEY) || "{}"); localStorage.setItem(FILTERS_KEY, JSON.stringify({ ...v, q: search, fl, colecaoAtiva })); } catch {}
  }, [search, fl, colecaoAtiva]);

  const ativos = useMemo(() => rows.filter((r: any) => String(r.status || "").toUpperCase() !== "CANCELADO"), [rows]);
  const colecoes = useMemo(() => colecoesComTemporadas(ativos, temporadasPorRef), [ativos, temporadasPorRef]);
  const uv = (k: string): string[] => Array.from(new Set(ativos.map((r: any) => r[k]).filter(Boolean))).sort() as string[];
  const sf2 = (k: string, v: string) => setFl(p => { const n = { ...p }; if (v) n[k] = v; else delete n[k]; return n; });

  const filtrados = useMemo(() => {
    let f = ativos;
    if (colecaoAtiva) f = f.filter((x: any) => naColecao(x, colecaoAtiva, temporadasPorRef));
    Object.entries(fl).forEach(([k, v]) => { if (v) f = f.filter((x: any) => x[k] === v); });
    if (search) {
      const q = search.toLowerCase();
      f = f.filter((x: any) => [x.ref, x.desc, x.descricao, x.tecido, x.composicao, x.fornecedor, x.forn_tecido, x.estilista, x.tab_medidas].map(v => v || "").join(" ").toLowerCase().includes(q));
    }
    return [...f].sort((a: any, b: any) => String(a.ref).localeCompare(String(b.ref)));
  }, [ativos, colecaoAtiva, fl, search, temporadasPorRef]);

  const estadoDe = useCallback((ref: string): FluxoEstado => estados[ref] || { ref, etapa: 1, ciclo: 1, desde: null, meta: {} }, [estados]);
  const coresDe = (ref: string): string[] => {
    const m = mapa[ref]; if (!m) return [];
    if (colecaoAtiva && m.fichas_por_colecao?.[colecaoAtiva]?.length) return m.fichas_por_colecao[colecaoAtiva];
    return m.cores || [];
  };

  /* ── mini dashboard do fluxo ──
     Conta sobre o recorte dos filtros; clicar num item restringe o quadro
     àquelas refs (e clicar de novo solta). */
  const [resumoAtivo, setResumoAtivo] = useState<string | null>(null);
  const [mostrarResumo, setMostrarResumo] = useState<boolean>(saved.resumo !== false);
  useEffect(() => {
    try { const v = JSON.parse(localStorage.getItem(FILTERS_KEY) || "{}"); localStorage.setItem(FILTERS_KEY, JSON.stringify({ ...v, resumo: mostrarResumo })); } catch {}
  }, [mostrarResumo]);
  type Teste = (e: FluxoEstado, ref: string) => boolean;
  const entre = (a: number, b: number): Teste => e => e.etapa >= a && e.etapa <= b;
  const parado = (e: FluxoEstado) => e.etapa < TOTAL_ETAPAS && !!e.desde && diasEntre(e.desde, hoje) > 14;
  const atrasado = (e: FluxoEstado) => (e.etapa === 2 && !!e.meta.prevPiloto && e.meta.prevPiloto < hoje) || (e.etapa === 8 && !!e.meta.prevMost && e.meta.prevMost < hoje);
  const preVencida = (e: FluxoEstado) => e.etapa === 18 && !!e.meta.preEntrega && prazoPreProducao(e.meta.preEntrega, hoje).situacao === "vencido";
  const RESUMO: { grupo: string; cor: string; itens: { key: string; label: string; test: Teste }[] }[] = [
    { grupo: "Pilotagem", cor: FASES[0].cor, itens: [
      { key: "dev",       label: "Em desenvolvimento",               test: entre(1, 1) },
      { key: "ag_piloto", label: "Aguardando piloto",                test: entre(2, 2) },
      { key: "em_prova",  label: "Piloto recebido / em prova",       test: entre(3, 4) },
      { key: "laudo",     label: "Laudo enviado / ficha p/ compras", test: entre(5, 6) },
    ]},
    { grupo: "Mostruário", cor: FASES[1].cor, itens: [
      { key: "linx",       label: "Cadastro no Linx OK",             test: entre(7, 7) },
      { key: "ag_most",    label: "Aguardando mostruário",           test: entre(8, 8) },
      { key: "most_ent",   label: "Mostruário entregue",             test: entre(9, 9) },
      { key: "cores_pend", label: "Com cores ainda não entregues",   test: (e, ref) => e.etapa >= 9 && !!e.meta.coresEntregues && e.meta.coresEntregues.length < coresDe(ref).length },
    ]},
    { grupo: "Produção", cor: FASES[2].cor, itens: [
      { key: "prova_prod", label: "Prova de produção",               test: entre(10, 10) },
      { key: "aprovada",   label: "Aprovada / laudo / ficha p/ compras", test: entre(11, 13) },
      { key: "repil",      label: "Repilotando",                     test: e => e.ciclo > 1 && e.etapa <= 10 },
      { key: "compras",    label: "Em compras (Linx, pedido, explosão)", test: entre(14, 17) },
    ]},
    { grupo: "Pré-produção", cor: FASES[3].cor, itens: [
      { key: "pre",      label: "Em pré-produção",                   test: entre(18, 18) },
      { key: "liberada", label: "Produção liberada",                 test: entre(19, 19) },
    ]},
    { grupo: "Atenção", cor: "#d70015", itens: [
      { key: "atrasado", label: "Previsão de piloto ou mostruário vencida", test: e => atrasado(e) },
      { key: "parado",   label: "Parados há mais de 14 dias",        test: e => parado(e) },
      { key: "pre_venc", label: "Pré-produção com prazo vencido",    test: e => preVencida(e) },
    ]},
  ];
  const itemAtivo = RESUMO.flatMap(g => g.itens).find(i => i.key === resumoAtivo);
  // Mudou o recorte: a seleção recomeça, para não mover cards que saíram da tela.
  useEffect(() => { setSel(new Set()); }, [search, fl, colecaoAtiva, resumoAtivo]);

  /* ── regras automáticas ao abrir (ficha e Linx) ── */
  const autoFeito = useRef(false);
  useEffect(() => {
    if (loading || erro || !linxPronto || autoFeito.current) return;
    autoFeito.current = true;
    const cadastrados = new Set(linx?.cadastrados || []);
    (async () => {
      let n = 0;
      const novosEstados: Record<string, FluxoEstado> = {};
      const novosEventos: FluxoEvento[] = [];
      for (const r of ativos) {
        const ref = String(r.ref).trim();
        const e = estados[ref];
        if (!e || ![3, 6, 9, 10, 15].includes(e.etapa)) continue;
        const { estado, movimentos, fotoPedidos } = encadearAutomaticos(e, provasDaFicha(provaInfos[ref] || []), linx, cadastrados, hoje);
        if (fotoPedidos) { await salvarFluxoMeta(ref, 15, estado.meta); novosEstados[ref] = estado; }
        let ok = true;
        for (const m of movimentos) {
          const err = await moverFluxo(ref, m);
          if (err) { ok = false; break; }
          n++;
          novosEventos.push({ produto_ref: ref, etapa: m.para, ciclo: m.ciclo, data: m.data, por: m.por, auto: true, obs: m.obs || "" });
        }
        if (ok && movimentos.length) novosEstados[ref] = estado;
      }
      if (Object.keys(novosEstados).length) setEstados(prev => ({ ...prev, ...novosEstados }));
      if (novosEventos.length) setEventos(prev => [...prev, ...novosEventos]);
      if (n) success(`${n} ${n === 1 ? "card avançou" : "cards avançaram"} sozinho${n === 1 ? "" : "s"} pela ficha ou pelo Linx.`);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, erro, linxPronto]);

  /* ── mover ── */
  const abrirMover = (ref: string, alvo: number) => {
    if (alvo < 1 || alvo > TOTAL_ETAPAS) return;
    if (!podeMoverPara(alvo, perm)) { showError(`Só ${AREA_NOME[etapaInfo(alvo).a]} move para “${etapaInfo(alvo).t}”.`); return; }
    setDetalhe(null);
    setDlg({ ref, alvo });
  };

  type DadosMover = { data: string; meta: Partial<FluxoMeta>; repilotar?: boolean; todasCores?: boolean };
  const moverUm = async (ref: string, alvo: number, dados: DadosMover): Promise<string | null> => {
    const e = estadoDe(ref);
    let para = alvo, ciclo = e.ciclo, obs = "";
    let meta: FluxoMeta = { ...e.meta, ...dados.meta };
    if (dados.repilotar) { para = 3; ciclo = e.ciclo + 1; obs = `Repilotando — ciclo ${ciclo}`; }
    if (alvo === 9) obs = `Cores entregues: ${(meta.coresEntregues || []).join(", ") || "nenhuma"}`;
    if (alvo === 2 && meta.prevPiloto) obs = `Previsão do piloto ${fmtBR(meta.prevPiloto)}`;
    if (alvo === 8 && meta.prevMost) obs = `Previsão do mostruário ${fmtBR(meta.prevMost)}`;
    if (alvo === 18 && meta.preEntrega) obs = `Entrega da pré-produção ${fmtBR(meta.preEntrega)}`;
    meta = metaAoEntrar(para, meta, ref, linx);
    const m: Movimento = { de: e.etapa, para, ciclo, data: dados.data, por: userNome, auto: false, obs, meta };
    const err = await moverFluxo(ref, m);
    if (err) return err;
    setEstados(prev => ({ ...prev, [ref]: { ref, etapa: para, ciclo, desde: dados.data, meta } }));
    setEventos(prev => [...prev, { produto_ref: ref, etapa: para, ciclo, data: dados.data, por: userNome, auto: false, obs }]);
    return null;
  };

  const confirmarMover = async (ref: string, alvo: number, dados: DadosMover) => {
    const err = await moverUm(ref, alvo, dados);
    if (err) { showError(`Não foi possível mover: ${err}`); return; }
    setDlg(null);
    success(`${ref} → ${etapaInfo(dados.repilotar ? 3 : alvo).t}`);
  };

  // Previsão informada depois de o card já estar na etapa (o fornecedor
  // costuma passar a data mais tarde). Vale para 2 (piloto), 8 (mostruário)
  // e 18 (entrega da pré-produção, que move o prazo de 3 a 5 dias úteis).
  const salvarPrevisao = async (ref: string, valor: string) => {
    const e = estadoDe(ref);
    const campo = CAMPO_PREVISAO[e.etapa];
    if (!campo) return;
    const meta: FluxoMeta = { ...e.meta, [campo.meta]: valor || undefined };
    const obs = valor ? `${campo.rotulo}: ${fmtBR(valor)}` : `${campo.rotulo} apagada`;
    const err = await atualizarPrevisaoFluxo(ref, e.etapa, e.ciclo, meta, { [campo.coluna]: valor || null }, obs, userNome);
    if (err) { showError(`Não foi possível salvar: ${err}`); return; }
    setEstados(prev => ({ ...prev, [ref]: { ...e, meta } }));
    setEventos(prev => [...prev, { produto_ref: ref, etapa: e.etapa, ciclo: e.ciclo, data: hoje, por: userNome, auto: false, obs }]);
    setDlgPrev(null);
    success(`${ref} · ${obs}`);
  };

  // Lote: mesma data e mesmas respostas para todos. No mostruário, "todas as
  // cores chegaram" marca as cores da ficha de cada ref; desmarcado, ficam
  // pendentes para conferir card a card.
  const confirmarLote = async (alvo: number, dados: DadosMover) => {
    const refs = Array.from(sel).filter(r => estadoDe(r).etapa !== alvo);
    let ok = 0; const falhas: string[] = [];
    for (const ref of refs) {
      const meta = alvo === 9 ? { ...dados.meta, coresEntregues: dados.todasCores ? coresDe(ref) : [] } : dados.meta;
      const err = await moverUm(ref, alvo, { ...dados, meta });
      if (err) falhas.push(ref); else ok++;
    }
    sairDaSelecao();
    if (ok) success(`${ok} ${ok === 1 ? "ref movida" : "refs movidas"} para “${etapaInfo(dados.repilotar ? 3 : alvo).t}”.`);
    if (falhas.length) showError(`Não foi possível mover: ${falhas.join(", ")}`);
  };

  if (loading) return <div className="plm-loading"><div className="plm-loading-spinner" /><span>Carregando...</span></div>;

  if (erro) return (
    <div className="apple-card p-6 max-w-[560px]">
      <h2 className="text-[15px] font-semibold mb-2">O Kanban de Fluxo precisa de uma atualização no banco</h2>
      <p className="text-[13px] text-[var(--label-secondary)] leading-relaxed">
        Rode o arquivo <b>supabase/037_fluxo_kanban.sql</b> no SQL Editor do Supabase e recarregue a página.
      </p>
      <p className="text-[11px] text-[var(--label-tertiary)] mt-3">Detalhe: {erro}</p>
    </div>
  );

  const noQuadro = itemAtivo ? filtrados.filter((r: any) => { const ref = String(r.ref).trim(); return itemAtivo.test(estadoDe(ref), ref); }) : filtrados;
  const porEtapa: Record<number, any[]> = {};
  noQuadro.forEach((r: any) => { const n = estadoDe(String(r.ref).trim()).etapa; (porEtapa[n] ||= []).push(r); });
  const ponteiroFino = typeof window !== "undefined" && window.matchMedia?.("(pointer: fine)").matches;

  return (
    <div className="flex flex-col">
      {colecoes.length > 0 && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--label-tertiary)] mr-1">Coleção</span>
          <button onClick={() => setColecaoAtiva(null)}
            className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-all border ${colecaoAtiva === null ? "bg-[var(--label-primary)] text-[var(--bg-primary)] border-[var(--label-primary)]" : "bg-transparent text-[var(--label-secondary)] border-[var(--separator-opaque)] hover:border-[var(--label-tertiary)]"}`}>
            Todas
          </button>
          {colecoes.map(col => (
            <button key={col} onClick={() => setColecaoAtiva(col === colecaoAtiva ? null : col)}
              className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-all border ${colecaoAtiva === col ? "bg-[var(--system-blue)] text-white border-[var(--system-blue)]" : "bg-transparent text-[var(--label-secondary)] border-[var(--separator-opaque)] hover:border-[var(--label-tertiary)]"}`}>
              {col}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2 mb-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-0 sm:min-w-[240px]">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--label-tertiary)] pointer-events-none" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input type="text" placeholder="Buscar referência, descrição, tecido, fornecedor..." value={search} onChange={e => setSearch(e.target.value)} className="apple-input w-full !pl-10 pr-3" />
        </div>
        <button onClick={() => setSf(!sf)} className={`apple-input flex items-center gap-2 cursor-pointer transition-all ${sf || ac > 0 ? "!border-[var(--system-blue)] !bg-blue-50 text-[var(--system-blue)] font-semibold" : ""}`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/></svg>
          Filtros{ac > 0 && <span className="bg-[var(--system-blue)] text-white text-[10px] font-bold w-[18px] h-[18px] rounded-full flex items-center justify-center">{ac}</span>}
        </button>
        <button type="button" onClick={() => selecionando ? sairDaSelecao() : setSelecionando(true)}
          className={`apple-input flex items-center gap-2 cursor-pointer transition-all ${selecionando ? "!border-[var(--system-blue)] !bg-blue-50 text-[var(--system-blue)] font-semibold" : ""}`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 12l3 3 5-6"/></svg>
          {selecionando ? "Cancelar seleção" : "Selecionar"}
        </button>
        <span className="text-[12px] text-[var(--label-secondary)] font-medium">
          {filtrados.length} ref(s){(ac > 0 || search || colecaoAtiva) ? ` de ${ativos.length}` : ""}
          {linxPronto && !linx && <span className="text-[var(--system-orange)]"> · Linx fora do ar: cadastro e pedido não avançam sozinhos agora</span>}
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
                <button onClick={() => sf2(k, "")} className="ml-0.5 text-blue-300 hover:text-[var(--system-blue)]" aria-label={`Remover filtro ${c?.label}`}>×</button>
              </span>
            );
          })}
        </div>
      )}

      {/* Mini dashboard do fluxo */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--label-tertiary)]">Resumo do fluxo</span>
        <button type="button" onClick={() => setMostrarResumo(v => !v)} className="text-[12px] text-[var(--system-blue)] font-medium">{mostrarResumo ? "Ocultar resumo" : "Mostrar resumo"}</button>
      </div>
      {mostrarResumo && (
        <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          {RESUMO.map(g => (
            <div key={g.grupo} className="apple-card p-3" style={{ borderTop: `3px solid ${g.cor}` }}>
              <div className="text-[11px] font-bold uppercase tracking-[0.06em] mb-2" style={{ color: g.cor }}>{g.grupo}</div>
              <div className="flex flex-col gap-1">
                {g.itens.map(it => {
                  const n = filtrados.filter((x: any) => { const ref = String(x.ref).trim(); return it.test(estadoDe(ref), ref); }).length;
                  const pct = filtrados.length ? Math.round((n / filtrados.length) * 100) : 0;
                  const ativo = resumoAtivo === it.key;
                  return (
                    <button key={it.key} type="button" onClick={() => setResumoAtivo(ativo ? null : it.key)}
                      title={ativo ? "Mostrar todos" : "Mostrar só estas refs no quadro"}
                      className="text-left rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--bg-secondary)]"
                      style={ativo ? { background: g.cor + "18", boxShadow: `inset 0 0 0 1.5px ${g.cor}` } : undefined}>
                      <div className="flex items-baseline gap-2">
                        <span className="text-[20px] font-bold tabnum tracking-[-0.02em]" style={{ color: n ? g.cor : "var(--label-quaternary)", minWidth: 34 }}>{n}</span>
                        <span className="text-[12px] text-[var(--label-primary)] font-medium flex-1">{it.label}</span>
                        <span className="text-[11px] text-[var(--label-tertiary)] tabnum">{pct}%</span>
                      </div>
                      <div className="h-[4px] rounded-full bg-[var(--bg-secondary)] overflow-hidden mt-1">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: g.cor }} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      {itemAtivo && (
        <div className="flex items-center gap-2 mb-3 text-[12px]">
          <span className="inline-flex items-center gap-1 bg-blue-50 text-[var(--system-blue)] rounded-lg px-2.5 py-1 font-medium">
            <span className="text-blue-300">Resumo:</span>{itemAtivo.label}
            <button onClick={() => setResumoAtivo(null)} className="ml-0.5 text-blue-300 hover:text-[var(--system-blue)]" aria-label="Remover filtro do resumo">×</button>
          </span>
          <span className="text-[var(--label-tertiary)]">{noQuadro.length} de {filtrados.length}</span>
        </div>
      )}

      {selecionando && (
        <div className="sticky z-20 mb-3 apple-card px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 border border-[var(--system-blue)]" style={{ top: 8 }}>
          <span className="text-[13px] font-semibold tabnum">{sel.size} {sel.size === 1 ? "selecionada" : "selecionadas"}</span>
          <button type="button" onClick={() => setSel(new Set(noQuadro.map((r: any) => String(r.ref).trim())))} className="text-[12px] font-medium text-[var(--system-blue)]">
            Selecionar todas as {noQuadro.length} visíveis
          </button>
          {sel.size > 0 && <button type="button" onClick={() => setSel(new Set())} className="text-[12px] font-medium text-[var(--label-secondary)]">Limpar</button>}
          <div className="flex-1" />
          <label htmlFor="fx-lote" className="text-[12px] text-[var(--label-secondary)]">Mover para</label>
          <select id="fx-lote" className="apple-select text-[12px] py-1.5 max-w-full" value="" disabled={!sel.size}
            onChange={e => { const v = Number(e.target.value); if (v) setDlgLote(v); }}>
            <option value="">{sel.size ? "Escolha a etapa…" : "Marque os cards primeiro"}</option>
            {ETAPAS.map(s => (
              <option key={s.n} value={s.n} disabled={!podeMoverPara(s.n, perm)}>{s.n}. {s.t}{podeMoverPara(s.n, perm) ? "" : ` · ${AREA_NOME[s.a]}`}</option>
            ))}
          </select>
        </div>
      )}

      {/* Quadro: rolagem lateral própria; no celular cada coluna quase ocupa a tela e encaixa. */}
      <div className="overflow-x-auto overflow-y-hidden pb-2" style={{ height: "max(520px, calc(100vh - 140px))", scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch" }}>
        <div className="flex gap-2.5 h-full" style={{ width: "max-content" }}>
          {ETAPAS.map(et => {
            const cards = porEtapa[et.n] || [];
            const areas = et.a === "EC" ? ["E", "C"] : [et.a];
            const fase = faseDe(et.n);
            return (
              <section key={et.n} aria-label={et.t}
                onDragOver={e => { if (arrastando) { e.preventDefault(); setSobre(et.n); } }}
                onDragLeave={() => setSobre(s => s === et.n ? null : s)}
                onDrop={e => { e.preventDefault(); const ref = arrastando; setArrastando(null); setSobre(null); if (ref && estadoDe(ref).etapa !== et.n) abrirMover(ref, et.n); }}
                className="flex flex-col rounded-[14px] overflow-hidden w-[calc(100vw-56px)] sm:w-[272px]"
                style={{ scrollSnapAlign: "start", maxHeight: "100%", background: `${fase.cor}0f`, borderTop: `3px solid ${fase.cor}`, outline: sobre === et.n ? `2px dashed ${fase.cor}` : undefined, outlineOffset: -2 }}>
                <div className="px-3 pt-2 pb-2" style={{ background: `${fase.cor}14` }}>
                  <div className="text-[10px] font-bold uppercase tracking-[0.06em] mb-1 ml-6" style={{ color: fase.cor }}>{fase.nome}</div>
                  <div className="flex items-start gap-2">
                    <span className="text-[11px] font-bold tabnum pt-[2px]" style={{ color: fase.cor }}>{String(et.n).padStart(2, "0")}</span>
                    <span className="flex-1 text-[13px] font-semibold leading-tight">{et.t}</span>
                    <span className="text-[12px] text-[var(--label-secondary)] tabnum bg-[var(--bg-primary)] rounded-full px-2">{cards.length}</span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1.5 ml-6">
                    {areas.map(a => <span key={a} className="text-[10px] font-semibold px-2 py-[1px] rounded-full bg-[var(--bg-primary)] text-[var(--label-secondary)] border border-[var(--separator)]">{AREA_NOME[a as "E" | "C"]}</span>)}
                    {et.auto && et.n !== 1 && <span title={et.auto} className="text-[10px] font-semibold px-2 py-[1px] rounded-full bg-[rgba(0,122,255,0.10)] text-[var(--system-blue)]">automático</span>}
                  </div>
                  {selecionando && cards.length > 0 && (() => {
                    const refsCol = cards.map((r: any) => String(r.ref).trim());
                    const todas = refsCol.every((r: string) => sel.has(r));
                    return (
                      <button type="button" className="text-[11.5px] font-semibold mt-1.5 ml-6" style={{ color: fase.cor }}
                        onClick={() => setSel(prev => { const n = new Set(prev); refsCol.forEach((r: string) => todas ? n.delete(r) : n.add(r)); return n; })}>
                        {todas ? "Desmarcar coluna" : `Selecionar coluna (${cards.length})`}
                      </button>
                    );
                  })()}
                </div>
                <div className="flex-1 overflow-y-auto px-2 pb-2.5 flex flex-col gap-2 min-h-[40px]">
                  {cards.length === 0 && <div className="text-[12px] text-[var(--label-tertiary)] text-center py-4">Nenhuma ref nesta etapa</div>}
                  {cards.map((r: any) => (
                    <Cartao key={r.ref} row={r} mapa={mapa[String(r.ref).trim()]} cores={coresDe(String(r.ref).trim())}
                      estado={estadoDe(String(r.ref).trim())} hoje={hoje} perm={perm} arrastavel={!!ponteiroFino}
                      onDragStart={() => setArrastando(String(r.ref).trim())} onDragEnd={() => { setArrastando(null); setSobre(null); }}
                      onAvancar={(alvo) => abrirMover(String(r.ref).trim(), alvo)} onDetalhe={() => setDetalhe(String(r.ref).trim())}
                      selecionando={selecionando} marcado={sel.has(String(r.ref).trim())} onAlternar={() => alternar(String(r.ref).trim())}
                      onPrevisao={() => setDlgPrev(String(r.ref).trim())} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {dlg && (
        <DialogoMover ref_={dlg.ref} alvo={dlg.alvo} row={ativos.find((r: any) => String(r.ref).trim() === dlg.ref)} estado={estadoDe(dlg.ref)}
          cores={coresDe(dlg.ref)} hoje={hoje} onCancel={() => setDlg(null)} onConfirm={dados => confirmarMover(dlg.ref, dlg.alvo, dados)} />
      )}
      {dlgLote && (
        <DialogoMover ref_="" lote={Array.from(sel).filter(r => estadoDe(r).etapa !== dlgLote).length} alvo={dlgLote} row={null} estado={{ ref: "", etapa: 0, ciclo: 1, desde: null, meta: {} }}
          cores={[]} hoje={hoje} onCancel={() => setDlgLote(null)} onConfirm={dados => confirmarLote(dlgLote, dados)} />
      )}
      {dlgPrev && CAMPO_PREVISAO[estadoDe(dlgPrev).etapa] && (
        <DialogoPrevisao ref_={dlgPrev} row={ativos.find((r: any) => String(r.ref).trim() === dlgPrev)} estado={estadoDe(dlgPrev)} hoje={hoje}
          onCancel={() => setDlgPrev(null)} onSalvar={v => salvarPrevisao(dlgPrev, v)} />
      )}
      {detalhe && (
        <Detalhe ref_={detalhe} row={ativos.find((r: any) => String(r.ref).trim() === detalhe)} mapa={mapa[detalhe]} cores={coresDe(detalhe)}
          estado={estadoDe(detalhe)} eventos={eventos.filter(e => String(e.produto_ref).trim() === detalhe)} perm={perm}
          onClose={() => setDetalhe(null)} onMover={alvo => abrirMover(detalhe, alvo)}
          onPrevisao={() => { setDlgPrev(detalhe); setDetalhe(null); }}
          onOpenFicha={onOpenFicha ? (row) => { setDetalhe(null); onOpenFicha(row); } : undefined} />
      )}
      <ToastContainer />
    </div>
  );
}

/* ── card (mesmas informações do Mapa de Coleção) ── */
function Cartao({ row, mapa, cores, estado, hoje, perm, arrastavel, onDragStart, onDragEnd, onAvancar, onDetalhe, selecionando, marcado, onAlternar, onPrevisao }: {
  row: any; mapa: any; cores: string[]; estado: FluxoEstado; hoje: string; perm: PermFluxo; arrastavel: boolean;
  onDragStart: () => void; onDragEnd: () => void; onAvancar: (alvo: number) => void; onDetalhe: () => void;
  selecionando: boolean; marcado: boolean; onAlternar: () => void; onPrevisao: () => void;
}) {
  const img = mapa?.imagem_url || mapa?.imagem_frente || mapa?.imagem_modelo || "";
  const tecido = row.tecido || mapa?.tecido || "";
  const comp = row.composicao || mapa?.composicao || "";
  const fornTec = row.forn_tecido || mapa?.forn_tecido || "";
  const dias = estado.desde ? diasEntre(estado.desde, hoje) : null;
  const prox = estado.etapa < TOTAL_ETAPAS ? estado.etapa + 1 : null;
  const pode = prox ? podeMoverPara(prox, perm) : false;
  const tags: { t: string; tom?: "ok" | "warn" | "bad" }[] = [];
  if (dias !== null) tags.push({ t: `${dias} ${dias === 1 ? "dia" : "dias"} aqui`, tom: dias > 14 ? "bad" : dias > 7 ? "warn" : undefined });
  if (estado.ciclo > 1) tags.push({ t: `Repilotagem ${estado.ciclo}`, tom: "warn" });
  if (estado.etapa >= 9 && estado.meta.coresEntregues && cores.length) {
    const n = estado.meta.coresEntregues.length;
    tags.push({ t: `${n} de ${cores.length} ${cores.length === 1 ? "cor entregue" : "cores entregues"}`, tom: n < cores.length ? "warn" : "ok" });
  }
  if (estado.etapa === 18 && estado.meta.preEntrega) {
    const p = prazoPreProducao(estado.meta.preEntrega, hoje);
    tags.push({ t: `Prazo ${fmtBR(p.de).slice(0, 5)}–${fmtBR(p.ate).slice(0, 5)}${p.situacao === "vencido" ? " · vencido" : ""}`, tom: p.situacao === "vencido" ? "bad" : p.situacao === "atencao" ? "warn" : "ok" });
  }
  const TOM: Record<string, string> = { ok: "bg-[rgba(52,199,89,0.14)] text-[#248a3d]", warn: "bg-[rgba(255,159,10,0.16)] text-[#b26a00]", bad: "bg-[rgba(255,59,48,0.12)] text-[#d70015]" };

  return (
    <article draggable={arrastavel && !selecionando} onDragStart={e => { e.dataTransfer.effectAllowed = "move"; onDragStart(); }} onDragEnd={onDragEnd}
      onClickCapture={selecionando ? (e => { e.preventDefault(); e.stopPropagation(); onAlternar(); }) : undefined}
      aria-selected={selecionando ? marcado : undefined}
      className="relative bg-[var(--bg-primary)] rounded-[11px] border overflow-hidden shrink-0"
      style={{ boxShadow: marcado ? "0 0 0 2px var(--system-blue)" : "0 1px 3px rgba(0,0,0,0.06)", borderColor: marcado ? "var(--system-blue)" : "var(--separator)", cursor: selecionando ? "pointer" : arrastavel ? "grab" : undefined }}>
      {selecionando && (
        <span aria-hidden className="absolute top-2 right-2 z-[3] w-[22px] h-[22px] rounded-full flex items-center justify-center border-2"
          style={{ background: marcado ? "var(--system-blue)" : "rgba(255,255,255,0.9)", borderColor: marcado ? "var(--system-blue)" : "#c7c7cc" }}>
          {marcado && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10"/></svg>}
        </span>
      )}
      <button type="button" onClick={onDetalhe} aria-label={`Detalhes da ${row.ref}`}
        className="relative w-full flex items-center justify-center bg-white border-b border-[var(--separator)]" style={{ aspectRatio: "4 / 3", cursor: "zoom-in" }}>
        <TecidoSwatch url={mapa?.tecido_imagem} nome={tecido} size={36} />
        {img
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={img} alt={row.ref} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "contain", padding: 4 }} />
          : <span className="text-[11px] text-[#aeaeb2]">Sem imagem</span>}
      </button>
      <div className="px-2.5 pt-2 pb-2.5 flex flex-col gap-1">
        {/* Referência, nome e fornecedor sempre visíveis, mesmo sem cadastro completo */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] font-bold tabnum">{row.ref}</span>
          <button type="button" onClick={onDetalhe} className="text-[11px] font-semibold text-[var(--system-blue)]">Detalhes</button>
        </div>
        <div className="text-[12px] leading-snug text-[var(--label-primary)]" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {row.desc || row.descricao || <span className="text-[var(--label-tertiary)]">Sem descrição</span>}
        </div>
        <div className={`text-[11px] font-semibold ${row.fornecedor ? "text-[var(--system-blue)]" : "text-[var(--label-tertiary)]"}`}>{row.fornecedor || "Sem fornecedor"}</div>
        {(tecido || comp) && <div className="text-[10.5px] text-[var(--label-secondary)] leading-snug">{[tecido, comp].filter(Boolean).join(" · ")}</div>}
        {fornTec && <div className="text-[10.5px] text-[var(--label-tertiary)]">{fornTec}</div>}
        {cores.length > 0 && (
          <div className="flex flex-wrap gap-[3px] mt-0.5">
            {cores.map(c => <span key={c} className="text-[9.5px] font-semibold px-1.5 py-[1px] rounded border border-[var(--separator)] bg-[var(--bg-secondary)] text-[var(--label-secondary)] whitespace-nowrap">{c}</span>)}
          </div>
        )}
        {CAMPO_PREVISAO[estado.etapa] && estado.etapa !== 18 && (() => {
          const c = CAMPO_PREVISAO[estado.etapa];
          const v = estado.meta[c.meta] as string | undefined;
          const atr = !!v && v < hoje;
          const podeEditar = podeMoverPara(estado.etapa, perm);
          return (
            <button type="button" disabled={!podeEditar} onClick={onPrevisao}
              title={podeEditar ? "Informar ou alterar a previsão" : `Só ${AREA_NOME[etapaInfo(estado.etapa).a]} altera`}
              className={`self-start mt-1 text-[10.5px] font-semibold px-1.5 py-[2px] rounded-md tabnum inline-flex items-center gap-1 disabled:cursor-default ${atr ? TOM.bad : v ? "bg-[var(--bg-secondary)] text-[var(--label-secondary)]" : "border border-dashed border-[var(--separator-opaque)] text-[var(--system-blue)]"}`}>
              {v ? `${estado.etapa === 2 ? "Piloto" : "Mostr."} prev. ${fmtBR(v)}${atr ? " · atrasado" : ""}` : "+ Informar previsão"}
              {v && podeEditar && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg>}
            </button>
          );
        })()}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {tags.map(t => <span key={t.t} className={`text-[10.5px] font-semibold px-1.5 py-[2px] rounded-md tabnum ${t.tom ? TOM[t.tom] : "bg-[var(--bg-secondary)] text-[var(--label-secondary)]"}`}>{t.t}</span>)}
          </div>
        )}
        {selecionando ? null : prox ? (
          <div className="flex items-center gap-2 mt-1.5">
            <button type="button" disabled={!pode} onClick={() => onAvancar(prox)}
              className="apple-btn-primary text-[12px] py-1 px-2.5 disabled:opacity-40 disabled:cursor-not-allowed">
              {prox === 11 ? "Resultado da prova ▸" : "Avançar ▸"}
            </button>
            {!pode
              ? <span className="text-[10.5px] text-[var(--label-tertiary)] leading-tight">{AREA_NOME[etapaInfo(prox).a]} move para “{etapaInfo(prox).t}”</span>
              : etapaInfo(prox).auto && <span className="text-[10.5px] text-[var(--label-tertiary)] leading-tight">Também avança sozinho</span>}
          </div>
        ) : <span className="text-[10.5px] font-semibold px-1.5 py-[2px] rounded-md self-start bg-[rgba(52,199,89,0.14)] text-[#248a3d] mt-1">Concluído</span>}
      </div>
    </article>
  );
}

/* ── diálogo de mudança de etapa ── */
function Folha({ titulo, sub, children, onClose }: { titulo: string; sub?: string; children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[60] bg-black/35 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={titulo} onClick={e => e.stopPropagation()}
        className="bg-[var(--bg-primary)] w-full sm:max-w-[460px] max-h-[88vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-5 flex flex-col gap-4"
        style={{ paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))" }}>
        <div>
          <h2 className="text-[16px] font-semibold leading-snug">{titulo}</h2>
          {sub && <p className="text-[12.5px] text-[var(--label-secondary)] mt-0.5">{sub}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}

const Rotulo = ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) =>
  <label htmlFor={htmlFor} className="text-[11px] uppercase tracking-[0.05em] text-[var(--label-secondary)] font-semibold">{children}</label>;

function DialogoMover({ ref_, alvo, row, estado, cores, hoje, onCancel, onConfirm, lote }: {
  ref_: string; alvo: number; row: any; estado: FluxoEstado; cores: string[]; hoje: string; lote?: number;
  onCancel: () => void; onConfirm: (d: { data: string; meta: Partial<FluxoMeta>; repilotar?: boolean; todasCores?: boolean }) => Promise<void>;
}) {
  const [todasCores, setTodasCores] = useState(true);
  const et = etapaInfo(alvo);
  const [data, setData] = useState(hoje);
  const [prev, setPrev] = useState("");
  const [marcadas, setMarcadas] = useState<string[]>(estado.meta.coresEntregues?.length ? estado.meta.coresEntregues : cores);
  const [preEntrega, setPreEntrega] = useState(hoje);
  const [resultado, setResultado] = useState<"ok" | "repil" | null>(null);
  const [salvando, setSalvando] = useState(false);
  const prazo = preEntrega ? prazoPreProducao(preEntrega, hoje) : null;
  const bloqueado = salvando || !data || (et.ask === "aprovacao" && !resultado) || lote === 0;

  const confirmar = async () => {
    setSalvando(true);
    const meta: Partial<FluxoMeta> = {};
    if (et.ask === "prevPiloto") meta.prevPiloto = prev || undefined;
    if (et.ask === "prevMost") meta.prevMost = prev || undefined;
    if (et.ask === "cores") meta.coresEntregues = marcadas;
    if (et.ask === "preprod") meta.preEntrega = preEntrega;
    await onConfirm({ data, meta, repilotar: et.ask === "aprovacao" && resultado === "repil", todasCores });
    setSalvando(false);
  };

  return (
    <Folha titulo={`${String(alvo).padStart(2, "0")} · ${et.t}`} onClose={onCancel}
      sub={lote !== undefined
        ? (lote ? `${lote} ${lote === 1 ? "ref selecionada" : "refs selecionadas"} · mesma data e mesmas respostas para todas` : "As refs selecionadas já estão nesta etapa.")
        : `${ref_} · ${row?.desc || row?.descricao || ""}`}>
      <div className="flex flex-col gap-1.5">
        <Rotulo htmlFor="fx-data">Data da mudança</Rotulo>
        <input id="fx-data" type="date" value={data} max={hoje} onChange={e => setData(e.target.value)} className="apple-input" />
        <p className="text-[12px] text-[var(--label-secondary)]">Vem com a data de hoje. Corrija se aconteceu antes.</p>
      </div>
      {(et.ask === "prevPiloto" || et.ask === "prevMost") && (
        <div className="flex flex-col gap-1.5">
          <Rotulo htmlFor="fx-prev">{et.ask === "prevPiloto" ? "Previsão de entrega do piloto" : "Previsão de entrega do mostruário"}</Rotulo>
          <input id="fx-prev" type="date" value={prev} onChange={e => setPrev(e.target.value)} className="apple-input" />
          <p className="text-[12px] text-[var(--label-secondary)]">Opcional. Se ainda não tiver, deixe em branco e informe depois pelo card.</p>
        </div>
      )}
      {et.ask === "cores" && lote !== undefined && (
        <label className="flex items-center gap-2 text-[13px] px-3 py-2 rounded-lg bg-[var(--bg-secondary)]">
          <input type="checkbox" checked={todasCores} onChange={e => setTodasCores(e.target.checked)} />
          Todas as cores da ficha chegaram
        </label>
      )}
      {et.ask === "cores" && lote === undefined && (
        <div className="flex flex-col gap-1.5">
          <Rotulo>Quais cores chegaram?</Rotulo>
          {cores.length ? (
            <div className="flex flex-col gap-1.5">
              {cores.map(c => (
                <label key={c} className="flex items-center gap-2 text-[13px] px-3 py-2 rounded-lg bg-[var(--bg-secondary)]">
                  <input type="checkbox" checked={marcadas.includes(c)} onChange={e => setMarcadas(m => e.target.checked ? [...m, c] : m.filter(x => x !== c))} />
                  {c}
                </label>
              ))}
            </div>
          ) : <p className="text-[12px] text-[var(--label-secondary)]">A ficha ainda não tem cores no 1º tecido.</p>}
          <p className="text-[12px] text-[var(--label-secondary)]">As que não chegaram ficam pendentes no card.</p>
        </div>
      )}
      {et.ask === "preprod" && (
        <div className="flex flex-col gap-1.5">
          <Rotulo htmlFor="fx-pre">Data de entrega da pré-produção</Rotulo>
          <input id="fx-pre" type="date" value={preEntrega} onChange={e => setPreEntrega(e.target.value)} className="apple-input" />
          {prazo && <p className="text-[12px] text-[var(--label-secondary)]">Prazo: de {fmtBR(prazo.de)} a {fmtBR(prazo.ate)} (3 a 5 dias úteis inteiros depois da entrega).</p>}
        </div>
      )}
      {et.ask === "aprovacao" && (
        <div className="flex flex-col gap-1.5">
          <Rotulo>Resultado da prova de produção</Rotulo>
          <div className="grid grid-cols-2 gap-2">
            {([["ok", "Aprovada"], ["repil", "Repilotando"]] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setResultado(k)} aria-pressed={resultado === k}
                className={`py-3 rounded-xl border text-[13px] font-semibold ${resultado === k ? "border-[var(--system-blue)] bg-[rgba(0,122,255,0.08)] text-[var(--system-blue)]" : "border-[var(--separator-opaque)]"}`}>{l}</button>
            ))}
          </div>
          <p className="text-[12px] text-[var(--label-secondary)]">Normalmente vem sozinho do status da prova na ficha. Repilotando volta o card para “Piloto recebido” no ciclo seguinte, sem apagar as datas do anterior.</p>
        </div>
      )}
      {et.auto && et.n !== 1 && <p className="text-[12px] text-[var(--label-secondary)]"><b>Esta etapa também avança sozinha:</b> {et.auto.replace(/^[^:]+: /, "")}.</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="apple-btn-secondary text-[13px]">Cancelar</button>
        <button type="button" onClick={confirmar} disabled={bloqueado} className="apple-btn-primary text-[13px] disabled:opacity-40">{salvando ? "Movendo…" : lote ? `Mover ${lote}` : "Mover"}</button>
      </div>
    </Folha>
  );
}

function DialogoPrevisao({ ref_, row, estado, hoje, onCancel, onSalvar }: {
  ref_: string; row: any; estado: FluxoEstado; hoje: string; onCancel: () => void; onSalvar: (v: string) => Promise<void>;
}) {
  const campo = CAMPO_PREVISAO[estado.etapa];
  const atual = (estado.meta[campo.meta] as string | undefined) || "";
  const [v, setV] = useState(atual);
  const [salvando, setSalvando] = useState(false);
  const prazo = estado.etapa === 18 && v ? prazoPreProducao(v, hoje) : null;
  return (
    <Folha titulo={campo.rotulo} sub={`${ref_} · ${row?.desc || row?.descricao || ""}`} onClose={onCancel}>
      <div className="flex flex-col gap-1.5">
        <Rotulo htmlFor="fx-prev-ed">{atual ? `Atual: ${fmtBR(atual)}` : "Ainda não informada"}</Rotulo>
        <input id="fx-prev-ed" type="date" value={v} onChange={e => setV(e.target.value)} className="apple-input" />
        {prazo && <p className="text-[12px] text-[var(--label-secondary)]">Prazo: de {fmtBR(prazo.de)} a {fmtBR(prazo.ate)}.</p>}
        <p className="text-[12px] text-[var(--label-secondary)]">A mudança fica registrada no histórico do card.</p>
      </div>
      <div className="flex justify-end gap-2">
        {atual && <button type="button" disabled={salvando} onClick={async () => { setSalvando(true); await onSalvar(""); setSalvando(false); }} className="apple-btn-secondary text-[13px] mr-auto">Apagar</button>}
        <button type="button" onClick={onCancel} className="apple-btn-secondary text-[13px]">Cancelar</button>
        <button type="button" disabled={salvando || !v || v === atual} onClick={async () => { setSalvando(true); await onSalvar(v); setSalvando(false); }} className="apple-btn-primary text-[13px] disabled:opacity-40">{salvando ? "Salvando…" : "Salvar"}</button>
      </div>
    </Folha>
  );
}

function Detalhe({ ref_, row, mapa, cores, estado, eventos, perm, onClose, onMover, onOpenFicha, onPrevisao }: {
  ref_: string; row: any; mapa: any; cores: string[]; estado: FluxoEstado; eventos: FluxoEvento[]; perm: PermFluxo;
  onClose: () => void; onMover: (alvo: number) => void; onOpenFicha?: (row: any) => void; onPrevisao: () => void;
}) {
  const campoPrev = CAMPO_PREVISAO[estado.etapa];
  const valorPrev = campoPrev ? (estado.meta[campoPrev.meta] as string | undefined) : undefined;
  const img = mapa?.imagem_url || mapa?.imagem_frente || mapa?.imagem_modelo || "";
  const hist = [...eventos].reverse();
  return (
    <Folha titulo={`${ref_} · ${row?.desc || row?.descricao || "Sem descrição"}`} sub={`${row?.fornecedor || "Sem fornecedor"} · etapa ${estado.etapa}: ${etapaInfo(estado.etapa).t}`} onClose={onClose}>
      {img && (
        <div className="relative rounded-xl border border-[var(--separator)] bg-white flex items-center justify-center" style={{ aspectRatio: "4 / 3" }}>
          <TecidoSwatch url={mapa?.tecido_imagem} nome={row?.tecido} size={52} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img} alt={ref_} style={{ width: "100%", height: "100%", objectFit: "contain", padding: 6 }} />
        </div>
      )}
      <div className="text-[12.5px] text-[var(--label-secondary)] leading-relaxed">
        {[row?.tecido, row?.composicao, row?.forn_tecido].filter(Boolean).join(" · ")}
        {cores.length > 0 && <div>Cores: {cores.join(", ")}</div>}
        {estado.meta.coresEntregues && <div>Mostruário entregue: {estado.meta.coresEntregues.join(", ") || "nenhuma cor"}</div>}
        {campoPrev && (
          <div className="flex items-center gap-2 mt-1">
            <span>{campoPrev.rotulo}: <b className="text-[var(--label-primary)]">{valorPrev ? fmtBR(valorPrev) : "não informada"}</b></span>
            {podeMoverPara(estado.etapa, perm) && <button type="button" onClick={onPrevisao} className="text-[12px] font-semibold text-[var(--system-blue)]">{valorPrev ? "Alterar" : "Informar"}</button>}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Rotulo>Histórico</Rotulo>
        {hist.length ? (
          <ol className="flex flex-col">
            {hist.map((h, i) => (
              <li key={i} className="grid gap-2.5 py-1.5 border-b border-[var(--separator)] last:border-0 text-[12.5px]" style={{ gridTemplateColumns: "76px 1fr" }}>
                <span className="tabnum text-[var(--label-secondary)] text-[11.5px]">{fmtBR(h.data)}</span>
                <span>{h.etapa}. {etapaInfo(h.etapa).t}{h.ciclo > 1 ? ` (ciclo ${h.ciclo})` : ""}
                  <span className="block text-[11.5px] text-[var(--label-secondary)]">{h.auto ? "Automático" : h.por}{h.obs ? ` · ${h.obs}` : ""}</span>
                </span>
              </li>
            ))}
          </ol>
        ) : <p className="text-[12px] text-[var(--label-secondary)]">Nenhum movimento ainda. A ref está no início do fluxo.</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <Rotulo htmlFor="fx-mv">Mover para outra etapa</Rotulo>
        <select id="fx-mv" className="apple-select" value="" onChange={e => { const v = Number(e.target.value); if (v) onMover(v); }}>
          <option value="">Escolha…</option>
          {ETAPAS.filter(s => s.n !== estado.etapa).map(s => (
            <option key={s.n} value={s.n} disabled={!podeMoverPara(s.n, perm)}>{s.n}. {s.t}{podeMoverPara(s.n, perm) ? "" : ` · ${AREA_NOME[s.a]}`}</option>
          ))}
        </select>
        <p className="text-[12px] text-[var(--label-secondary)]">Para pular ou voltar etapas. As de outra área aparecem bloqueadas.</p>
      </div>
      <div className="flex justify-end gap-2">
        {onOpenFicha && row && <button type="button" onClick={() => onOpenFicha(row)} className="apple-btn-secondary text-[13px]">Abrir ficha</button>}
        <button type="button" onClick={onClose} className="apple-btn-primary text-[13px]">Fechar</button>
      </div>
    </Folha>
  );
}
