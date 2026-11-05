"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import COLUMNS from "@/lib/columns";
import { fetchRanking, type RankingDados, type RankingItem } from "@/lib/linx-client";
import MultiSelect, { normalizarFiltros, comFiltro } from "@/components/ui/MultiSelect";
import { CANAIS, canalDaFilial } from "@/lib/canais";

// Recorta a referência às filiais escolhidas (filtro de canal/filial): estoque
// e venda — totais, por cor e por loja — passam a contar só essas filiais.
// O futuro (pedido de compra) não tem filial e continua inteiro.
function recortar(it: RankingItem, ok: (filial: string) => boolean): RankingItem {
  const estCor: Record<string, number> = {}, venCor: Record<string, number> = {};
  const estLoja: Record<string, number> = {}, venLoja: Record<string, number> = {};
  let est = 0, ven = 0, venValor = 0;
  for (const [f, m] of Object.entries(it.estFC || {})) {
    if (!ok(f)) continue;
    for (const [c, q] of Object.entries(m)) { estCor[c] = (estCor[c] || 0) + q; estLoja[f] = (estLoja[f] || 0) + q; est += q; }
  }
  for (const [f, m] of Object.entries(it.venFC || {})) {
    if (!ok(f)) continue;
    for (const [c, q] of Object.entries(m)) { venCor[c] = (venCor[c] || 0) + q; venLoja[f] = (venLoja[f] || 0) + q; ven += q; }
    venValor += it.venValorF?.[f] || 0;
  }
  return { ...it, est, estCor, estLoja, ven, venCor, venLoja, venValor };
}

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

function Foto({ refProd, tamanho, grande = false }: { refProd: string; tamanho: number; grande?: boolean }) {
  const [falhou, setFalhou] = useState(false);
  return (
    <div style={{ width: tamanho, height: tamanho * 4 / 3, flexShrink: 0 }} className="rounded-lg overflow-hidden bg-[var(--bg-secondary)] flex items-center justify-center">
      {falhou ? (
        <svg width={tamanho / 3} height={tamanho / 3} viewBox="0 0 24 24" fill="none" stroke="var(--label-quaternary)" strokeWidth="1.5" strokeLinecap="round"><path d="M20.38 3.46L16 2a4 4 0 01-8 0L3.62 3.46a2 2 0 00-1.34 2.23l.58 3.47a1 1 0 00.99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 002-2V10h2.15a1 1 0 00.99-.84l.58-3.47a2 2 0 00-1.34-2.23z" /></svg>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/foto-produto?ref=${encodeURIComponent(refProd)}${grande ? "&tam=g" : ""}`} alt="" loading="lazy" onError={() => setFalhou(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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
  const [fl, setFl] = useState<Record<string, string[]>>(normalizarFiltros(salvo.fl));
  const [agrupar, setAgrupar] = useState<boolean>(!!salvo.agrupar);
  const [visual, setVisual] = useState<"cards" | "lista">(salvo.visual || "cards");
  // Ranking de estoque: ordenar pelo atual ou pelo total (atual + futuro).
  const [ordem, setOrdem] = useState<"atual" | "total">(salvo.ordem || "atual");
  // Canal e filial (como no BI), várias de cada.
  const [canais, setCanais] = useState<string[]>(Array.isArray(salvo.canais) ? salvo.canais : []);
  const [filiais, setFiliais] = useState<string[]>(Array.isArray(salvo.filiais) ? salvo.filiais : []);
  const [painelFiltros, setPainelFiltros] = useState(false);
  const [limite, setLimite] = useState(PAGINA);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  // Card ampliado (clique no card ou na linha da lista).
  const [ampliado, setAmpliado] = useState<{ it: RankingItem; pos: number } | null>(null);
  useEffect(() => {
    if (!ampliado) return;
    const fechar = (e: KeyboardEvent) => { if (e.key === "Escape") setAmpliado(null); };
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [ampliado]);

  const [dados, setDados] = useState<RankingDados | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const [de, ate] = intervalo(periodo, deCustom, ateCustom);
  const dias = Math.max(1, Math.round((new Date(ate).getTime() - new Date(de).getTime()) / 86400000) + 1);

  useEffect(() => {
    try { localStorage.setItem(chaveSalva, JSON.stringify({ periodo, de: deCustom, ate: ateCustom, q, fl, agrupar, visual, ordem, canais, filiais })); } catch {}
  }, [chaveSalva, periodo, deCustom, ateCustom, q, fl, agrupar, visual, ordem, canais, filiais]);

  // Cada troca de período busca de novo; o botão Atualizar força buscar tudo
  // do Linx (descarta a memória do servidor). Enquanto carrega, os números
  // anteriores ficam apagados com o aviso — antes pareciam já ser do período novo.
  const [recarga, setRecarga] = useState(0);
  useEffect(() => {
    let ativo = true;
    setCarregando(true); setErro("");
    fetchRanking(de, ate, recarga > 0)
      .then(d => { if (ativo) setDados(d); })
      .catch(e => { if (ativo) setErro(e.message || "Falha ao carregar do Linx."); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [de, ate, recarga]);
  // Dados na tela são de outro período (carregando ou a busca falhou).
  const desatualizado = !!dados && (carregando || !!erro || (!!dados.de && (dados.de !== de || dados.ate !== ate)));

  useEffect(() => { setLimite(PAGINA); }, [q, fl, agrupar, modo, canais, filiais]);

  // Todas as filiais que aparecem no estoque ou na venda, com o canal de cada.
  const todasFiliais = useMemo(() => {
    const s = new Set<string>();
    for (const it of dados?.itens || []) {
      Object.keys(it.estFC || {}).forEach(f => s.add(f));
      Object.keys(it.venFC || {}).forEach(f => s.add(f));
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [dados]);
  // Filial: só as dos canais escolhidos (ou todas, sem canal).
  const opcoesFilial = useMemo(
    () => (canais.length ? todasFiliais.filter(f => canais.includes(canalDaFilial(f))) : todasFiliais),
    [todasFiliais, canais],
  );
  const recorteAtivo = canais.length > 0 || filiais.length > 0;
  const itensBase = useMemo(() => {
    const itens = dados?.itens || [];
    if (!recorteAtivo) return itens;
    const ok = (f: string) => (!canais.length || canais.includes(canalDaFilial(f))) && (!filiais.length || filiais.includes(f));
    return itens.map(it => recortar(it, ok));
  }, [dados, recorteAtivo, canais, filiais]);

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
    const lista = itensBase.filter(it => {
      if (termo && !`${it.ref} ${it.desc}`.toUpperCase().includes(termo)) return false;
      for (const [k, v] of Object.entries(fl)) if (v.length && !v.includes(campo(it, k))) return false;
      // Ranking de estoque é de quem tem estoque; o de vendas, de quem vendeu
      // (sem venda publicada ainda, mostra quem tem estoque para não ficar vazio).
      if (modo === "estoque") return it.est > 0 || (porTotal && it.fut > 0);
      return vendasOk ? it.ven > 0 : it.est > 0;
    });
    return lista.sort((a, b) => principal(b) - principal(a) || apoio(b) - apoio(a) || a.ref.localeCompare(b.ref));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dados, itensBase, q, fl, modo, vendasOk, plmPorRef, porTotal]);

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
  const filtrosAtivos = Object.values(fl).filter(v => v.length).length;

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

  const setFiltro = (k: string, v: string[]) => setFl(prev => comFiltro(prev, k, v));
  // Clique na barra do grupo: liga/desliga aquele grupo no filtro.
  const alternarGrupo = (g: string) => { const atual = fl.grupo || []; setFiltro("grupo", atual.includes(g) ? atual.filter(x => x !== g) : [...atual, g]); };
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
          <button onClick={e => { e.stopPropagation(); alternar(`${it.ref}|${titulo}`); }} className="text-[11px] text-[var(--system-blue)] font-medium mt-1">
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
      <div className="apple-card p-4 flex flex-col cursor-pointer transition-shadow hover:shadow-lg hover:ring-1 hover:ring-[var(--separator)]" onClick={() => setAmpliado({ it, pos })} title="Clique para ampliar">
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
              <tr key={it.ref} className="border-t border-[var(--separator)] cursor-pointer hover:bg-[var(--bg-secondary)]" onClick={() => setAmpliado({ it, pos: inicio + i + 1 })}>
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
        <button
          onClick={() => setRecarga(r => r + 1)}
          disabled={carregando}
          title="Buscar de novo no Linx"
          className="ml-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium border border-[var(--separator)] text-[var(--system-blue)] hover:border-[var(--system-blue)] disabled:opacity-60"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={carregando ? "animate-spin" : ""}><path d="M21 12a9 9 0 11-2.64-6.36" /><polyline points="21 3 21 9 15 9" /></svg>
          {carregando ? "Atualizando..." : "Atualizar"}
        </button>
        {dados?.geradoEm && !carregando && <span className="text-[11px] text-[var(--label-quaternary)]">atualizado às {new Date(dados.geradoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>}
      </div>

      {/* Canal e filial (como no BI) — recortam estoque e venda */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--label-tertiary)] mr-1">Canal</span>
        <div className="w-[190px]">
          <MultiSelect value={canais} options={[...CANAIS]} todos="Todos os canais" onChange={v => { setCanais(v); if (v.length) setFiliais(prev => prev.filter(f => v.includes(canalDaFilial(f)))); }} className="text-[12px] !py-1.5" />
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[var(--label-tertiary)] ml-2 mr-1">Filial</span>
        <div className="w-[230px]">
          <MultiSelect value={filiais} options={opcoesFilial} todos="Todas as filiais" onChange={setFiliais} className="text-[12px] !py-1.5" />
        </div>
        {recorteAtivo && <button onClick={() => { setCanais([]); setFiliais([]); }} className="text-[12px] text-[var(--system-blue)] font-medium">Limpar</button>}
        {recorteAtivo && <span className="text-[11px] text-[var(--label-tertiary)]">Estoque e venda só dessas filiais · o futuro (pedidos) não tem filial e segue inteiro</span>}
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
                <MultiSelect value={fl[f.key] || []} options={opcoes[f.key] || []} onChange={v => setFiltro(f.key, v)} className="text-[12px] py-1.5" />
              </div>
            ))}
          </div>
          <p className="text-[11px] text-[var(--label-tertiary)] mt-3">Referências que não estão no PLM entram pelos dados do Linx (coleção, grupo, subgrupo, categoria, linha e fornecedor); filtros só do PLM, como status ou estilista, deixam essas de fora.</p>
        </div>
      )}
      {filtrosAtivos > 0 && !painelFiltros && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {Object.entries(fl).map(([k, v]) => v.length ? (
            <span key={k} className="inline-flex items-center gap-1 bg-blue-50 text-[var(--system-blue)] rounded-lg px-2.5 py-1 text-[12px] font-medium">
              <span className="text-blue-300">{FILTROS.find(f => f.key === k)?.label}:</span>{v.join(", ")}
              <button onClick={() => setFiltro(k, [])} className="ml-0.5 text-blue-300 hover:text-[var(--system-blue)]">×</button>
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
      {erro && (
        <div className="flex items-center gap-3 flex-wrap rounded-xl px-4 py-3 mb-4 text-[13px] bg-red-50 border border-red-200 text-[var(--system-red)]">
          <span className="flex-1 min-w-[200px]"><b>Não carregou o período {fmtData(de)} – {fmtData(ate)}.</b> {dados ? "Os números abaixo são do período anterior. " : ""}{erro}</span>
          <button onClick={() => setRecarga(r => r + 1)} className="apple-btn-secondary !py-1.5 text-[12px]">Tentar de novo</button>
        </div>
      )}
      {carregando && dados && (
        <div className="sticky top-2 z-20 flex items-center gap-2 rounded-xl px-4 py-2.5 mb-3 text-[13px] font-medium bg-[var(--bg-primary)] border border-[var(--system-blue)] text-[var(--system-blue)] shadow-md">
          <div className="plm-loading-spinner !w-4 !h-4" />
          Atualizando {fmtData(de)} – {fmtData(ate)}... os números abaixo ainda são do período anterior.
        </div>
      )}

      {dados && (
        <div style={{ opacity: desatualizado ? 0.35 : 1, transition: "opacity .2s", pointerEvents: desatualizado ? "none" : undefined }}>
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
                {!!fl.grupo?.length && <button onClick={() => setFiltro("grupo", [])} className="text-[11px] text-[var(--system-blue)] font-medium">Ver todos os grupos</button>}
              </div>
              <div className="grid gap-x-6 gap-y-1" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
                {grupos.map(g => (
                  <button key={g.nome} onClick={() => alternarGrupo(g.nome)} title="Filtrar este grupo" className="grid items-center text-[12px] py-1 text-left hover:opacity-80" style={{ gridTemplateColumns: "110px 1fr 70px" }}>
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
        </div>
      )}

      {ampliado && (() => {
        const { it, pos } = ampliado;
        const cob = cobertura(it);
        // Tabela completa: todas as cores/lojas, sem corte.
        const tabela = (titulo: string, cols: { rot: string; m: Record<string, number> }[], nomes?: Record<string, string>) => {
          const chaves = Array.from(new Set(cols.flatMap(col => Object.keys(col.m))));
          const linhas = chaves
            .map(k => ({ k, v: cols.map(col => col.m[k] || 0) }))
            .filter(l => l.v.some(x => x > 0))
            .sort((a, b) => b.v[0] - a.v[0] || b.v[1] - a.v[1]);
          if (!linhas.length) return null;
          const max = Math.max(1, ...linhas.map(l => l.v[0]));
          const grade = `1fr ${cols.map(() => "70px").join(" ")}`;
          return (
            <div className="mt-5">
              <div className="grid text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--label-tertiary)] pb-1.5 border-b border-[var(--separator)]" style={{ gridTemplateColumns: grade }}>
                <span>{titulo} ({linhas.length})</span>{cols.map(col => <span key={col.rot} className="text-right">{col.rot}</span>)}
              </div>
              {linhas.map(l => (
                <div key={l.k} className="grid items-center text-[13px] py-1.5 border-b border-[var(--separator)] last:border-0" style={{ gridTemplateColumns: grade }}>
                  <div className="relative min-w-0">
                    <div className="absolute inset-y-[-2px] left-0 rounded" style={{ width: `${(l.v[0] / max) * 100}%`, background: corFundo }} />
                    <span className="relative px-2 truncate block">{nomes ? (nomes[l.k] || l.k) : l.k}</span>
                  </div>
                  {l.v.map((x, i) => <span key={i} className={`text-right tabular-nums ${i === 0 ? "font-semibold" : "text-[var(--label-secondary)]"}`}>{x ? n(x) : "—"}</span>)}
                </div>
              ))}
            </div>
          );
        };
        const colsCor = modo === "vendas"
          ? [{ rot: "Vendido", m: it.venCor }, { rot: "Estoque", m: it.estCor }, { rot: "Futuro", m: it.futCor }]
          : [{ rot: "Estoque", m: it.estCor }, { rot: "Futuro", m: it.futCor }, { rot: "Vendido", m: it.venCor }];
        const colsLoja = modo === "vendas"
          ? [{ rot: "Vendido", m: it.venLoja }, { rot: "Estoque", m: it.estLoja }]
          : [{ rot: "Estoque", m: it.estLoja }, { rot: "Vendido", m: it.venLoja }];
        const kpis = [
          { rot: "Estoque atual", val: n(it.est) },
          { rot: "Futuro", val: n(it.fut) },
          { rot: "Total", val: n(it.est + it.fut) },
          { rot: "Vendido", val: vendasOk ? n(it.ven) : "—" },
          ...(it.venValor > 0 ? [{ rot: "Valor vendido", val: brl(it.venValor) }] : []),
          ...(cob !== null ? [{ rot: "Cobertura", val: `${cob >= 99 ? "99+" : cob.toFixed(1)} sem.` }] : []),
        ];
        return (
          <div className="fixed inset-0 z-50 flex items-start justify-center p-2 sm:p-8 overflow-y-auto bg-black/40 backdrop-blur-[6px]" onClick={() => setAmpliado(null)}>
            <div role="dialog" aria-modal="true" className="bg-[var(--bg-primary)] rounded-2xl w-full max-w-[920px] shadow-[0_24px_80px_rgba(0,0,0,0.25)] overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-[var(--separator)]">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="min-w-[34px] h-[34px] px-2 rounded-full text-[14px] font-bold text-white flex items-center justify-center shrink-0" style={{ background: pos <= 3 ? cor : "var(--label-secondary)" }}>{pos}</span>
                  <div className="min-w-0">
                    <div className="text-[17px] font-bold">{it.ref} <span className="font-normal text-[var(--label-secondary)]">— {it.desc}</span></div>
                    <div className="text-[12px] text-[var(--label-tertiary)]">{[campo(it, "colecao"), campo(it, "grupo"), campo(it, "subgrupo"), campo(it, "categoria")].filter(Boolean).join(" · ")}</div>
                  </div>
                </div>
                <button onClick={() => setAmpliado(null)} aria-label="Fechar" className="w-8 h-8 rounded-full bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] flex items-center justify-center text-[var(--label-secondary)] shrink-0">
                  <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
              <div className="p-5 flex flex-col md:flex-row gap-6">
                <div className="mx-auto md:mx-0 shrink-0"><Foto refProd={it.ref} tamanho={270} grande /></div>
                <div className="flex-1 min-w-0">
                  <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))" }}>
                    {kpis.map(k => (
                      <div key={k.rot} className="rounded-xl bg-[var(--bg-secondary)] px-3 py-2">
                        <div className="text-[11px] text-[var(--label-tertiary)] font-medium">{k.rot}</div>
                        <div className="text-[20px] font-bold tabular-nums">{k.val}</div>
                      </div>
                    ))}
                  </div>
                  {tabela("Cor", colsCor, cores)}
                  {tabela("Loja", colsLoja)}
                  {!vendasOk && <p className="text-[11px] text-[var(--label-tertiary)] mt-4">Vendido aparece quando o BI publicar o /vendas.</p>}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
