"use client";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { uploadImage } from "@/lib/storage";
import {
  fetchTabelasMedidas, fetchTabelaPontos, fetchCadastros, fetchGraduacoes,
  createTabelaMedidas, deleteTabelaMedidas,
  upsertPontos, upsertGraduacoes, saveTabelaImagemModoMedir, saveTabelaAreaMedia,
} from "@/lib/db";
import { subscribeRealtime } from "@/lib/realtime";
import { calcularDaBase, tamanhosDaGrade, GRADES_CALCADO } from "@/lib/tamanhos";
import { normGrade } from "@/lib/etiquetas-tamanho";

type Tabela = { id: number; nome: string; tamanhos?: string[]; tamanho_base?: string; area_media?: number | null };
type Ponto = { cod: string; desc: string; tabela: string; tol: string };
type Grad = { desc: string; valores: Record<string, string>; ampliacoes: Record<string, string>; tol: string };

// Borda mais forte marcando o início de cada grupo de colunas
// (Graduação | Ampliação | Tolerância) na tabela de graduação.
const GRUPO_INICIO = "!border-l-2 !border-l-[var(--separator)]";

type Esquema = { label: string; tamanhos: string[]; base: string };

// Esquemas fixos que já existiam antes de a lista vir do cadastro de grades
// (o 38 a 48 não está cadastrado como grade, mas várias tabelas usam).
const ESQUEMAS_FIXOS: Esquema[] = [
  { label: "38 AO 48", tamanhos: ["38", "40", "42", "44", "46", "48"], base: "42" },
  { label: "PP AO GG", tamanhos: ["PP", "P", "M", "G", "GG"], base: "M" },
];

// Base sugerida: M ou 42 quando a grade tem, senão o tamanho do meio.
function baseSugerida(tamanhos: string[]): string {
  if (tamanhos.includes("M")) return "M";
  if (tamanhos.includes("42")) return "42";
  return tamanhos[Math.floor((tamanhos.length - 1) / 2)] || "";
}

// Todas as grades cadastradas (Cadastros › Grade) viram opção ao criar uma
// tabela. Grade de tamanho único (UNICO, CAIXA) vira uma tabela de um tamanho.
function esquemasDasGrades(grades: string[]): Esquema[] {
  const out = [...ESQUEMAS_FIXOS];
  const vistos = new Set(out.map(e => e.tamanhos.join("|")));
  for (const g of grades) {
    const nome = g.trim().toUpperCase();
    if (!nome) continue;
    const tamanhos = tamanhosDaGrade(nome);
    const lista = tamanhos.length ? tamanhos : [nome];
    const chave = lista.join("|");
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    const baseCalcado = GRADES_CALCADO[normGrade(nome)]?.base;
    out.push({ label: nome, tamanhos: lista, base: baseCalcado || baseSugerida(lista) });
  }
  return out;
}

const mapPontos = (pts: any[]): Ponto[] =>
  pts.map((p: any) => ({ cod: p.cod, desc: p.descricao, tabela: p.valor_base, tol: p.tolerancia }));
const mapGrads = (grd: any[]): Grad[] =>
  grd.map((g: any) => ({ desc: g.descricao, valores: g.valores || {}, ampliacoes: g.ampliacoes || {}, tol: g.tolerancia }));

export default function MedidasView() {
  const [tabelas, setTabelas] = useState<Tabela[]>([]);
  const [sel, setSel] = useState<Tabela | null>(null);
  const [sec, setSec] = useState<"base" | "grad">("base");
  const [pontos, setPontos] = useState<Ponto[]>([]);
  const [grad, setGrad] = useState<Grad[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEsquema, setNewEsquema] = useState(0);
  const [newBase, setNewBase] = useState(ESQUEMAS_FIXOS[0].base);
  const [esquemas, setEsquemas] = useState<Esquema[]>(ESQUEMAS_FIXOS);
  useEffect(() => {
    fetchCadastros().then(c => setEsquemas(esquemasDasGrades(c?.grade || []))).catch(() => {});
  }, []);
  const [im1, setIm1] = useState<string | null>(null);
  const r1 = useRef<HTMLInputElement>(null);
  // Um timer por tipo: editar o valor base salva pontos E graduação (que dele
  // deriva) — com um timer só, o segundo agendamento cancelaria o primeiro.
  const saveTimers = useRef<Record<string, any>>({});
  // Gravação em andamento por tabela+tipo, o dado mais novo esperando a vez e
  // quando a última terminou. O upsert apaga e reinsere tudo: duas gravações
  // ao mesmo tempo se atropelavam, então elas vão uma de cada vez e só a mais
  // nova que chegou durante a anterior é gravada em seguida.
  const gravandoRef = useRef<Record<string, boolean>>({});
  const proximoRef = useRef<Record<string, any[] | null>>({});
  const fimGravacaoRef = useRef<Record<string, number>>({});
  const recargaTimers = useRef<Record<string, any>>({});
  const selIdRef = useRef<number | null>(null);
  selIdRef.current = sel?.id ?? null;

  useEffect(() => { loadTabelas(); }, []);

  // Edição local que o realtime não pode atropelar: save agendado, gravando,
  // ou gravação que acabou há pouco (os eventos dela ainda estão chegando).
  const ocupado = (type: "pontos" | "grad", tabelaId: number) =>
    !!saveTimers.current[type] || !!gravandoRef.current[`${type}:${tabelaId}`] ||
    Date.now() - (fimGravacaoRef.current[`${type}:${tabelaId}`] || 0) < 3000;

  // Recarrega do banco o que outra pessoa alterou. Antes cada evento recarregava
  // na hora — inclusive os do PRÓPRIO save, que apaga e reinsere tudo: a linha
  // recém-adicionada sumia, o que estava sendo digitado se perdia e, lida no
  // meio da regravação, a tabela aparecia vazia. Agora espera a rajada de
  // eventos acabar, ignora a própria gravação e descarta a leitura se houve
  // edição local nesse meio-tempo.
  const recarregar = (type: "pontos" | "grad", tabelaId: number) => {
    if (recargaTimers.current[type]) clearTimeout(recargaTimers.current[type]);
    recargaTimers.current[type] = setTimeout(async () => {
      recargaTimers.current[type] = null;
      if (ocupado(type, tabelaId)) return;
      const linhas = type === "pontos" ? mapPontos(await fetchTabelaPontos(tabelaId)) : mapGrads(await fetchGraduacoes(tabelaId));
      if (ocupado(type, tabelaId) || selIdRef.current !== tabelaId) return;
      if (type === "pontos") setPontos(linhas as Ponto[]); else setGrad(linhas as Grad[]);
    }, 1000);
  };

  /* Realtime: sincroniza tabelas entre usuários */
  useEffect(() => {
    const doSel = (row: any) => sel && (!row?.tabela_id || row.tabela_id === sel.id);
    const unsub = subscribeRealtime("medidas-sync", [
      { table: "tabelas_medidas", onInsert: () => loadTabelas(), onDelete: () => loadTabelas() },
      {
        table: "tabela_medida_pontos",
        onUpdate: (row) => { if (doSel(row)) recarregar("pontos", sel!.id); },
        onInsert: (row) => { if (doSel(row)) recarregar("pontos", sel!.id); },
        onDelete: (row) => { if (doSel(row)) recarregar("pontos", sel!.id); },
      },
      {
        table: "graduacoes",
        onUpdate: (row) => { if (doSel(row)) recarregar("grad", sel!.id); },
        onInsert: (row) => { if (doSel(row)) recarregar("grad", sel!.id); },
        onDelete: (row) => { if (doSel(row)) recarregar("grad", sel!.id); },
      },
    ]);
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel?.id]);

  const loadTabelas = async () => {
    setLoading(true);
    const data = await fetchTabelasMedidas();
    setTabelas(data);
    setLoading(false);
  };

  const selectTable = async (t: Tabela) => {
    descarregar();
    setSel(t);
    setSec("base");
    setIm1((t as any).imagem_modo_medir || null);
    const [pts, grd] = await Promise.all([fetchTabelaPontos(t.id), fetchGraduacoes(t.id)]);
    // Clicou em outra tabela antes desta carregar: não mostra pontos da errada.
    if (selIdRef.current !== t.id) return;
    setPontos(mapPontos(pts));
    setGrad(mapGrads(grd));
  };

  // Tamanhos da tabela selecionada (a base ganha destaque nas colunas)
  const tamanhos = sel?.tamanhos?.length ? sel.tamanhos : [];
  const base = sel?.tamanho_base || "";

  // Área média da modelagem (m² por peça). Atualiza a lista e a seleção para o
  // valor persistir na tela ao trocar de tabela e voltar.
  const salvarArea = async (valor: string) => {
    if (!sel) return;
    const n = parseFloat(valor.replace(",", "."));
    const area = isNaN(n) ? null : n;
    setSel(s => (s ? { ...s, area_media: area } : s));
    setTabelas(p => p.map(t => (t.id === sel.id ? { ...t, area_media: area } : t)));
    await saveTabelaAreaMedia(sel.id, valor);
  };

  const gravar = async (type: "pontos" | "grad", tabelaId: number, data: any[]) => {
    const chave = `${type}:${tabelaId}`;
    proximoRef.current[chave] = data;
    if (gravandoRef.current[chave]) return;
    gravandoRef.current[chave] = true;
    setSaving(true);
    while (proximoRef.current[chave]) {
      const linhas = proximoRef.current[chave]!;
      proximoRef.current[chave] = null;
      if (type === "pontos") await upsertPontos(tabelaId, linhas);
      else await upsertGraduacoes(tabelaId, linhas);
    }
    gravandoRef.current[chave] = false;
    fimGravacaoRef.current[chave] = Date.now();
    if (!Object.values(gravandoRef.current).some(Boolean)) setSaving(false);
  };

  // O que está esperando os 800ms do save, pra poder gravar já ao trocar de
  // tabela ou de aba — antes o timer era cancelado e a última edição se perdia.
  const pendenteRef = useRef<Record<string, { tabelaId: number; data: any[] } | null>>({});
  const descarregar = () => {
    for (const type of ["pontos", "grad"] as const) {
      const p = pendenteRef.current[type];
      if (saveTimers.current[type]) clearTimeout(saveTimers.current[type]);
      saveTimers.current[type] = null;
      pendenteRef.current[type] = null;
      if (p) gravar(type, p.tabelaId, p.data);
    }
  };
  useEffect(() => () => descarregar(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const scheduleSave = useCallback((type: "pontos" | "grad", data: any[]) => {
    if (!sel) return;
    const tabelaId = sel.id;
    if (saveTimers.current[type]) clearTimeout(saveTimers.current[type]);
    pendenteRef.current[type] = { tabelaId, data };
    saveTimers.current[type] = setTimeout(() => {
      saveTimers.current[type] = null;
      pendenteRef.current[type] = null;
      gravar(type, tabelaId, data);
    }, 800);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel]);

  // A graduação é DERIVADA, não digitada: o valor do tamanho base vem da aba
  // "Tabela base" e os demais são calculados acumulando as ampliações a partir
  // dele — a mesma conta das fórmulas do arquivo oficial (vizinho ± |ampliação|).
  // Só ampliação, descrição e tolerância são editáveis.
  const comValoresCalculados = useCallback(
    (linhas: Grad[], pts: Ponto[]): Grad[] =>
      linhas.map((r, i) => ({
        ...r,
        valores: calcularDaBase(r as any, tamanhos, base, pts[i]?.tabela ?? r.valores?.[base] ?? ""),
      })),
    [tamanhos, base],
  );

  // O que a tela mostra (e o que é gravado): sempre os valores calculados.
  const gradCalc = useMemo(() => comValoresCalculados(grad, pontos), [comValoresCalculados, grad, pontos]);

  const addPonto = () => {
    const next = String.fromCharCode(65 + pontos.length);
    const updated = [...pontos, { cod: next, desc: "", tabela: "", tol: "1,0 + OU -" }];
    setPontos(updated);
    scheduleSave("pontos", updated);
  };
  const updatePonto = (i: number, field: string, val: string) => {
    const updated = pontos.map((p, j) => j === i ? { ...p, [field]: val } : p);
    setPontos(updated);
    scheduleSave("pontos", updated);
    // Mudar a medida base recalcula toda a graduação daquela linha.
    if (field === "tabela") scheduleSave("grad", comValoresCalculados(grad, updated));
  };
  const removePonto = (i: number) => {
    const updated = pontos.filter((_, j) => j !== i);
    setPontos(updated);
    scheduleSave("pontos", updated);
  };

  const addGrad = () => {
    const updated = [...grad, { desc: "", valores: {}, ampliacoes: {}, tol: "1,0 + OU -" }];
    setGrad(updated);
    scheduleSave("grad", comValoresCalculados(updated, pontos));
  };
  const updateGrad = (i: number, field: string, val: string) => {
    const updated = grad.map((r, j) => j === i ? { ...r, [field]: val } : r);
    setGrad(updated);
    scheduleSave("grad", comValoresCalculados(updated, pontos));
  };
  // Só a AMPLIAÇÃO é digitada — os valores da graduação saem dela + medida base.
  const updateAmpliacao = (i: number, tamanho: string, val: string) => {
    const updated = grad.map((r, j) => j === i ? { ...r, ampliacoes: { ...r.ampliacoes, [tamanho]: val } } : r);
    setGrad(updated);
    scheduleSave("grad", comValoresCalculados(updated, pontos));
  };
  const removeGrad = (i: number) => {
    const updated = grad.filter((_, j) => j !== i);
    setGrad(updated);
    scheduleSave("grad", comValoresCalculados(updated, pontos));
  };

  const handleCreate = async () => {
    const name = newName.trim().toUpperCase();
    if (!name) return;
    const esq = esquemas[newEsquema] || esquemas[0];
    const base = esq.tamanhos.includes(newBase) ? newBase : esq.base;
    const result = await createTabelaMedidas(name, esq.tamanhos, base);
    if (result) {
      descarregar();
      await loadTabelas();
      setSel({ id: result.id, nome: result.nome, tamanhos: esq.tamanhos, tamanho_base: base });
      setPontos([]);
      setGrad([]);
      setSec("base");
    }
    setNewName("");
    setShowNew(false);
  };

  const handleDelete = async () => {
    if (!sel || !confirm(`Excluir tabela "${sel.nome}"?`)) return;
    await deleteTabelaMedidas(sel.id);
    setSel(null);
    setPontos([]);
    setGrad([]);
    await loadTabelas();
  };

  const hi = async (e: any) => {
    const file = e.target.files?.[0];
    if (!file || !sel) return;
    // Caminho pelo id da tabela: estável (não quebra se a tabela for renomeada)
    // e sem acento/barra, que o Storage recusa.
    const url = await uploadImage(file, `medidas/${sel.id}/modo_de_medir`);
    if (url) {
      setIm1(url);
      await saveTabelaImagemModoMedir(sel.id, url);
    }
  };

  const filteredTabelas = search ? tabelas.filter(t => t.nome.toLowerCase().includes(search.toLowerCase())) : tabelas;
  const ic = "w-full text-[13px] border border-[var(--separator-opaque)] rounded-md px-2 py-1 outline-none focus:border-[var(--system-blue)]";

  return (
    <div className="flex flex-col sm:flex-row gap-5 min-h-[400px]">
      {/* Sidebar com lista de tabelas */}
      <div className="w-full sm:w-[260px] flex-shrink-0">
        <div className="apple-card p-3">
          <div className="flex items-center justify-between px-2 mb-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--label-tertiary)]">Tabelas de medidas</span>
            {saving && <span className="text-[10px] text-[var(--system-blue)] animate-pulse font-medium">Salvando...</span>}
          </div>
          <div className="mb-2.5 px-0.5">
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--label-tertiary)] pointer-events-none" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar tabela..." className="apple-input w-full text-[12px] py-1.5 !pl-8" />
            </div>
          </div>
          <nav className="flex sm:flex-col gap-0.5 sm:max-h-[calc(100vh-340px)] overflow-y-auto overflow-x-auto sm:overflow-x-visible">
            {loading ? <div className="px-3 py-4 text-[13px] text-[var(--label-tertiary)]">Carregando...</div> :
              filteredTabelas.map(t => (
                <button key={t.id} onClick={() => selectTable(t)}
                  className={`text-left px-2.5 py-[7px] rounded-lg text-[13px] transition-all flex justify-between items-center gap-2 whitespace-nowrap sm:whitespace-normal ${sel?.id === t.id ? "font-semibold bg-[var(--system-blue)] text-white" : "text-[var(--label-primary)] hover:bg-[var(--bg-secondary)]"}`}>
                  <span className="truncate">{t.nome}</span>
                </button>
              ))}
          </nav>
          <p className="text-[10px] text-[var(--label-quaternary)] px-2 mt-2 tabnum">{filteredTabelas.length} de {tabelas.length} tabelas</p>

          {!showNew ? (
            <button onClick={() => setShowNew(true)} className="apple-btn-secondary w-full mt-3 text-[12px]">+ Nova tabela</button>
          ) : (
            <div className="mt-3 px-0.5">
              <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleCreate()}
                placeholder="Nome da tabela..." className="apple-input w-full text-[12px] py-1.5 mb-1.5" autoFocus />
              <div className="text-[10px] text-[var(--label-tertiary)] uppercase tracking-wide mb-0.5">Grade</div>
              <select value={newEsquema} onChange={e => { const i = Number(e.target.value); setNewEsquema(i); setNewBase(esquemas[i]?.base || ""); }} className="apple-select w-full text-[12px] py-1.5 mb-1.5">
                {esquemas.map((e, i) => <option key={e.label} value={i}>{e.label} ({e.tamanhos.join(", ")})</option>)}
              </select>
              {(esquemas[newEsquema]?.tamanhos.length || 0) > 1 && (
                <>
                  <div className="text-[10px] text-[var(--label-tertiary)] uppercase tracking-wide mb-0.5">Tamanho base</div>
                  <select value={newBase} onChange={e => setNewBase(e.target.value)} className="apple-select w-full text-[12px] py-1.5 mb-1.5">
                    {esquemas[newEsquema]?.tamanhos.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </>
              )}
              <div className="flex gap-1.5">
                <button onClick={handleCreate} className="apple-btn-primary flex-1 text-[12px] py-1.5">Criar</button>
                <button onClick={() => { setShowNew(false); setNewName(""); }} className="apple-btn-secondary flex-1 text-[12px] py-1.5">Cancelar</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Conteúdo */}
      <div className="flex-1 min-w-0">
        {!sel ? (
          <div className="apple-card flex items-center justify-center h-full min-h-[300px]">
            <div className="text-center">
              <svg className="mx-auto mb-3 text-[var(--label-quaternary)]" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><path d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
              <p className="text-[14px] text-[var(--label-tertiary)]">Selecione ou crie uma tabela</p>
            </div>
          </div>
        ) : (
          <div className="apple-card">
            {/* Header da tabela */}
            <div className="px-5 pt-5 pb-4 border-b border-[var(--separator)]">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div>
                  <h3 className="text-[20px] font-bold tracking-[-0.02em]">{sel.nome}</h3>
                  <p className="text-[13px] text-[var(--label-tertiary)] mt-0.5">{tamanhos.length ? `${tamanhos[0]} a ${tamanhos[tamanhos.length - 1]} · base ${base}` : "Sem tamanhos"} · {pontos.length} pontos{grad.length > 0 ? " · Graduação disponível" : ""}</p>
                </div>
                <div className="flex items-center gap-3">
                  {/* Área média da modelagem — m² de tecido por peça */}
                  <label className="flex items-center gap-1.5" title="Área média de tecido por peça, em m²">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--label-tertiary)] whitespace-nowrap">Área média (m²)</span>
                    {/* text + inputMode decimal: com type="number" o navegador
                        rejeita a vírgula e devolve "", apagando o valor de quem
                        digita "1,2345". A conversão fica no salvamento. */}
                    <input type="text" inputMode="decimal" defaultValue={sel.area_media ?? ""} placeholder="—" key={`area-${sel.id}`}
                      className="w-24 text-[13px] text-center tabnum border border-[var(--separator-opaque)] rounded-lg px-2 py-1 outline-none focus:border-[var(--system-blue)] bg-[var(--bg-primary)]"
                      onBlur={e => { const v = e.target.value.trim(); if (v !== String(sel.area_media ?? "")) salvarArea(v); }} />
                  </label>
                  <button onClick={handleDelete} className="text-[12px] text-[var(--system-red)] hover:bg-red-50 px-2.5 py-1.5 rounded-lg transition-colors font-medium">Excluir tabela</button>
                </div>
              </div>
              <div className="seg-control">
                <button onClick={() => setSec("base")} className={`seg-btn ${sec === "base" ? "active" : ""}`}>Tabela base{base ? ` (${base})` : ""}</button>
                <button onClick={() => setSec("grad")} className={`seg-btn ${sec === "grad" ? "active" : ""}`}>Graduação</button>
              </div>
            </div>

            {/* Conteúdo da tabela */}
            <div className="px-5 py-5">
              {sec === "base" && (<div>
                <div className="mb-5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--label-secondary)] mb-1.5">Modo de medir</div>
                  <div className="border border-dashed border-[var(--separator-opaque)] rounded-xl bg-[var(--bg-secondary)] aspect-[16/9] max-h-[260px] flex items-center justify-center cursor-pointer hover:border-[var(--system-blue)] transition-colors overflow-hidden" onClick={() => r1.current?.click()}>
                    {im1 ? <img src={im1} alt="Modo de medir" className="w-full h-full object-contain p-1" /> :
                      <div className="text-center p-3"><svg className="mx-auto mb-1.5 text-[var(--label-quaternary)]" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg><p className="text-[12px] text-[var(--label-tertiary)]">Modo de medir</p><p className="text-[10px] text-[var(--label-quaternary)] mt-0.5">Clique para enviar</p></div>}
                  </div>
                  <input ref={r1} type="file" accept="image/*" className="hidden" onChange={hi} />
                </div>
                <div className="border border-[var(--separator)] rounded-xl overflow-hidden mb-3">
                  <table className="plm-table"><thead><tr><th className="text-center w-14">Cód</th><th>Descrição</th><th className="text-center w-20">Tabela{base ? ` (${base})` : ""}</th><th className="text-center w-28">Tolerância</th><th className="w-8"></th></tr></thead>
                    <tbody>{pontos.map((p, i) => (<tr key={i}>
                      <td className="px-1 py-1"><input type="text" value={p.cod} onChange={e => updatePonto(i, "cod", e.target.value)} className={`${ic} w-12 text-center font-bold`} /></td>
                      <td className="px-1 py-1"><input type="text" value={p.desc} onChange={e => updatePonto(i, "desc", e.target.value)} className={`${ic} font-medium`} placeholder="Descrição do ponto" /></td>
                      <td className="px-1 py-1"><input type="text" value={p.tabela} onChange={e => updatePonto(i, "tabela", e.target.value)} className={`${ic} w-16 text-center tabnum font-semibold`} placeholder="—" /></td>
                      <td className="px-1 py-1"><input type="text" value={p.tol} onChange={e => updatePonto(i, "tol", e.target.value)} className={`${ic} w-24 text-center text-[12px]`} /></td>
                      <td className="text-center"><button onClick={() => removePonto(i)} className="text-[var(--label-quaternary)] hover:text-[var(--system-red)] transition-colors">×</button></td>
                    </tr>))}
                      {pontos.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-[var(--label-tertiary)]">Nenhum ponto cadastrado</td></tr>}
                    </tbody></table>
                </div>
                <button onClick={addPonto} className="apple-btn-secondary text-[12px]">+ Adicionar ponto</button>
              </div>)}

              {sec === "grad" && (<div>
                {tamanhos.length === 0 ? (
                  <p className="text-[13px] text-[var(--label-tertiary)] py-6 text-center">Esta tabela não tem tamanhos definidos.</p>
                ) : (<>
                <div className="border border-[var(--separator)] rounded-xl overflow-hidden overflow-x-auto mb-3">
                  <table className="plm-table">
                    <thead>
                      <tr>
                        <th rowSpan={2} className="text-center w-12">Cód</th>
                        <th rowSpan={2}>Descrição</th>
                        <th colSpan={tamanhos.length} className={`text-center ${GRUPO_INICIO} bg-[rgba(0,122,255,0.05)] !text-[var(--system-blue)]`}>
                          Graduação <span className="font-normal normal-case tracking-normal text-[10px] opacity-70">(calculada)</span>
                        </th>
                        <th colSpan={tamanhos.length} className={`text-center ${GRUPO_INICIO} bg-[rgba(52,199,89,0.06)] !text-[#1a7a35]`}>
                          Ampliação <span className="font-normal normal-case tracking-normal text-[10px] opacity-70">(editável)</span>
                        </th>
                        <th rowSpan={2} className={`text-center w-24 ${GRUPO_INICIO}`}>Tolerância</th>
                        <th rowSpan={2} className="w-8"></th>
                      </tr>
                      <tr>
                        {tamanhos.map((t, k) => (
                          <th key={`v-${t}`} className={`text-center w-16 ${k === 0 ? GRUPO_INICIO : ""} ${t === base ? "!bg-[rgba(0,122,255,0.12)] !text-[var(--system-blue)]" : "bg-[rgba(0,122,255,0.03)]"}`}>{t}</th>
                        ))}
                        {tamanhos.map((t, k) => (
                          <th key={`a-${t}`} className={`text-center w-14 text-[11px] ${k === 0 ? GRUPO_INICIO : ""} ${t === base ? "!text-[var(--label-quaternary)]" : "!text-[#1a7a35]"} bg-[rgba(52,199,89,0.04)]`}>{t}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>{grad.map((r, i) => (<tr key={i}>
                      <td className="px-1 py-1 text-center text-[12px] font-bold text-[var(--label-secondary)]">{pontos[i]?.cod || "—"}</td>
                      <td className="px-1 py-1"><input type="text" value={r.desc} onChange={e => updateGrad(i, "desc", e.target.value)} className={`${ic} font-medium`} placeholder="Descrição" /></td>
                      {/* Graduação: calculada — o base vem da Tabela base, os outros das ampliações */}
                      {tamanhos.map((t, k) => (
                        <td key={`v-${t}`} className={`px-1 py-1 text-center tabnum text-[13px] ${k === 0 ? GRUPO_INICIO : ""} ${t === base ? "bg-[rgba(0,122,255,0.10)] font-bold text-[var(--system-blue)]" : "bg-[rgba(0,122,255,0.02)] text-[var(--label-primary)]"}`}
                          title={t === base ? `Medida base — editável na aba "Tabela base"` : `Calculado: ${t} = vizinho ± ampliação`}>
                          {gradCalc[i]?.valores?.[t] || "—"}
                        </td>
                      ))}
                      {/* Ampliação: o único campo digitado */}
                      {tamanhos.map((t, k) => (
                        <td key={`a-${t}`} className={`px-1 py-1 ${k === 0 ? GRUPO_INICIO : ""} bg-[rgba(52,199,89,0.03)]`}>
                          {t === base ? (
                            <div className="w-12 mx-auto text-center text-[12px] text-[var(--label-quaternary)]" title="A base é a referência — não tem ampliação">—</div>
                          ) : (
                            <input type="text" value={r.ampliacoes?.[t] ?? ""} onChange={e => updateAmpliacao(i, t, e.target.value)} className={`${ic} w-12 text-center tabnum text-[12px]`} placeholder="—" />
                          )}
                        </td>
                      ))}
                      <td className={`px-1 py-1 ${GRUPO_INICIO}`}><input type="text" value={r.tol} onChange={e => updateGrad(i, "tol", e.target.value)} className={`${ic} w-20 text-center text-[12px]`} /></td>
                      <td className="text-center"><button onClick={() => removeGrad(i)} className="text-[var(--label-quaternary)] hover:text-[var(--system-red)] transition-colors">×</button></td>
                    </tr>))}
                      {grad.length === 0 && <tr><td colSpan={tamanhos.length * 2 + 4} className="py-8 text-center text-[var(--label-tertiary)]">Nenhuma graduação cadastrada</td></tr>}
                    </tbody></table>
                </div>
                <button onClick={addGrad} className="apple-btn-secondary text-[12px]">+ Adicionar linha</button>
                <div className="text-[11px] text-[var(--label-tertiary)] mt-3 leading-relaxed">
                  <p><span className="font-semibold text-[var(--system-blue)]">Graduação</span> é calculada — não se digita. O tamanho base ({base || "—"}) vem da aba <span className="font-semibold">Tabela base</span>; os demais somam a ampliação a partir do vizinho.</p>
                  <p><span className="font-semibold text-[#1a7a35]">Ampliação</span>: diferença de cada tamanho em relação ao vizinho na direção da base. Ex.: base {base || "—"} = 43 e ampliação −2 ⇒ o tamanho anterior fica 41; outra ampliação −2 ⇒ o anterior fica 39.</p>
                </div>
                </>)}
              </div>)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
