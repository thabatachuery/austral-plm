"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import COLUMNS from "@/lib/columns";
import { fetchRanking, type RankingDados, type RankingItem } from "@/lib/linx-client";

// Ranking de Vendas / Ranking de Estoque — a mesma tela com o eixo trocado.
// Vendas: ordena pela venda do período e mostra o estoque como apoio.
// Estoque: ordena pelo estoque atual e mostra a venda como apoio.
// Cada card traz as duas coisas por cor e por loja, lado a lado.

type Modo = "vendas" | "estoque";
type Props = { modo: Modo; rows: any[] };

// Mesmos filtros de Desenvolvimento (selects com cadastro + forn. tecido),
// com a coleção do Linx no lugar da coleção do PLM — ref antiga não está no PLM.
const FILTROS: { key: string; label: string }[] = [
  { key: "colecao", label: "Coleção" },
  ...COLUMNS.filter(c => (c.type === "select" && c.cad && c.key !== "colecao") || c.key === "forn_tecido").map(c => ({ key: c.key, label: c.label })),
];
// Campos que o Linx também tem: valem para referências fora do PLM.
const DO_LINX: Record<string, keyof RankingItem> = {
  colecao: "colecao", grupo: "grupo", subgrupo: "subgrupo", categoria: "categoria",
  subcategoria: "subcategoria", linha: "linha", fornecedor: "fabricante",
};

const PERIODOS = [
  { id: "7", label: "7 dias" },
  { id: "30", label: "30 dias" },
  { id: "90", label: "90 dias" },
  { id: "mes", label: "Mês atual" },
  { id: "ano", label: "Ano atual" },
  { id: "custom", label: "Personalizado" },
] as const;
type PeriodoId = (typeof PERIODOS)[number]["id"];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function intervalo(p: PeriodoId, de: string, ate: string): [string, string] {
  const hoje = new Date();
  if (p === "custom") return [de || iso(hoje), ate || iso(hoje)];
  if (p === "mes") return [iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), iso(hoje)];
  if (p === "ano") return [iso(new Date(hoje.getFullYear(), 0, 1)), iso(hoje)];
  const ini = new Date(hoje); ini.setDate(ini.getDate() - (Number(p) - 1));
  return [iso(ini), iso(hoje)];
}
const fmtData = (s: string) => s.split("-").reverse().join("/");
const n = (v: number) => v.toLocaleString("pt-BR");
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const ordenar = (m: Record<string, number>) => Object.entries(m).sort((a, b) => b[1] - a[1]);

const PAGINA = 48;

function Foto({ refProd, tamanho }: { refProd: string; tamanho: number }) {
  const [falhou, setFalhou] = useState(false);
  return (
    <div style={{ width: tamanho, height: tamanho * 4 / 3, flexShrink: 0 }} className="rounded-lg overflow-hidden bg-[var(--bg-secondary)] flex items-center justify-center">
      {falhou ? (
        <svg width={tamanho / 3} height={tamanho / 3} viewBox="0 0 24 24" fill="none" stroke="var(--label-quaternary)" strokeWidth="1.5" strokeLinecap="round"><path d="M20.38 3.46L16 2a4 4 0 01-8 0L3.62 3.46a2 2 0 00-1.34 2.23l.58 3.47a1 1 0 00.99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 002-2V10h2.15a1 1 0 00.99-.84l.58-3.47a2 2 0 00-1.34-2.23z" /></svg>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/foto-produto?ref=${encodeURIComponent(refProd)}`} alt="" loading="lazy" onError={() => setFalhou(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      )}
    </div>
  );
}

export default function RankingView({ modo, rows }: Props) {
  const chaveSalva = `plm_ranking_${modo}`;
  const salvo = useMemo(() => {
    if (typeof window === "undefined") return {} as any;
    try { return JSON.parse(localStorage.getItem(chaveSalva) || "{}"); } catch { return {}; }
  }, [chaveSalva]);

  const [periodo, setPeriodo] = useState<PeriodoId>(salvo.periodo || "30");
  const [deCustom, setDeCustom] = useState<string>(salvo.de || "");
  const [ateCustom, setAteCustom] = useState<string>(salvo.ate || "");
  const [q, setQ] = useState<string>(salvo.q || "");
  const [fl, setFl] = useState<Record<string, string>>(salvo.fl || {});
  const [agrupar, setAgrupar] = useState<boolean>(!!salvo.agrupar);
  const [visual, setVisual] = useState<"cards" | "lista">(salvo.visual || "cards");
  // Ranking de estoque: ordenar pelo atual ou pelo total (atual + futuro).
  const [ordem, setOrdem] = useState<"atual" | "total">(salvo.ordem || "atual");
  const [painelFiltros, setPainelFiltros] = useState(false);
  const [limite, setLimite] = useState(PAGINA);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());

  const [dados, setDados] = useState<RankingDados | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const [de, ate] = intervalo(periodo, deCustom, ateCustom);
  const dias = Math.max(1, Math.round((new Date(ate).getTime() - new Date(de).getTime()) / 86400000) + 1);

  useEffect(() => {
    try { localStorage.setItem(chaveSalva, JSON.stringify({ periodo, de: deCustom, ate: ateCustom, q, fl, agrupar, visual, ordem })); } catch {}
  }, [chaveSalva, periodo, deCustom, ateCustom, q, fl, agrupar, visual, ordem]);

  useEffect(() => {
    let ativo = true;
    setCarregando(true); setErro("");
    fetchRanking(de, ate)
      .then(d => { if (ativo) setDados(d); })
      .catch(e => { if (ativo) setErro(e.message); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [de, ate]);

  useEffect(() => { setLimite(PAGINA); }, [q, fl, agrupar, modo]);

  const plmPorRef = useMemo(() => {
    const m = new Map<string, any>();
    for (const r of rows) if (r?.ref) m.set(String(r.ref).trim(), r);
    return m;
  }, [rows]);

  const campo = (it: RankingItem, key: string): string => {
    const r = plmPorRef.get(it.ref);
    if (key !== "colecao") {
      const v = r?.[key];
      if (v != null && String(v).trim() !== "") return String(v).trim();
    }
    const k = DO_LINX[key];
    return k ? String(it[k] || "").trim() : "";
  };

  const cores = dados?.cores || {};
  const vendasOk = !!dados?.vendasDisponivel;
  const porTotal = modo === "estoque" && ordem === "total";
  const principal = (it: RankingItem) => (modo === "vendas" ? it.ven : porTotal ? it.est + it.fut : it.est);
  const apoio = (it: RankingItem) => (modo === "vendas" ? it.est : it.ven);

  const filtrados = useMemo(() => {
    if (!dados) return [];
    const termo = q.trim().toUpperCase();
    const lista = dados.itens.filter(it => {
      if (termo && !`${it.ref} ${it.desc}`.toUpperCase().includes(termo)) return false;
      for (const [k, v] of Object.entries(fl)) if (v && campo(it, k) !== v) return false;
      // Ranking de estoque é de quem tem estoque; o de vendas, de quem vendeu
      // (sem venda publicada ainda, mostra quem tem estoque para não ficar vazio).
      if (modo === "estoque") return it.est > 0 || (porTotal && it.fut > 0);
      return vendasOk ? it.ven > 0 : it.est > 0;
    });
    return lista.sort((a, b) => principal(b) - principal(a) || apoio(b) - apoio(a) || a.ref.localeCompare(b.ref));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dados, q, fl, modo, vendasOk, plmPorRef, porTotal]);

  const opcoes = useMemo(() => {
    const o: Record<string, string[]> = {};
    if (!dados) return o;
    for (const f of FILTROS) {
      const s = new Set<string>();
      for (const it of dados.itens) { const v = campo(it, f.key); if (v) s.add(v); }
      o[f.key] = Array.from(s).sort((a, b) => a.localeCompare(b, "pt-BR"));
    }
    return o;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dados, plmPorRef]);

  const grupos = useMemo(() => {
    const m = new Map<string, { nome: string; total: number; apoio: number; itens: RankingItem[] }>();
    for (const it of filtrados) {
      const nome = campo(it, "grupo") || "SEM GRUPO";
      const g = m.get(nome) || { nome, total: 0, apoio: 0, itens: [] };
      g.total += principal(it); g.apoio += apoio(it); g.itens.push(it);
      m.set(nome, g);
    }
    return Array.from(m.values()).sort((a, b) => b.total - a.total || b.apoio - a.apoio);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtrados]);

  const totPrincipal = filtrados.reduce((s, it) => s + principal(it), 0);
  const totEst = filtrados.reduce((s, it) => s + it.est, 0);
  const totApoio = filtrados.reduce((s, it) => s + apoio(it), 0);
  const totFuturo = filtrados.reduce((s, it) => s + it.fut, 0);
  const totValor = filtrados.reduce((s, it) => s + it.venValor, 0);
  const maxPrincipal = Math.max(1, ...filtrados.map(principal));
  const filtrosAtivos = Object.values(fl).filter(Boolean).length;

  const nomePrincipal = modo === "vendas" ? "Vendido" : "Estoque";
  const nomeApoio = modo === "vendas" ? "Estoque" : "Vendido";
  const cor = modo === "vendas" ? "var(--system-blue)" : "#1a7a35";
  const corFundo = modo === "vendas" ? "rgba(0,122,255,0.12)" : "rgba(52,199,89,0.15)";

  // Semanas de estoque no ritmo de venda do período.
  const cobertura = (it: RankingItem) => {
    if (!vendasOk || it.ven <= 0) return null;
    const porSemana = it.ven / dias * 7;
    return it.est / porSemana;
  };

  const setFiltro = (k: string, v: string) => setFl(prev => ({ ...prev, [k]: v }));
  const alternar = (ref: string) => setAbertos(prev => { const s = new Set(prev); s.has(ref) ? s.delete(ref) : s.add(ref); return s; });

  // ── Tabela cor/loja do card: coluna principal ordena, a de apoio acompanha ──
  const Detalhe = ({ titulo, prin, apo, nomes, limiteLinhas, it }: { titulo: string; prin: Record<string, number>; apo: Record<string, number>; nomes?: Record<string, string>; limiteLinhas: number; it: RankingItem }) => {
    const chaves = new Set([...Object.keys(prin), ...Object.keys(apo)]);
    const linhas = Array.from(chaves)
      .map(k => ({ k, p: prin[k] || 0, a: apo[k] || 0 }))
      .filter(l => l.p > 0 || l.a > 0)
      .sort((x, y) => y.p - x.p || y.a - x.a);
    if (!linhas.length) return null;
    const aberto = abertos.has(`${it.ref}|${titulo}`);
    const visiveis = aberto ? linhas : linhas.slice(0, limiteLinhas);
    const maxLinha = Math.max(1, ...linhas.map(l => l.p));
    return (
      <div className="mt-3">
        <div className="grid items-center text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--label-tertiary)] mb-1" style={{ gridTemplateColumns: "1fr 54px 54px" }}>
          <span>{titulo}</span><span className="text-right">{nomePrincipal}</span><span className="text-right">{nomeApoio}</span>
        </div>
        {visiveis.map(l => (
          <div key={l.k} className="grid items-center text-[12px] py-[3px]" style={{ gridTemplateColumns: "1fr 54px 54px" }}>
            <div className="min-w-0 relative">
              <div className="absolute inset-y-0 left-0 rounded" style={{ width: `${(l.p / maxLinha) * 100}%`, background: corFundo }} />
              <span className="relative px-1.5 truncate block">{nomes ? `${nomes[l.k] || l.k}` : l.k}</span>
            </div>
            <span className="text-right font-semibold tabular-nums">{l.p ? n(l.p) : "—"}</span>
            <span className="text-right tabular-nums text-[var(--label-secondary)]">{l.a ? n(l.a) : (modo === "estoque" && !vendasOk ? "" : "—")}</span>
          </div>
        ))}
        {linhas.length > limiteLinhas && (
          <button onClick={() => alternar(`${it.ref}|${titulo}`)} className="text-[11px] text-[var(--system-blue)] font-medium mt-1">
            {aberto ? "Mostrar menos" : `Ver todas (${linhas.length})`}
          </button>
        )}
      </div>
    );
  };

  const Card = ({ it, pos }: { it: RankingItem; pos: number }) => {
    const cob = cobertura(it);
    const p = principal(it);
    return (
      <div className="apple-card p-4 flex flex-col">
        <div className="flex gap-3">
          <div className="relative">
            <Foto refProd={it.ref} tamanho={84} />
            <span className="absolute -top-2 -left-2 min-w-[26px] h-[26px] px-1.5 rounded-full text-[12px] font-bold text-white flex items-center justify-center shadow" style={{ background: pos <= 3 ? cor : "var(--label-secondary)" }}>{pos}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-bold">{it.ref}</div>
            <div className="text-[12px] text-[var(--label-secondary)] leading-tight line-clamp-2">{it.desc || "—"}</div>
            <div className="text-[11px] text-[var(--label-tertiary)] mt-0.5 truncate">{[campo(it, "grupo"), campo(it, "colecao")].filter(Boolean).join(" · ")}</div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-[24px] font-bold leading-none tabular-nums" style={{ color: cor }}>{n(p)}</span>
              <span className="text-[11px] text-[var(--label-tertiary)]">{modo === "vendas" ? "peças vendidas" : porTotal ? "peças atual + futuro" : "peças em estoque"}</span>
            </div>
            <div className="h-1.5 rounded-full bg-[var(--bg-secondary)] mt-1.5 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${(p / maxPrincipal) * 100}%`, background: cor }} />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 text-[11px] text-[var(--label-secondary)]">
          {modo === "vendas"
            ? <><span>Estoque <b className="text-[var(--label-primary)]">{n(it.est)}</b></span><span>Futuro <b className="text-[var(--label-primary)]">{n(it.fut)}</b></span>{it.venValor > 0 && <span>{brl(it.venValor)}</span>}</>
            : <><span>Atual <b className="text-[var(--label-primary)]">{n(it.est)}</b></span><span>Futuro <b className="text-[var(--label-primary)]">{n(it.fut)}</b></span><span>Total <b className="text-[var(--label-primary)]">{n(it.est + it.fut)}</b></span>{vendasOk && <span>Vendido <b className="text-[var(--label-primary)]">{n(it.ven)}</b></span>}</>}
          {cob !== null && <span>Cobertura <b className="text-[var(--label-primary)]">{cob >= 99 ? "99+" : cob.toFixed(1)} sem.</b></span>}
        </div>
        {Detalhe({ it, titulo: "Cor", prin: modo === "vendas" ? it.venCor : it.estCor, apo: modo === "vendas" ? it.estCor : it.venCor, nomes: cores, limiteLinhas: 4 })}
        {Detalhe({ it, titulo: "Loja", prin: modo === "vendas" ? it.venLoja : it.estLoja, apo: modo === "vendas" ? it.estLoja : it.venLoja, limiteLinhas: 5 })}
      </div>
    );
  };

  const Lista = ({ itens, inicio }: { itens: RankingItem[]; inicio: number }) => (
    <div className="apple-card overflow-x-auto">
      <table className="w-full text-[12px]" style={{ minWidth: 760 }}>
        <thead>
          <tr className="text-[10px] uppercase tracking-[0.04em] text-[var(--label-tertiary)] text-left">
            <th className="px-3 py-2 w-10">#</th><th className="py-2" colSpan={2}>Referência</th><th className="py-2">Grupo</th>
            <th className="py-2 text-right">{nomePrincipal}</th><th className="py-2 w-[18%]"></th>
            <th className="py-2 text-right">{nomeApoio}</th><th className="py-2 text-right">Futuro</th>{modo === "estoque" && <th className="py-2 text-right">Total</th>}
            <th className="py-2 pl-4">Cor que mais {modo === "vendas" ? "vende" : "tem"}</th><th className="py-2 pr-3">Loja que mais {modo === "vendas" ? "vende" : "tem"}</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((it, i) => {
            const topCor = ordenar(modo === "vendas" ? it.venCor : it.estCor)[0];
            const topLoja = ordenar(modo === "vendas" ? it.venLoja : it.estLoja)[0];
            const p = principal(it);
            return (
              <tr key={it.ref} className="border-t border-[var(--separator)]">
                <td className="px-3 py-1.5 font-bold" style={{ color: inicio + i < 3 ? cor : undefined }}>{inicio + i + 1}</td>
                <td className="py-1.5 w-[42px]"><Foto refProd={it.ref} tamanho={32} /></td>
                <td className="py-1.5 pl-2"><div className="font-semibold">{it.ref}</div><div className="text-[var(--label-secondary)] truncate max-w-[220px]">{it.desc}</div></td>
                <td className="py-1.5 text-[var(--label-secondary)]">{campo(it, "grupo")}</td>
                <td className="py-1.5 text-right font-bold tabular-nums" style={{ color: cor }}>{n(p)}</td>
                <td className="py-1.5 pl-2"><div className="h-1.5 rounded-full bg-[var(--bg-secondary)]"><div className="h-full rounded-full" style={{ width: `${(p / maxPrincipal) * 100}%`, background: cor }} /></div></td>
                <td className="py-1.5 text-right tabular-nums">{modo === "estoque" && !vendasOk ? "—" : n(apoio(it))}</td>
                <td className="py-1.5 text-right tabular-nums">{n(it.fut)}</td>{modo === "estoque" && <td className="py-1.5 text-right tabular-nums font-semibold">{n(it.est + it.fut)}</td>}
                <td className="py-1.5 pl-4 truncate max-w-[160px]">{topCor ? `${cores[topCor[0]] || topCor[0]} (${n(topCor[1])})` : "—"}</td>
                <td className="py-1.5 pr-3 truncate max-w-[180px]">{topLoja ? `${topLoja[0]} (${n(topLoja[1])})` : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const Bloco = ({ itens, inicio }: { itens: RankingItem[]; inicio: number }) =>
    visual === "lista"
      ? Lista({ itens, inicio })
      : <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))" }}>{itens.map((it, i) => <Fragment key={it.ref}>{Card({ it, pos: inicio + i + 1 })}</Fragment>)}</div>;

  const botao = (ativo: boolean) => `px-3 py-1.5 rounded-full text-[12px] font-medium transition-all border ${ativo ? "bg-[var(--label-primary)] text-[var(--bg-primary)] border-[var(--label-primary)]" : "bg-transparent text-[var(--label-secondary)] border-[var(--separator)] hover:border-[var(--label-tertiary)]"}`;

  return (
    <div>
      {/* Período (como no BI) */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--label-tertiary)] mr-1">Período de venda</span>
        {PERIODOS.map(p => <button key={p.id} onClick={() => setPeriodo(p.id)} className={botao(periodo === p.id)}>{p.label}</button>)}
        {periodo === "custom" && (
          <span className="flex items-center gap-1.5">
            <input type="date" value={deCustom} onChange={e => setDeCustom(e.target.value)} className="apple-input !py-1 text-[12px]" />
            <span className="text-[12px] text-[var(--label-tertiary)]">até</span>
            <input type="date" value={ateCustom} onChange={e => setAteCustom(e.target.value)} className="apple-input !py-1 text-[12px]" />
          </span>
        )}
        <span className="text-[12px] text-[var(--label-tertiary)]">{fmtData(de)} – {fmtData(ate)}</span>
      </div>

      {/* Busca, filtros, agrupamento, visual */}
      <div className="flex gap-2 mb-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-0 sm:min-w-[240px]">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--label-tertiary)] pointer-events-none" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input type="text" placeholder="Buscar referência ou descrição..." value={q} onChange={e => setQ(e.target.value)} className="apple-input w-full !pl-10 pr-3" />
        </div>
        <button onClick={() => setPainelFiltros(!painelFiltros)} className={`apple-input flex items-center gap-2 cursor-pointer transition-all ${painelFiltros || filtrosAtivos > 0 ? "!border-[var(--system-blue)] !bg-blue-50 text-[var(--system-blue)] font-semibold" : ""}`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" /></svg>
          Filtros{filtrosAtivos > 0 && <span className="bg-[var(--system-blue)] text-white text-[10px] font-bold w-[18px] h-[18px] rounded-full flex items-center justify-center">{filtrosAtivos}</span>}
        </button>
        <div className="flex rounded-lg border border-[var(--separator)] overflow-hidden text-[12px]">
          <button onClick={() => setAgrupar(false)} className={`px-3 py-2 ${!agrupar ? "bg-[var(--label-primary)] text-[var(--bg-primary)] font-semibold" : "text-[var(--label-secondary)]"}`}>Geral</button>
          <button onClick={() => setAgrupar(true)} className={`px-3 py-2 ${agrupar ? "bg-[var(--label-primary)] text-[var(--bg-primary)] font-semibold" : "text-[var(--label-secondary)]"}`}>Por grupo</button>
        </div>
        {modo === "estoque" && (
          <div className="flex rounded-lg border border-[var(--separator)] overflow-hidden text-[12px]" title="Ordenar o ranking por">
            <button onClick={() => setOrdem("atual")} className={`px-3 py-2 ${ordem === "atual" ? "bg-[var(--label-primary)] text-[var(--bg-primary)] font-semibold" : "text-[var(--label-secondary)]"}`}>Atual</button>
            <button onClick={() => setOrdem("total")} className={`px-3 py-2 ${ordem === "total" ? "bg-[var(--label-primary)] text-[var(--bg-primary)] font-semibold" : "text-[var(--label-secondary)]"}`}>Atual + futuro</button>
          </div>
        )}
        <div className="flex rounded-lg border border-[var(--separator)] overflow-hidden text-[12px]">
          <button onClick={() => setVisual("cards")} className={`px-3 py-2 ${visual === "cards" ? "bg-[var(--label-primary)] text-[var(--bg-primary)] font-semibold" : "text-[var(--label-secondary)]"}`}>Cards</button>
          <button onClick={() => setVisual("lista")} className={`px-3 py-2 ${visual === "lista" ? "bg-[var(--label-primary)] text-[var(--bg-primary)] font-semibold" : "text-[var(--label-secondary)]"}`}>Lista</button>
        </div>
      </div>

      {painelFiltros && (
        <div className="apple-card p-4 mb-4 bg-[var(--bg-secondary)]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--label-secondary)]">Filtrar por</span>
            {filtrosAtivos > 0 && <button onClick={() => setFl({})} className="text-[12px] text-[var(--system-blue)] font-medium">Limpar todos</button>}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
            {FILTROS.map(f => (
              <div key={f.key}>
                <label className="text-[11px] text-[var(--label-secondary)] mb-1 block font-medium">{f.label}</label>
                <select value={fl[f.key] || ""} onChange={e => setFiltro(f.key, e.target.value)} className={`apple-select w-full text-[12px] py-1.5 ${fl[f.key] ? "!border-[var(--system-blue)] !bg-blue-50/60 text-[var(--system-blue)] font-semibold" : ""}`}>
                  <option value="">Todos</option>
                  {(opcoes[f.key] || []).map(v => <option key={v}>{v}</option>)}
                </select>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-[var(--label-tertiary)] mt-3">Referências que não estão no PLM entram pelos dados do Linx (coleção, grupo, subgrupo, categoria, linha e fornecedor); filtros só do PLM, como status ou estilista, deixam essas de fora.</p>
        </div>
      )}
      {filtrosAtivos > 0 && !painelFiltros && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {Object.entries(fl).map(([k, v]) => v ? (
            <span key={k} className="inline-flex items-center gap-1 bg-blue-50 text-[var(--system-blue)] rounded-lg px-2.5 py-1 text-[12px] font-medium">
              <span className="text-blue-300">{FILTROS.find(f => f.key === k)?.label}:</span>{v}
              <button onClick={() => setFiltro(k, "")} className="ml-0.5 text-blue-300 hover:text-[var(--system-blue)]">×</button>
            </span>
          ) : null)}
          <button onClick={() => setFl({})} className="text-[12px] text-[var(--label-tertiary)] px-2 py-1">Limpar</button>
        </div>
      )}

      {dados && !vendasOk && (
        <div className="flex items-start gap-2.5 rounded-xl px-4 py-3 mb-4 text-[13px]" style={{ background: "rgba(255,149,0,0.08)", border: "1px solid rgba(255,149,0,0.25)", color: "#8a5200" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="mt-0.5 shrink-0"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
          <span>
            {dados.vendasErro
              ? <>Não foi possível ler as vendas do BI: {dados.vendasErro}</>
              : <>As vendas ainda não estão publicadas na API do BI (endpoint <b>/vendas</b> pedido à equipe do BI). {modo === "vendas" ? "Enquanto isso, a lista abaixo segue a ordem do estoque." : "O estoque já está completo; a venda entra nos cards assim que o BI publicar."}</>}
          </span>
        </div>
      )}

      {carregando && !dados && <div className="plm-loading"><div className="plm-loading-spinner" /><span>Carregando do Linx...</span></div>}
      {erro && <div className="apple-card p-6 text-center text-[13px] text-[var(--system-red)]">{erro}</div>}

      {dados && (
        <>
          {/* Visão geral */}
          <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
            {[
              { rot: "Referências", val: n(filtrados.length) },
              ...(modo === "vendas"
                ? [{ rot: "Peças vendidas", val: n(totPrincipal), destaque: true }, { rot: "Valor vendido", val: vendasOk ? brl(totValor) : "—" }, { rot: "Estoque atual", val: n(totApoio) }]
                : [{ rot: "Estoque atual", val: n(totEst), destaque: !porTotal }, { rot: "Futuro (a receber)", val: n(totFuturo) }, { rot: "Total (atual + futuro)", val: n(totEst + totFuturo), destaque: porTotal }, { rot: "Vendido no período", val: vendasOk ? n(totApoio) : "—" }]),
            ].map(k => (
              <div key={k.rot} className="apple-card px-4 py-3">
                <div className="text-[11px] text-[var(--label-tertiary)] font-medium">{k.rot}</div>
                <div className="text-[22px] font-bold tabular-nums" style={k.destaque ? { color: cor } : undefined}>{k.val}</div>
              </div>
            ))}
          </div>

          {grupos.length > 1 && (
            <div className="apple-card p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--label-secondary)]">{modo === "vendas" ? "Venda" : "Estoque"} por grupo</span>
                {fl.grupo && <button onClick={() => setFiltro("grupo", "")} className="text-[11px] text-[var(--system-blue)] font-medium">Ver todos os grupos</button>}
              </div>
              <div className="grid gap-x-6 gap-y-1" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
                {grupos.map(g => (
                  <button key={g.nome} onClick={() => setFiltro("grupo", fl.grupo === g.nome ? "" : g.nome)} title="Filtrar este grupo" className="grid items-center text-[12px] py-1 text-left hover:opacity-80" style={{ gridTemplateColumns: "110px 1fr 70px" }}>
                    <span className="truncate font-medium">{g.nome}</span>
                    <span className="h-2 rounded-full bg-[var(--bg-secondary)] overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${(g.total / Math.max(1, grupos[0].total)) * 100}%`, background: cor }} /></span>
                    <span className="text-right tabular-nums"><b>{n(g.total)}</b> <span className="text-[var(--label-tertiary)]">{totPrincipal ? `${Math.round(g.total / totPrincipal * 100)}%` : ""}</span></span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {filtrados.length === 0 && <div className="apple-card p-10 text-center text-[13px] text-[var(--label-secondary)]">Nenhuma referência com esses filtros.</div>}

          {!agrupar && filtrados.length > 0 && (
            <>
              {Bloco({ itens: filtrados.slice(0, limite), inicio: 0 })}
              {filtrados.length > limite && (
                <div className="text-center mt-4">
                  <button onClick={() => setLimite(l => l + PAGINA)} className="apple-btn-secondary">Mostrar mais ({n(filtrados.length - limite)} restantes)</button>
                </div>
              )}
            </>
          )}

          {agrupar && grupos.map(g => {
            const chave = `grupo|${g.nome}`;
            const aberto = abertos.has(chave);
            const vis = aberto ? g.itens : g.itens.slice(0, visual === "lista" ? 10 : 6);
            return (
              <section key={g.nome} className="mb-6">
                <div className="flex items-baseline gap-3 mb-2 flex-wrap">
                  <h3 className="text-[15px] font-bold">{g.nome}</h3>
                  <span className="text-[12px] text-[var(--label-secondary)]">{n(g.itens.length)} ref. · <b style={{ color: cor }}>{n(g.total)}</b> {modo === "vendas" ? "vendidas" : "em estoque"}</span>
                </div>
                {Bloco({ itens: vis, inicio: 0 })}
                {g.itens.length > vis.length || aberto ? (
                  <button onClick={() => alternar(chave)} className="text-[12px] text-[var(--system-blue)] font-medium mt-2">
                    {aberto ? "Mostrar menos" : `Ver todas as ${n(g.itens.length)} de ${g.nome}`}
                  </button>
                ) : null}
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
