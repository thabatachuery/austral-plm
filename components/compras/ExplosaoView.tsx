"use client";
import { useState, useEffect, useMemo } from "react";
import { fetchExplosaoData } from "@/lib/db";
import { exportToExcel } from "@/lib/export-excel";
import { exportExplosaoPDF } from "@/lib/export-pdf-explosao";
import { fmtBRL } from "@/lib/utils";
import ScrollTable from "@/components/ui/ScrollTable";

type Props = { comprasRows: any[]; variantes: Record<string, string[]> };

const QTD_MOST_KEYS = ["qtd_most_var01","qtd_most_var02","qtd_most_var03","qtd_most_var04","qtd_most_var05","qtd_most_var06"] as const;
const VAR_KEYS = ["var01","var02","var03","var04","var05","var06"] as const;

// Etapa da ficha: define quais produtos entram (pelo status) e por quanto a
// quantidade de cada aviamento é multiplicada.
type Modo = "desenvolvimento" | "mostruario" | "producao";
const MODOS: { key: Modo; label: string; regra: string; statusMatch: (s: string) => boolean }[] = [
  { key: "desenvolvimento", label: "Desenvolvimento", regra: "1 peça por variante",
    statusMatch: s => s.includes("DESENVOLVIMENTO") },
  { key: "mostruario",      label: "Mostruário",      regra: "quantidade de mostruário da variante",
    statusMatch: s => s.includes("MOSTRUÁRIO") || s.includes("MOSTRUARIO") },
  { key: "producao",        label: "Produção",        regra: "compra da variante, só pedidos não entregues",
    statusMatch: s => s.includes("PRODUÇÃO") || s.includes("PRODUCAO") },
];

// Data de hoje em ISO local (não UTC — perto da meia-noite o toISOString()
// vira o dia seguinte e faria um pedido de hoje contar como entregue).
function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Pedido ainda não entregue: sem data marcada, ou com entrega de hoje pra frente.
const pedidoPendente = (dataEntrega: string | null | undefined, hoje: string) => !dataEntrega || dataEntrega >= hoje;

// "1089312842 - C11(2584)|C05(17-1012)|C02(19-0303)" + cor "C05 - BEGE" ->
// "17-1012": o código do fornecedor às vezes junta a referência de cada cor
// num texto só, "CÓDIGO(ref)" separado por "|". Sem essa cor no texto (item
// de cor única, sem essa notação), devolve o texto original sem alterar.
function codigoFornecedorPorCor(codigoFornecedor: string, cor: string): string {
  if (!codigoFornecedor || !cor) return codigoFornecedor;
  const codCor = cor.split(" - ")[0]?.trim();
  if (!codCor) return codigoFornecedor;
  const re = new RegExp(`${codCor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\(([^)]+)\\)`);
  const m = codigoFornecedor.match(re);
  return m ? m[1] : codigoFornecedor;
}

export default function ExplosaoView({ comprasRows, variantes }: Props) {
  const [data, setData] = useState<{ fichas: any[]; avFichas: any[]; avLib: any[]; comprasVar: any[]; tecFichas: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [flFornProd, setFlFornProd] = useState("");
  const [flStatus, setFlStatus] = useState("");
  const [flColecao, setFlColecao] = useState("");
  const [flFornAvi, setFlFornAvi] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [modo, setModo] = useState<Modo>("producao");
  const modoInfo = MODOS.find(m => m.key === modo)!;

  useEffect(() => {
    fetchExplosaoData().then(d => { setData(d); setLoading(false); });
  }, []);

  const avLibMap = useMemo(() => {
    if (!data) return {} as Record<string, { nome: string; fornecedor: string; codForn: string; preco: number; imagem: string; imagensCor: Record<string, string> }>;
    const m: Record<string, { nome: string; fornecedor: string; codForn: string; preco: number; imagem: string; imagensCor: Record<string, string> }> = {};
    data.avLib.forEach((a: any) => {
      m[a.codigo] = { nome: a.nome, fornecedor: a.fornecedor || "", codForn: a.codigo_fornecedor || "", preco: Number(a.preco) || 0, imagem: a.imagem || "", imagensCor: a.imagens_cores || {} };
    });
    return m;
  }, [data]);

  // filter produto rows first — o modo já recorta pela etapa (status), os
  // demais filtros continuam valendo por cima disso.
  const filteredProd = useMemo(() => {
    let r = comprasRows.filter((x: any) => modoInfo.statusMatch((x.status || "").toUpperCase()));
    if (search)     { const q = search.toLowerCase(); r = r.filter((x: any) => (`${x.ref} ${x.descricao}`).toLowerCase().includes(q)); }
    if (flFornProd) r = r.filter((x: any) => x.fornecedor === flFornProd);
    if (flStatus)   r = r.filter((x: any) => x.status === flStatus);
    if (flColecao)  r = r.filter((x: any) => x.colecao === flColecao);
    return r;
  }, [comprasRows, search, flFornProd, flStatus, flColecao, modoInfo]);

  const refSet = useMemo(() => new Set(filteredProd.map((r: any) => r.ref as string)), [filteredProd]);

  // map ficha_id → produto_ref for filtered products
  const fichaRefMap = useMemo(() => {
    if (!data) return new Map<number, string>();
    const m = new Map<number, string>();
    data.fichas.forEach((f: any) => { if (refSet.has(f.produto_ref)) m.set(f.id, f.produto_ref); });
    return m;
  }, [data, refSet]);

  // ref → product fornecedor
  const refFornMap = useMemo(() => {
    const m: Record<string, string> = {};
    filteredProd.forEach((p: any) => { m[p.ref] = p.fornecedor || ""; });
    return m;
  }, [filteredProd]);

  const refIdMap = useMemo(() => {
    const m: Record<string, number> = {};
    filteredProd.forEach((p: any) => { m[p.ref] = p.id; });
    return m;
  }, [filteredProd]);

  // ficha_id → qtd_most per var slot
  const fichaQtdMostMap = useMemo(() => {
    if (!data) return {} as Record<number, (number|null)[]>;
    const m: Record<number, (number|null)[]> = {};
    data.fichas.forEach((f: any) => {
      m[f.id] = QTD_MOST_KEYS.map(k => f[k] ?? null);
    });
    return m;
  }, [data]);

  // Compra de uma variante somando os dois pedidos, mas só os que ainda não
  // foram entregues — se o pedido 1 já chegou e o 2 não, conta só o 2.
  const comprasPendentes = (vc: any, hoje: string) =>
    (pedidoPendente(vc.data_entrega1, hoje) ? Number(vc.qtd_compra1) || 0 : 0) +
    (pedidoPendente(vc.data_entrega2, hoje) ? Number(vc.qtd_compra2) || 0 : 0);

  // produto_id → total comprado e pendente (soma de todas as cores) — usado só
  // para aviamentos sem distinção de cor (ex. adesivo, tag), que valem pra peça
  // inteira independente da cor dela.
  const productTotalComprasMap = useMemo(() => {
    if (!data) return {} as Record<number, number>;
    const hoje = hojeISO();
    const m: Record<number, number> = {};
    data.comprasVar.forEach((vc: any) => {
      m[vc.produto_id] = (m[vc.produto_id] || 0) + comprasPendentes(vc, hoje);
    });
    return m;
  }, [data]);

  // produto_id + cor da peça → compra pendente daquela cor especificamente — é
  // o que liga "quantas peças pretas foram compradas" à cor do botão que vai
  // na variante preta (não à compra total do produto, que misturaria cores).
  const comprasPorCorMap = useMemo(() => {
    if (!data) return new Map<string, number>();
    const hoje = hojeISO();
    const m = new Map<string, number>();
    data.comprasVar.forEach((vc: any) => {
      const key = `${vc.produto_id}:${vc.cor}`;
      m.set(key, (m.get(key) || 0) + comprasPendentes(vc, hoje));
    });
    return m;
  }, [data]);

  // ficha_id → cores da peça por variante (do 1º tecido da ficha), na mesma
  // ordem de VAR 01..06 usada em ficha_aviamentos — é o que corresponde a
  // qual variante (cor da peça) usa qual cor de aviamento.
  const fichaCoresMap = useMemo(() => {
    if (!data) return {} as Record<number, string[]>;
    const m: Record<number, string[]> = {};
    data.tecFichas.forEach((t: any) => {
      if (m[t.ficha_id] === undefined) m[t.ficha_id] = t.cores || [];
    });
    return m;
  }, [data]);

  // aggregate: para aviamentos com cor por variante, explode por cor (uma
  // linha por cor de aviamento realmente usada), multiplicando pela compra
  // da variante da peça que usa aquela cor — não a compra total do produto.
  const aggregated = useMemo(() => {
    if (!data) return [];

    type Entry = {
      codigo: string; cor: string; nome: string;
      fornAvi: string; codForn: string; preco: number; imagem: string;
      qtd: number; valorUnit: number;
      refs: Set<string>; fornsProd: Set<string>;
    };
    const byKey: Record<string, Entry> = {};

    const addQty = (av: any, cor: string, ref: string, qty: number) => {
      const key = `${av.codigo}||${cor}`;
      const lib = avLibMap[av.codigo] || { nome: av.codigo, fornecedor: "", codForn: "", preco: 0, imagem: "", imagensCor: {} };
      if (!byKey[key]) {
        byKey[key] = {
          codigo: av.codigo, cor,
          nome: lib.nome, fornAvi: lib.fornecedor,
          // Foto e código do fornecedor específicos da cor, quando existem —
          // sem eles, cai na foto/código genéricos (mesmo comportamento de
          // sempre para itens sem essa distinção por cor).
          codForn: codigoFornecedorPorCor(lib.codForn, cor),
          preco: lib.preco, imagem: lib.imagensCor?.[cor] || lib.imagem,
          qtd: 0, valorUnit: lib.preco || Number(av.valor) || 0,
          refs: new Set(), fornsProd: new Set(),
        };
      }
      byKey[key].qtd += qty;
      byKey[key].refs.add(ref);
      const forn = refFornMap[ref];
      if (forn) byKey[key].fornsProd.add(forn);
    };

    data.avFichas.forEach((av: any) => {
      const ref = fichaRefMap.get(av.ficha_id);
      if (!ref) return;

      const prodId = refIdMap[ref];
      const qtdItem = Number(av.qtd) || 0;
      const qtdMosts = fichaQtdMostMap[av.ficha_id] || [];
      const coresAviamento = VAR_KEYS.map(k => av[k] || "");

      if (!coresAviamento.some(Boolean)) {
        // Sem cor por variante (ex. adesivo, tag genérico): vale pra peça
        // inteira, então soma todas as cores do produto.
        let multiplier = 0;
        if (modo === "producao")        multiplier = productTotalComprasMap[prodId] || 0;
        else if (modo === "mostruario") multiplier = qtdMosts.reduce((s: number, v) => s + (Number(v) || 0), 0);
        else                            multiplier = Math.max(variantes[ref]?.length ?? 0, 1);
        addQty(av, "", ref, qtdItem * multiplier);
        return;
      }

      // Com cor por variante: cada variante (slot) casa a cor do aviamento
      // ali escolhida com a quantidade da cor DA PEÇA nesse mesmo slot — é por
      // isso que precisa das cores do tecido, não só do total.
      const coresProduto = fichaCoresMap[av.ficha_id] || [];
      coresAviamento.forEach((corAv, i) => {
        if (!corAv) return;
        let multiplier = 0;
        if (modo === "producao") {
          const corProd = coresProduto[i] || "";
          multiplier = comprasPorCorMap.get(`${prodId}:${corProd}`) || 0;
        } else if (modo === "mostruario") {
          multiplier = Number(qtdMosts[i]) || 0;
        } else {
          multiplier = 1; // 1 peça-amostra dessa variante, em desenvolvimento
        }
        addQty(av, corAv, ref, qtdItem * multiplier);
      });
    });

    let rows = Object.values(byKey).map(r => {
      const qtdComMargem = Math.ceil(r.qtd * 1.1);
      return {
        ...r,
        qtd: qtdComMargem,
        fornecedor: r.fornAvi,
        fornProd:   Array.from(r.fornsProd).sort().join(", "),
        refs:       Array.from(r.refs).sort().join(", "),
        valorTotal: qtdComMargem * r.valorUnit,
      };
    });

    if (flFornAvi) rows = rows.filter(r => r.fornecedor === flFornAvi);
    return rows;
  }, [data, fichaRefMap, avLibMap, refFornMap, refIdMap, fichaQtdMostMap, fichaCoresMap, comprasPorCorMap, productTotalComprasMap, variantes, flFornAvi, modo]);

  const sorted = useMemo(() => {
    if (!sort) return aggregated;
    return [...aggregated].sort((a, b) => {
      const av = (a as any)[sort.key] ?? "", bv = (b as any)[sort.key] ?? "";
      const cmp = typeof av === "number"
        ? av - bv
        : String(av).localeCompare(String(bv), "pt-BR", { sensitivity: "base" });
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [aggregated, sort]);

  const toggleSort = (k: string) => setSort(prev => {
    if (!prev || prev.key !== k) return { key: k, dir: "asc" };
    if (prev.dir === "asc") return { key: k, dir: "desc" };
    return null;
  });

  // distinct filter options
  const uv = (key: string) => Array.from(new Set(comprasRows.map((r: any) => r[key]).filter(Boolean))).sort() as string[];
  // Status ofertados no filtro: só os que existem dentro da etapa escolhida —
  // senão dá pra escolher um status que a etapa já excluiu e a tabela zera.
  const statusOpts = useMemo(() => Array.from(new Set(
    comprasRows.filter((r: any) => modoInfo.statusMatch((r.status || "").toUpperCase())).map((r: any) => r.status).filter(Boolean)
  )).sort() as string[], [comprasRows, modoInfo]);
  const uvFornAvi = useMemo(() => Array.from(new Set(Object.values(avLibMap).map(a => a.fornecedor).filter(Boolean))).sort(), [avLibMap]);

  const handleExportPdf = async () => {
    setGeneratingPdf(true);
    try {
      const date = new Date().toLocaleDateString("pt-BR").replace(/\//g, "-");
      await exportExplosaoPDF(sorted, { fornProd: flFornProd, status: flStatus, colecao: flColecao, fornAvi: flFornAvi, etapa: modoInfo.label }, `explosao_aviamentos_${modo}_${date}`);
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleExport = () => {
    const headers = ["Código", "Cor", "Nome", "Cód. Forn.", "Forn. Aviamento", "Fornecedor", "Qtd Total", "Vlr. Unit (R$)", "Vlr. Total (R$)", "Referências"];
    const dataRows = sorted.map(r => [r.codigo, r.cor, r.nome, r.codForn, r.fornecedor, r.fornProd, r.qtd, r.valorUnit, r.valorTotal, r.refs]);
    const date = new Date().toLocaleDateString("pt-BR").replace(/\//g, "-");
    exportToExcel(`explosao_aviamentos_${modo}_${date}`, headers, dataRows);
  };

  const COLS = [
    { key: "_img",      label: "",               w: 64  },
    { key: "codigo",    label: "Código",          w: 110 },
    { key: "cor",       label: "Cor",             w: 100 },
    { key: "nome",      label: "Nome",            w: 240 },
    { key: "codForn",   label: "Cód. Forn.",      w: 120 },
    { key: "fornecedor",label: "Forn. Aviamento", w: 160 },
    { key: "fornProd",  label: "Fornecedor",      w: 150 },
    { key: "qtd",       label: "Qtd Total +10%",  w: 120, num: true },
    { key: "valorUnit", label: "Vlr. Unit",       w: 110, num: true, fmt: fmtBRL },
    { key: "valorTotal",label: "Vlr. Total",      w: 120, num: true, fmt: fmtBRL },
    { key: "refs",      label: "Referências",     w: 280 },
  ] as const;

  if (loading) return <div className="plm-loading"><div className="plm-loading-spinner" /><span>Carregando explosão...</span></div>;

  return (
    <div>
      {/* Etapa da ficha — define quais produtos entram e por quanto multiplica */}
      <div className="apple-card p-4 mb-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--label-secondary)]">Etapa</span>
          <div className="flex bg-[var(--bg-secondary)] rounded-lg border border-[var(--separator)] p-0.5 gap-0.5">
            {MODOS.map(m => (
              <button key={m.key} onClick={() => { setModo(m.key); setFlStatus(""); }}
                className={`text-[12px] font-semibold px-3.5 py-1.5 rounded-md transition-all ${modo === m.key ? "bg-[var(--system-blue)] text-white" : "text-[var(--label-secondary)] hover:text-[var(--label-primary)]"}`}>
                {m.label}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-[var(--label-tertiary)]">
            quantidade do aviamento na variante × <span className="font-semibold text-[var(--label-secondary)]">{modoInfo.regra}</span>
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className="apple-card p-4 mb-4 bg-[var(--bg-secondary)]">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--label-secondary)]">Filtrar por</span>
          {(search || flFornProd || flStatus || flColecao || flFornAvi) && (
            <button onClick={() => { setSearch(""); setFlFornProd(""); setFlStatus(""); setFlColecao(""); setFlFornAvi(""); }} className="text-[12px] text-[var(--system-blue)] font-medium">Limpar</button>
          )}
        </div>
        <div className="mb-2.5" style={{ position: "relative" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--label-tertiary)" strokeWidth="2.2" strokeLinecap="round"
            style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar ref ou descrição…"
            className="apple-input w-full text-[12px] py-1.5" style={{ paddingLeft: 28 }} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div>
            <label className="text-[11px] text-[var(--label-secondary)] mb-1 block font-medium">Fornecedor (Produto)</label>
            <select value={flFornProd} onChange={e => setFlFornProd(e.target.value)} className={`apple-select w-full text-[12px] py-1.5 ${flFornProd ? "!border-[var(--system-blue)] !bg-blue-50/60 text-[var(--system-blue)] font-semibold" : ""}`}>
              <option value="">Todos</option>
              {uv("fornecedor").map(v => <option key={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-[var(--label-secondary)] mb-1 block font-medium">Status Atual</label>
            <select value={flStatus} onChange={e => setFlStatus(e.target.value)} className={`apple-select w-full text-[12px] py-1.5 ${flStatus ? "!border-[var(--system-blue)] !bg-blue-50/60 text-[var(--system-blue)] font-semibold" : ""}`}>
              <option value="">Todos</option>
              {statusOpts.map(v => <option key={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-[var(--label-secondary)] mb-1 block font-medium">Coleção</label>
            <select value={flColecao} onChange={e => setFlColecao(e.target.value)} className={`apple-select w-full text-[12px] py-1.5 ${flColecao ? "!border-[var(--system-blue)] !bg-blue-50/60 text-[var(--system-blue)] font-semibold" : ""}`}>
              <option value="">Todas</option>
              {uv("colecao").map(v => <option key={v}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-[var(--label-secondary)] mb-1 block font-medium">Fornecedor de Aviamento</label>
            <select value={flFornAvi} onChange={e => setFlFornAvi(e.target.value)} className={`apple-select w-full text-[12px] py-1.5 ${flFornAvi ? "!border-[var(--system-blue)] !bg-blue-50/60 text-[var(--system-blue)] font-semibold" : ""}`}>
              <option value="">Todos</option>
              {uvFornAvi.map(v => <option key={v as string}>{v}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-baseline gap-3 mb-4">
        <span className="text-[28px] font-bold tabnum tracking-[-0.03em]">{sorted.length}</span>
        <span className="text-[14px] text-[var(--label-secondary)]">linha{sorted.length !== 1 && "s"}</span>
        <span className="text-[12px] text-[var(--label-tertiary)]">
          de {filteredProd.length} referência{filteredProd.length !== 1 && "s"}
        </span>
        <div className="ml-auto flex gap-2">
          <button onClick={handleExport} className="apple-input flex items-center gap-2 cursor-pointer transition-all hover:!border-[var(--system-green)] hover:text-[var(--system-green)]" title="Exportar para Excel">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Exportar
          </button>
          <button onClick={handleExportPdf} disabled={generatingPdf} className={`apple-input flex items-center gap-2 cursor-pointer transition-all hover:!border-[var(--system-red)] hover:text-[var(--system-red)] ${generatingPdf ? "opacity-60 cursor-not-allowed" : ""}`} title="Exportar PDF com imagens">
            {generatingPdf
              ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="animate-spin"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
              : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>}
            {generatingPdf ? "Gerando…" : "Exportar PDF"}
          </button>
        </div>
      </div>

      {/* Table */}
      <ScrollTable>
        <table className="plm-table" style={{ width: "max-content", minWidth: "100%" }}>
          <thead>
            <tr>
              {COLS.map(c => {
                const isActive = sort?.key === c.key;
                return (
                  <th key={c.key} style={{ width: c.w, minWidth: c.w }}>
                    {c.key === "_img" ? null : (
                      <button onClick={() => toggleSort(c.key)} className={`inline-flex items-center gap-1 select-none cursor-pointer hover:text-[var(--label-primary)] transition-colors ${isActive ? "text-[var(--system-blue)]" : ""}`}>
                        <span>{c.label}</span>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className={isActive ? "opacity-100" : "opacity-30"}>
                          {isActive && sort?.dir === "desc" ? <path d="M6 9l6 6 6-6" /> : <path d="M18 15l-6-6-6 6" />}
                        </svg>
                      </button>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={`${r.codigo}||${r.cor}||${i}`}>
                {COLS.map(c => {
                  if (c.key === "_img") return (
                    <td key="_img" style={{ width: c.w, minWidth: c.w, textAlign: "center", padding: "4px 6px" }}>
                      {r.imagem
                        ? <img src={r.imagem} alt={r.nome} style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 8, border: "1px solid var(--separator)", display: "inline-block" }} />
                        : <div style={{ width: 44, height: 44, borderRadius: 8, border: "1px dashed var(--separator)", background: "var(--bg-secondary)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--label-quaternary)" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                          </div>}
                    </td>
                  );
                  const val = (r as any)[c.key];
                  const display = (c as any).fmt ? (c as any).fmt(val) : val ?? "—";
                  const isEmpty = val == null || val === "" || val === 0;
                  return (
                    <td key={c.key} style={{ width: c.w, minWidth: c.w, textAlign: (c as any).num ? "right" : "left" }}>
                      <span className={`text-[13px] px-2.5 py-1 block ${ (c as any).num ? "tabnum" : ""} ${isEmpty ? "text-[var(--label-quaternary)]" : ""}`}>
                        {(c as any).num && val === 0 ? "—" : display}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr><td colSpan={COLS.length} className="py-16 text-center text-[var(--label-tertiary)]">Nenhum aviamento encontrado</td></tr>
            )}
          </tbody>
        </table>
      </ScrollTable>
    </div>
  );
}
