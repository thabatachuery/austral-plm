"use client";
import { COR_PALETTE } from "@/lib/cor-palette";
import { valorNoTamanho, calcularDaBase, num as tamNum } from "@/lib/tamanhos";
import type { ResultadoPeso } from "@/lib/peso";
import { fotosParaExibir } from "@/lib/aviamento-fotos";
import { custoAviamentosPorPeca } from "@/lib/etiquetas-tamanho";

type Props = {
  row: any; tec: any[]; avi: any[]; pil: any[]; pts: any[]; grad: any[];
  pv: Record<string, { p1: string; p2: string; p3: string }>;
  an: Record<string, { texto: string; video: string }>;
  img: string | null; imgModelo: string | null; imgModoMedir?: string | null;
  imgFrente?: string | null; imgCostas?: string | null;
  hasEstamparia: boolean; estamparia?: any; pantones?: Record<string, string>;
  obs?: string; statusLib?: string; tecCad?: any[]; tabelaEspecial?: boolean;
  sections?: { ficha: boolean; estamparia: boolean; liberacao: boolean; graduacao: boolean };
  ncm?: string;
  peso?: ResultadoPeso | null;
  vcCompras?: Record<string, any>;
  provaInfo?: Record<string, { data: string; status: string; link: string; fotoFrente: string; fotoLado: string; fotoCostas: string; tipo: string }>;
  gradTamanhos?: string[]; gradBase?: string; tabTamanhos?: string[];
};

/* ── Design tokens ── */
const navy = "#0C1D2E";
const accent = "#2563EB";
const muted = "#64748B";
const light = "#94A3B8";
const line = "#E2E8F0";
const lineDark = "#CBD5E1";
const bg = "#F8FAFC";
const success = "#059669";
const warn = "#D97706";
const danger = "#DC2626";
const white = "#FFFFFF";

export default function FichaPDF({ row, tec, avi, pil, pts, grad, pv, an, img, imgModelo, imgModoMedir, imgFrente, imgCostas, hasEstamparia, estamparia, pantones, obs, statusLib, tecCad, sections, ncm, peso, vcCompras, provaInfo, gradTamanhos = [], gradBase = "", tabTamanhos = [] }: Props) {
  const sec = sections || { ficha: true, estamparia: true, liberacao: true, graduacao: true };
  const compOf = (nome: string) => (tecCad || []).find((t: any) => t.nome === nome)?.comp || "";
  // Foto do tecido (Cadastros › Tecidos) — impressa junto do desenho técnico
  const imgTecOf = (nome: string) => (tecCad || []).find((t: any) => t.nome === nome)?.imagem || "";
  const fotosTec = tec
    .map((t, i) => ({ i, nome: t.artigo, url: imgTecOf(t.artigo) }))
    .filter(f => f.url);
  const avT = custoAviamentosPorPeca(avi, row.grade, row.linha);
  const tm = row.tab_medidas || "";
  // tamNum trata a vírgula decimal ("2,5"); parseFloat pararia nela.
  const gd = (t: string, m: string) => { if (!m) return ""; const a = tamNum(t), b = tamNum(m); if (isNaN(a) || isNaN(b)) return ""; const d = b - a; return d === 0 ? "0" : d > 0 ? `+${d.toFixed(1)}` : d.toFixed(1); };
  const artes = estamparia?.artes || [];
  const tecnicas = estamparia?.tecnicas || [];
  const sims = estamparia?.simulacoes || {};

  const _ps = (row.status || "").toUpperCase();
  const fichaType =
    _ps.includes('CANCELADO') ? 'cancelado' :
    (_ps.includes('PRODUÇÃO') || _ps.includes('PRODUCAO') || _ps.includes('REPILOTANDO')) ? 'producao' :
    (_ps.includes('MOSTRUÁRIO') || _ps.includes('MOSTRUARIO')) ? 'mostruario' :
    'desenvolvimento';
  const headerBg = fichaType === 'cancelado' ? '#EA2F46' : fichaType === 'producao' ? '#2DB564' : fichaType === 'mostruario' ? '#EDCA35' : '#4464AF';
  const headerLabel = fichaType === 'cancelado' ? 'CANCELADO' : fichaType === 'producao' ? 'PRODUÇÃO' : fichaType === 'mostruario' ? 'MOSTRUÁRIO' : 'DESENVOLVIMENTO';
  const modelagemColor = statusLib === 'REPROVADO' ? '#EA2F46' : (statusLib === 'APROVADO' || statusLib === 'APROVADO COM RESTRIÇÃO') ? '#2DB564' : '#4464AF';
  const numVars = Math.max(4, Math.min(6, estamparia?.numVariantes || tec[0]?.cores?.filter(Boolean).length || 4));

  let pageNum = 0;
  const pb = (): React.CSSProperties => { pageNum++; return pageNum > 1 ? { pageBreakBefore: "always" } : {}; };

  const PageHead = ({ title, sub, bg: bgOverride }: { title: string; sub?: string; bg?: string }) => (
    <div style={{ background: bgOverride || headerBg, color: white, borderRadius: "4px", padding: "8px 14px", marginBottom: "14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div>
        <div style={{ fontSize: "6.5px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", opacity: 0.6, marginBottom: "1px" }}>Austral®</div>
        <div style={{ fontSize: "16px", fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.1 }}>{title}</div>
        {sub && <div style={{ fontSize: "7.5px", opacity: 0.7, marginTop: "2px" }}>{sub}</div>}
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: "8px", opacity: 0.7, lineHeight: 1.6 }}>Coleção <strong style={{ opacity: 1 }}>{row.colecao}</strong></div>
        <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "-0.01em" }}>{row.ref}</div>
        <div style={{ fontSize: "7px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: "3px", background: "rgba(255,255,255,0.18)", padding: "2px 8px", borderRadius: "3px", display: "inline-block" }}>{headerLabel}</div>
      </div>
    </div>
  );

  const Field = ({ label, value, mono }: { label: string; value: string; mono?: boolean }) => (
    <div style={{ padding: "6px 0", borderBottom: `0.5px solid ${line}` }}>
      <div style={{ fontSize: "6.5px", fontWeight: 600, color: light, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "1px" }}>{label}</div>
      <div style={{ fontSize: "9.5px", fontWeight: 600, color: navy, ...(mono ? { fontFamily: "monospace", letterSpacing: "0.02em" } : {}) }}>{value || "—"}</div>
    </div>
  );

  const Badge = ({ text, color }: { text: string; color: string }) => (
    <span style={{ display: "inline-block", fontSize: "7px", fontWeight: 700, color: white, background: color, padding: "2px 8px", borderRadius: "3px", letterSpacing: "0.04em", textTransform: "uppercase" }}>{text}</span>
  );

  // Fecha a seção de aviamentos: o valor total em destaque e as observações.
  const ResumoAviObs = () => (
    <div style={{ display: "flex", gap: "8px", marginTop: "12px", pageBreakInside: "avoid" }}>
      <div style={{ width: "130px", background: headerBg, borderRadius: "6px", padding: "8px 12px", color: white }}>
        <div style={{ fontSize: "6.5px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", opacity: 0.7, marginBottom: "3px" }}>Total Aviamentos</div>
        <div style={{ fontSize: "14px", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>R$ {avT.toFixed(2)}</div>
      </div>
      <div style={{ flex: 1, background: bg, borderRadius: "6px", padding: "8px 12px", border: `1px solid ${line}` }}>
        <div style={{ fontSize: "6.5px", fontWeight: 600, color: light, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "2px" }}>Observações</div>
        <div style={{ fontSize: "8px", color: obs ? navy : light, whiteSpace: "pre-wrap", lineHeight: 1.4 }}>{obs || "Nenhuma observação."}</div>
      </div>
    </div>
  );

  return (
    <div className="print-ficha" style={{ fontFamily: "'Inter', -apple-system, 'Helvetica Neue', Arial, sans-serif", fontSize: "9px", color: navy, lineHeight: 1.5 }}>

      {/* ══════════ FICHA TÉCNICA ══════════ */}
      {sec.ficha && (<>
        {/* Página 1 — layout idêntico à modal */}
        <div className="print-page" style={pb()}>

          {/* Cabeçalho colorido — igual à modal */}
          <div style={{ background: headerBg, color: white, borderRadius: "5px", padding: "5px 12px", marginBottom: "5px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "10px", fontWeight: 800, letterSpacing: "0.04em" }}>FICHA TÉCNICA</span>
            <span style={{ fontSize: "7.5px", fontWeight: 700, background: "rgba(255,255,255,0.18)", padding: "2px 9px", borderRadius: "20px" }}>{headerLabel}</span>
            <span style={{ fontSize: "7.5px", opacity: 0.8 }}>Coleção <strong style={{ opacity: 1 }}>{row.colecao}</strong></span>
          </div>

          {/* Campos — grid 2 colunas com borda, igual à modal */}
          <div style={{ border: `1px solid ${line}`, borderRadius: "5px", overflow: "hidden", marginBottom: "5px" }}>
            {/* Referência + Descrição em destaque */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: `1px solid ${line}` }}>
              <div style={{ padding: "4px 10px", borderRight: `0.5px solid ${line}`, background: `${headerBg}80` }}>
                <div style={{ fontSize: "5.5px", fontWeight: 700, color: navy, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "1px", opacity: 0.65 }}>Referência</div>
                <div style={{ fontSize: "13px", fontWeight: 800, color: navy, fontFamily: "monospace", letterSpacing: "0.02em" }}>{row.ref || "—"}</div>
              </div>
              <div style={{ padding: "4px 10px", background: `${headerBg}40` }}>
                <div style={{ fontSize: "5.5px", fontWeight: 700, color: navy, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "1px", opacity: 0.65 }}>Descrição</div>
                <div style={{ fontSize: "9.5px", fontWeight: 600, color: navy }}>{row.desc || "—"}</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
              {([["Tecido", row.tecido, false], ["Forn. Tecido", row.forn_tecido, false], ["Composição", row.composicao || compOf(row.tecido), false], ["Operação", row.operacao, false], ["Fornecedor", row.fornecedor, false], ["Estilista", row.estilista, false], ["Tab. Medidas", row.tab_medidas, false], ["NCM", ncm || "", true], ["Peso Estimado", peso?.pesoG != null ? `${peso.pesoG.toLocaleString("pt-BR")} g` : "", false]] as [string, string, boolean][]).map(([l, v, mono], i) => (
                <div key={l} style={{ padding: "2px 10px", borderBottom: `0.5px solid ${line}`, borderRight: i % 2 === 0 ? `0.5px solid ${line}` : "none" }}>
                  <div style={{ fontSize: "5.5px", fontWeight: 700, color: muted, textTransform: "uppercase", letterSpacing: "0.1em" }}>{l}</div>
                  <div style={{ fontSize: "8px", fontWeight: 700, color: navy, ...(mono ? { fontFamily: "monospace" } : {}) }}>{v || "—"}</div>
                </div>
              ))}
            </div>
            <div style={{ padding: "3px 10px", display: "flex", gap: "4px", flexWrap: "wrap", background: bg, borderTop: `0.5px solid ${line}` }}>
              {([["Drop", row.drop], ["Grade", row.grade], ["Tipo", row.tipo], ["Linha", row.linha], ["Grupo", row.grupo], ["Subgrupo", row.subgrupo], ["Categoria", row.categoria]] as [string, string][]).map(([l, v]) => v ? (
                <span key={l} style={{ fontSize: "7px", fontWeight: 700, background: white, border: `0.5px solid ${lineDark}`, borderRadius: "3px", padding: "1px 6px", color: navy }}>
                  <span style={{ color: muted, fontWeight: 600, marginRight: "2px" }}>{l}</span>{v}
                </span>
              ) : null)}
            </div>
          </div>

          {/* Desenho — grande, na página 1 */}
          {img && (
            <div style={{ border: `1px solid ${line}`, borderRadius: "6px", overflow: "hidden", marginBottom: "7px", background: white, textAlign: "center" }}>
              <div style={{ background: headerBg, color: white, padding: "4px 10px", fontSize: "6.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", textAlign: "left" }}>Desenho Técnico</div>
              <div style={{ padding: "6px 10px" }}>
                <img src={img} alt="Desenho técnico" style={{ maxHeight: "515px", width: "100%", objectFit: "contain" }} />
              </div>
              {fotosTec.length > 0 && (
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", padding: "4px 10px", borderTop: `0.5px solid ${line}`, background: bg }}>
                  {fotosTec.map(f => (
                    <div key={f.i} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <img src={f.url} alt={`Tecido ${f.nome}`} style={{ width: "32px", height: "32px", objectFit: "cover", borderRadius: "3px", border: `0.5px solid ${lineDark}` }} />
                      <div style={{ textAlign: "left" }}>
                        <div style={{ fontSize: "5.5px", fontWeight: 700, color: muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Tec.{String(f.i + 1).padStart(2, "0")}</div>
                        <div style={{ fontSize: "7px", fontWeight: 700, color: navy }}>{f.nome}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tecidos & Variantes */}
          {tec.length > 0 && (
            <div style={{ marginBottom: "7px" }}>
              <div style={{ background: headerBg, color: white, padding: "4px 10px", borderRadius: "4px 4px 0 0", fontSize: "6.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>Tecidos & Variantes</div>
              <table style={{ ...tbl }}>
                <thead><tr style={{ ...headRow, background: bg }}>
                  <th style={th}>Artigo</th><th style={{ ...th, width: "55px" }}>Forn.</th><th style={{ ...th, width: "75px" }}>Composição</th><th style={{ ...th, textAlign: "right", width: "38px" }}>Preço</th>
                  {Array.from({length: numVars}, (_, i) => { const cor = tec[0]?.cores?.[i]; const pal = cor ? COR_PALETTE[cor] : null; return (<th key={i} style={{ ...th, textAlign: "center", width: "55px" }}><div>Var {String(i + 1).padStart(2, "0")}</div>{cor && <div style={{ marginTop: "3px", display: "inline-block", padding: "1px 5px", borderRadius: "3px", fontSize: "7px", fontWeight: 700, background: pal?.bg || "#eee", color: pal?.text || "#333" }}>{cor}</div>}</th>); })}
                </tr></thead>
                <tbody>{tec.map((t, i) => { const cs = t.cores || []; return (
                  <tr key={i} style={i % 2 ? { background: bg } : {}}>
                    <td style={{ ...td, fontWeight: 700 }}>{t.artigo}</td>
                    <td style={{ ...td, color: muted }}>{t.forn}</td>
                    <td style={{ ...td, fontSize: "7.5px", color: muted }}>{(i === 0 ? (row.composicao || compOf(t.artigo)) : compOf(t.artigo)) || "—"}</td>
                    <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{t.preco > 0 ? `R$ ${t.preco.toFixed(2)}` : "—"}</td>
                    {Array.from({length: numVars}, (_, j) => { const cor = cs[j]; const pal = cor ? COR_PALETTE[cor] : null; return (<td key={j} style={{ ...td, textAlign: "center", padding: "3px 4px" }}>{cor ? <span style={{ display: "inline-block", padding: "2px 5px", borderRadius: "3px", fontSize: "7.5px", fontWeight: 700, background: pal?.bg || "#eee", color: pal?.text || "#333", whiteSpace: "nowrap" }}>{cor}</span> : <span style={{ color: lineDark }}>—</span>}</td>); })}
                  </tr>
                ); })}

                {/* Pantone / Compra / Pedido — linhas DESTA tabela. Antes eram
                    divs de flex logo abaixo dela, presumindo 55px por variante;
                    como a tabela dimensiona as colunas por conta própria, os
                    valores não caíam sob a cor correspondente. */}
                {pantones && (pantones.var01 || pantones.var02 || pantones.var03 || pantones.var04) && (
                  <tr style={{ background: bg }}>
                    <td colSpan={4} style={{ ...td, fontSize: "6.5px", fontWeight: 700, color: light, textTransform: "uppercase", letterSpacing: "0.08em" }}>Pantone</td>
                    {(["var01", "var02", "var03", "var04", "var05", "var06"] as const).slice(0, numVars).map(k => (
                      <td key={k} style={{ ...td, textAlign: "center", fontFamily: "monospace", fontSize: "7px", fontWeight: 700, color: navy, padding: "3px 2px" }}>{(pantones as any)[k] || "—"}</td>
                    ))}
                  </tr>
                )}
                {fichaType === 'producao' && (["qtd", "pedido"] as const).map(campo => (
                  <tr key={campo} style={{ background: "#E8F0FE" }}>
                    <td colSpan={4} style={{ ...td, fontSize: "6.5px", fontWeight: 700, color: accent, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      {campo === "qtd" ? "Qtd. Compra 1" : "Nº Pedido 1"}
                    </td>
                    {Array.from({ length: numVars }, (_, i) => {
                      const cor = tec[0]?.cores?.[i];
                      const vc = cor && vcCompras ? vcCompras[`${row.id}:${cor}`] : null;
                      const v = campo === "qtd"
                        ? (vc?.qtd_compra1 != null && vc?.qtd_compra1 !== "" ? String(Math.round(Number(vc.qtd_compra1))) : "—")
                        : (vc?.pedido1 || "—");
                      return <td key={i} style={{ ...td, textAlign: "center", fontSize: campo === "qtd" ? "8px" : "7px", fontWeight: campo === "qtd" ? 800 : 700, color: navy, fontVariantNumeric: "tabular-nums", padding: "3px 2px" }}>{v}</td>;
                    })}
                  </tr>
                ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Total de aviamentos + Observações: vão na página da Aviamentação,
              junto do que resumem. Ficavam aqui no pé da ficha e transbordavam
              para uma página só deles. Sem aviamentos não há aquela página,
              então o bloco fica aqui mesmo. */}
          {avi.length === 0 && <ResumoAviObs />}
        </div>

        {/* ── Aviamentação ──
             Tudo de aviamento (tabela + Total + galeria) tem de caber numa
             folha só. O gargalo é a largura: com muitas colunas, o padding
             padrao de 8px de cada lado consome ~190px dos 714 uteis e espreme
             "Materia prima"/"Localizacao", que quebram em 3-4 linhas e esticam
             a tabela. Por isso esta tabela usa padding e colunas enxutos, e a
             galeria abaixo dimensiona as fotos conforme a sobra da folha. */}
        {avi.length > 0 && (() => {
          // Densidade conforme a quantidade de itens: fichas grandes apertam as
          // linhas para a tabela inteira (com o Total) continuar numa folha só.
          const denso = avi.length > 26 ? 2 : avi.length > 16 ? 1 : 0;
          const padY = denso === 2 ? "1px" : denso === 1 ? "2px" : "3px";
          const fItem = denso === 2 ? "6.5px" : denso === 1 ? "7.5px" : "8px";
          const fSec = denso === 2 ? "6px" : denso === 1 ? "6.5px" : "7px";
          // A entrelinha herdada (1.5) é o que mais pesa quando um texto quebra
          // em duas linhas — apertá-la rende mais que reduzir o padding.
          const tdAvi: React.CSSProperties = { ...td, padding: `${padY} 4px`, fontSize: denso ? "8px" : "9px", lineHeight: denso ? 1.15 : 1.35 };
          const thAvi: React.CSSProperties = { ...th, padding: `${padY} 4px` };
          const wVar = numVars >= 6 ? 38 : 44;
          const alturaLinha = denso === 2 ? 18 : denso === 1 ? 23 : 31;
          return (
          <div className="print-page" style={pb()}>
            <PageHead title="Aviamentação" />
            <table style={{ ...tbl, tableLayout: "fixed", pageBreakInside: "avoid" }}>
              <thead><tr style={headRow}>
                <th style={{ ...thAvi, textAlign: "center", width: "18px" }}>#</th>
                <th style={{ ...thAvi, width: "58px" }}>Código</th><th style={thAvi}>Matéria prima</th><th style={{ ...thAvi, width: "62px" }}>Fornecedor</th><th style={{ ...thAvi, width: "52px" }}>Cód. forn.</th><th style={{ ...thAvi, textAlign: "center", width: "22px" }}>Qtd</th>
                <th style={{ ...thAvi, textAlign: "right", width: "38px" }}>Valor</th><th style={{ ...thAvi, width: "120px" }}>Localização</th>
                {/* Mesmo cabeçalho de "Tecidos & Variantes": o nº da variante
                    com o chip da cor correspondente logo abaixo. */}
                {Array.from({length: numVars}, (_, i) => {
                  const cor = tec[0]?.cores?.[i];
                  const pal = cor ? COR_PALETTE[cor] : null;
                  return (
                    <th key={i} style={{ ...thAvi, textAlign: "center", width: `${wVar}px` }}>
                      <div>Var {String(i + 1).padStart(2, "0")}</div>
                      {cor && <div style={{ marginTop: "2px", display: "inline-block", padding: "1px 3px", borderRadius: "3px", fontSize: "6px", fontWeight: 700, lineHeight: 1.2, background: pal?.bg || "#eee", color: pal?.text || "#333" }}>{cor}</div>}
                    </th>
                  );
                })}
              </tr></thead>
              <tbody>
                {avi.map((a, i) => (
                  <tr key={i} style={i % 2 ? { background: bg } : {}}>
                    <td style={{ ...tdAvi, textAlign: "center", fontWeight: 700, color: muted }}>{String(i+1).padStart(2,"0")}</td>
                    <td style={{ ...tdAvi, fontFamily: "monospace", fontSize: "8.5px", fontWeight: 800, color: navy }}>{a.cod}</td>
                    <td style={{ ...tdAvi, fontWeight: 700, fontSize: fItem }}>{a.item}</td>
                    <td style={{ ...tdAvi, fontSize: fSec, color: muted }}>{a.fornecedor || "—"}</td>
                    <td style={{ ...tdAvi, fontFamily: "monospace", fontSize: fSec, color: muted }}>{a.codigo_fornecedor || "—"}</td>
                    <td style={{ ...tdAvi, textAlign: "center" }}>{a.qtd}</td>
                    <td style={{ ...tdAvi, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{a.valor > 0 ? a.valor.toFixed(2) : "—"}</td>
                    <td style={{ ...tdAvi, fontSize: fSec, color: muted }}>{a.local || "—"}</td>
                    {(["var01","var02","var03","var04","var05","var06"] as const).slice(0, numVars).map(k => <td key={k} style={{ ...tdAvi, textAlign: "center", fontSize: fSec }}>{a[k] || "—"}</td>)}
                  </tr>
                ))}
              </tbody>
              <tfoot><tr>
                <td colSpan={5} style={{ ...tdAvi, fontWeight: 800, borderTop: `2px solid ${headerBg}`, fontSize: "9px", paddingTop: "5px" }}>Total</td>
                <td style={{ ...tdAvi, textAlign: "right", fontWeight: 800, borderTop: `2px solid ${headerBg}`, fontSize: "9px", fontVariantNumeric: "tabular-nums", paddingTop: "5px" }}>R$ {avT.toFixed(2)}</td>
                <td colSpan={numVars + 1} style={{ ...tdAvi, borderTop: `2px solid ${headerBg}` }} />
              </tr></tfoot>
            </table>

            {/* ── Galeria de imagens dos aviamentos ──
                 A foto encolhe conforme a folha vai enchendo: cada linha da
                 tabela ocupa espaço, então o tamanho sai do que sobra. Assim a
                 galeria nunca empurra a si mesma (nem o Total) para a página
                 seguinte, por mais aviamentos que a ficha tenha. */}
            {(() => {
              // Itens com foto por cor (cores_disponiveis > 1) entram uma vez
              // por cor realmente escolhida nas variantes — não uma vez por
              // item — para não exibir cores do cadastro que a peça não usa.
              const fotos = avi.flatMap((a, i) => fotosParaExibir(a, numVars).map(f => ({ ...f, i, item: a.item, cod: a.cod })));
              if (!fotos.length) return null;
              // Sobra da folha (≈1030px úteis) depois do cabeçalho, da tabela
              // (~31px por linha, medido) e do título da galeria.
              // 20% de folga sobre a altura estimada da tabela: textos longos
              // quebram em duas linhas e a estimativa por si só ficaria curta —
              // é preferível a foto sair menor do que a folha estourar.
              // 62px reservados para o bloco de Total + Observações no rodapé.
              const sobra = 1030 - 63 - (30 + avi.length * alturaLinha * 1.2) - 34 - 62;
              const LEGENDA = 26; // código + nome sob cada foto
              // Escolhe o arranjo (quantas por linha) que permite a maior foto
              // cabendo na sobra: com pouco espaço, espalha mais por linha.
              let lado = 0, porLinha = fotos.length;
              for (let pl = 1; pl <= fotos.length; pl++) {
                const linhas = Math.ceil(fotos.length / pl);
                const cand = Math.min(150, Math.floor(700 / pl) - 8, Math.floor(sobra / linhas) - LEGENDA);
                if (cand > lado) { lado = cand; porLinha = pl; }
              }
              if (lado < 40) return null; // sem espaço util: omite a galeria em vez de estourar a folha
              return (
              <div style={{ marginTop: "12px", pageBreakInside: "avoid" }}>
                <div style={{ background: headerBg, color: "white", fontSize: "8px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", padding: "4px 8px", borderRadius: "4px", marginBottom: "8px" }}>Referência Visual</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {fotos.map(f => (
                    <div key={`${f.i}-${f.key}`} style={{ width: `${lado}px`, textAlign: "center", position: "relative" }}>
                      <div style={{ position: "relative" }}>
                        <span style={{ position: "absolute", top: "-5px", left: "-5px", width: "16px", height: "16px", borderRadius: "50%", background: headerBg, color: "white", fontSize: "7px", fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center", zIndex: 1 }}>{String(f.i+1).padStart(2,"0")}</span>
                        <img src={f.url} alt={f.item} style={{ width: `${lado}px`, height: `${lado}px`, objectFit: "contain", borderRadius: "6px", border: `1px solid ${headerBg}44`, background: "white", display: "block", padding: "10px", boxSizing: "border-box" }}/>
                      </div>
                      <p style={{ fontSize: "8px", fontFamily: "monospace", fontWeight: 800, color: navy, marginTop: "2px", lineHeight: "1.25" }}>{f.cod}</p>
                      <p style={{ fontSize: "6px", color: muted, marginTop: "1px", lineHeight: "1.25", wordBreak: "break-word" }}>{f.item}{f.cor ? ` — ${f.cor}` : ""}</p>
                    </div>
                  ))}
                </div>
              </div>
              );
            })()}

            <ResumoAviObs />
          </div>
          );
        })()}
      </>)}

      {/* ══════════ ESTAMPARIA ══════════ */}
      {sec.estamparia && hasEstamparia && (<>
        <div className="print-page" style={pb()}>
          <PageHead title="Estamparia" sub={`${row.operacao} · ${row.fornecedor} · ${row.estilista}`} />

          {/* Artes FRENTE + COSTAS — 2 colunas compactas */}
          <div style={{ display: "flex", gap: "10px", marginBottom: "10px" }}>
            {artes.filter((a: any) => a.posicao !== "TAGLESS").map((arte: any) => (
              <div key={arte.posicao} style={{ flex: 1, border: `0.5px solid ${line}`, borderRadius: "6px", overflow: "hidden" }}>
                {/* Arte header */}
                <div style={{ background: headerBg, color: white, padding: "4px 8px", fontSize: "7px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", textAlign: "center" }}>Arte {arte.posicao}</div>
                {/* Arte image */}
                <div style={{ padding: "6px", textAlign: "center", background: white, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "80px" }}>
                  {arte.imagem ? <img src={arte.imagem} alt={arte.posicao} style={{ maxHeight: "90px", maxWidth: "100%", objectFit: "contain" }} /> : <span style={{ color: lineDark, fontSize: "8px" }}>Sem imagem</span>}
                </div>
                {/* Largura */}
                {arte.largura && <div style={{ textAlign: "center", fontSize: "8px", fontWeight: 700, color: accent, padding: "3px 0", background: bg, borderTop: `0.5px solid ${line}` }}>{arte.largura}</div>}
                {/* Localização */}
                {(arte.imagemLocal || arte.localizacao) && (
                  <div style={{ background: bg, borderTop: `0.5px solid ${line}`, padding: "5px 8px" }}>
                    <div style={{ fontSize: "6px", fontWeight: 700, color: white, background: headerBg, textTransform: "uppercase", letterSpacing: "0.08em", textAlign: "center", borderRadius: "3px", padding: "2px 6px", marginBottom: "5px" }}>Localização Arte {arte.posicao}</div>
                    {arte.imagemLocal && <div style={{ textAlign: "center", marginBottom: arte.localizacao ? "4px" : 0 }}><img src={arte.imagemLocal} alt={`Localização ${arte.posicao}`} style={{ maxHeight: "70px", maxWidth: "100%", objectFit: "contain" }} /></div>}
                    {arte.localizacao && <div style={{ fontSize: "7.5px", color: muted, lineHeight: 1.4 }}>{arte.localizacao}</div>}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Tagless — layout horizontal compacto */}
          {(() => { const tg = artes.find((a: any) => a.posicao === "TAGLESS"); if (!tg || (!tg.imagem && !tg.localizacao && !tg.imagemLocal && !tg.largura)) return null; return (
            <div style={{ display: "flex", gap: "0", marginBottom: "10px", border: `0.5px solid ${line}`, borderRadius: "6px", overflow: "hidden" }}>
              {/* Arte TAGLESS */}
              <div style={{ flex: "0 0 28%", borderRight: `0.5px solid ${line}` }}>
                <div style={{ background: headerBg, color: white, padding: "4px 8px", fontSize: "7px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", textAlign: "center" }}>Tagless</div>
                <div style={{ padding: "6px", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60px", background: white }}>
                  {tg.imagem ? <img src={tg.imagem} alt="Tagless" style={{ maxHeight: "65px", objectFit: "contain" }} /> : <span style={{ color: lineDark, fontSize: "8px" }}>Sem imagem</span>}
                </div>
                {tg.largura && <div style={{ textAlign: "center", fontSize: "8px", fontWeight: 700, color: accent, padding: "3px 0", background: bg, borderTop: `0.5px solid ${line}` }}>{tg.largura}</div>}
              </div>
              {/* Localização TAGLESS */}
              <div style={{ flex: 1, padding: "5px 8px", background: bg }}>
                <div style={{ fontSize: "6px", fontWeight: 700, color: white, background: headerBg, textTransform: "uppercase", letterSpacing: "0.08em", textAlign: "center", borderRadius: "3px", padding: "2px 6px", marginBottom: "5px" }}>Localização Arte Tagless</div>
                {tg.imagemLocal && <div style={{ textAlign: "center", marginBottom: "4px" }}><img src={tg.imagemLocal} alt="Localização TAGLESS" style={{ maxHeight: "65px", maxWidth: "100%", objectFit: "contain" }} /></div>}
                {tg.localizacao && <div style={{ fontSize: "7.5px", color: muted, lineHeight: 1.4 }}>{tg.localizacao}</div>}
              </div>
            </div>
          ); })()}

          {/* Técnicas */}
          {tecnicas.length > 0 && (
            <div>
              <div style={secTitle}>Técnicas de Estamparia</div>
              <table style={tbl}>
                <thead><tr style={headRow}>
                  <th style={{ ...th, textAlign: "center", width: "26px" }}>#</th>
                  <th style={th}>Técnica</th>
                  {Array.from({length: numVars}, (_, i) => { const cor = tec[0]?.cores?.[i]; const pal = cor ? COR_PALETTE[cor] : null; return (<th key={i} style={{ ...th, textAlign: "center", width: "70px" }}><div>Var {String(i + 1).padStart(2, "0")}</div>{cor && <div style={{ marginTop: "3px", display: "inline-block", padding: "1px 5px", borderRadius: "3px", fontSize: "7px", fontWeight: 700, background: pal?.bg || "#eee", color: pal?.text || "#333" }}>{cor}</div>}</th>); })}
                </tr></thead>
                <tbody>{tecnicas.map((t: any, i: number) => (
                  <tr key={i} style={i % 2 ? { background: bg } : {}}>
                    <td style={{ ...td, textAlign: "center", fontWeight: 800, fontSize: "12px", color: muted }}>{i + 1}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{t.tecnica || "—"}</td>
                    {(["var01","var02","var03","var04","var05","var06"] as const).slice(0, numVars).map(k => <td key={k} style={{ ...td, textAlign: "center", fontSize: "8.5px" }}>{t[k] || "—"}</td>)}
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}

          {estamparia?.observacoes && (
            <div style={{ marginTop: "10px", background: bg, borderRadius: "6px", padding: "10px 14px", border: `0.5px solid ${line}` }}>
              <div style={{ fontSize: "6.5px", fontWeight: 700, color: light, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "3px" }}>Observações</div>
              <div style={{ fontSize: "8.5px", color: muted, whiteSpace: "pre-wrap" }}>{estamparia.observacoes}</div>
            </div>
          )}
        </div>

        {/* Simulações — 2 variantes por página */}
        {(["var01","var02","var03","var04","var05","var06"] as const).slice(0, numVars).reduce<string[][]>((acc, vk, i) => { if (i % 2 === 0) acc.push([vk]); else acc[acc.length - 1].push(vk); return acc; }, []).map((pair, pageIdx) => (
          <div key={pageIdx} className="print-page" style={pb()}>
            <PageHead title={`Simulações e Fotos — Variante${pair.length > 1 ? "s" : ""} ${pair.map((_, vi) => String(pageIdx * 2 + vi + 1).padStart(2, "0")).join(" e ")}`} sub={`${row.operacao} · ${row.fornecedor}`} />
            <div style={{ display: "flex", gap: "14px", height: "calc(100% - 60px)" }}>
              {pair.map((vk, vi) => {
                const sim = sims[vk] || {};
                const corIdx = pageIdx * 2 + vi;
                const corName = tec[0]?.cores?.[corIdx] || "";
                const st = sim.status || "";
                const stColor = st.includes("LIBERADA") ? success : st === "REPROVADA" ? danger : st.includes("AJUSTE") ? warn : muted;
                const pal = corName ? COR_PALETTE[corName] : null;
                return (
                  <div key={vk} style={{ flex: 1, display: "flex", flexDirection: "column", gap: "10px" }}>
                    {/* Variant header */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: bg, borderRadius: "6px", border: `0.5px solid ${line}` }}>
                      <div>
                        <div style={{ fontSize: "11px", fontWeight: 800, color: navy }}>Variante {String(corIdx + 1).padStart(2, "0")}</div>
                        {corName && <div style={{ marginTop: "3px", display: "inline-block", padding: "2px 8px", borderRadius: "4px", fontSize: "8px", fontWeight: 700, background: pal?.bg || "#eee", color: pal?.text || "#333" }}>{corName}</div>}
                      </div>
                      {st && <Badge text={st} color={stColor} />}
                    </div>

                    {/* Simulação */}
                    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                      <div style={{ fontSize: "6.5px", fontWeight: 700, color: light, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "4px" }}>Simulação</div>
                      <div style={{ flex: 1, background: bg, borderRadius: "6px", border: `0.5px solid ${line}`, padding: "8px", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", minHeight: "180px" }}>
                        {sim.imgSim ? <img src={sim.imgSim} alt="Simulação" style={{ maxHeight: "220px", maxWidth: "100%", objectFit: "contain" }} /> : <span style={{ color: lineDark, fontSize: "9px" }}>Sem imagem</span>}
                      </div>
                    </div>

                    {/* Foto */}
                    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                      <div style={{ fontSize: "6.5px", fontWeight: 700, color: light, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "4px" }}>Foto</div>
                      <div style={{ flex: 1, background: bg, borderRadius: "6px", border: `0.5px solid ${line}`, padding: "8px", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", minHeight: "150px" }}>
                        {sim.imgFoto ? <img src={sim.imgFoto} alt="Foto" style={{ maxHeight: "190px", maxWidth: "100%", objectFit: "contain" }} /> : <span style={{ color: lineDark, fontSize: "9px" }}>Sem imagem</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </>)}

      {/* ══════════ LIBERAÇÃO — Foto do produto (frente | costas) ══════════ */}
      {sec.liberacao && (imgFrente || imgCostas) && (
        <div className="print-page" style={pb()}>
          <PageHead title="FOTO DO PRODUTO" sub={statusLib || "Pendente"} bg={modelagemColor} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0 16px", marginBottom: "10px" }}>
            <Field label="Referência" value={row.ref} />
            <Field label="Descrição" value={row.desc} />
            <Field label="Coleção" value={row.colecao} />
            <Field label="Grade" value={row.grade} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            {([["Frente", imgFrente], ["Costas", imgCostas]] as [string, string | null | undefined][]).map(([lbl, url]) => (
              <div key={lbl} style={{ border: `0.5px solid ${line}`, borderRadius: "6px", overflow: "hidden" }}>
                <div style={{ fontSize: "8px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: muted, padding: "5px 8px", borderBottom: `0.5px solid ${line}`, background: bg }}>{lbl}</div>
                <div style={{ height: "360px", display: "flex", alignItems: "center", justifyContent: "center", background: white }}>
                  {url ? <img src={url} alt={lbl} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /> : <span style={{ fontSize: "9px", color: light }}>Sem foto</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════════ LIBERAÇÃO — Pág 1: Tabela de Medidas + Fotos ══════════ */}
      {sec.liberacao && tm && pts.length > 0 && (() => {
        const libTitle = fichaType === 'producao' ? 'TABELA DE PRODUÇÃO' : fichaType === 'mostruario' ? 'TABELA DE MOSTRUÁRIO' : 'TABELA DE DESENVOLVIMENTO';
        const provaTitles = ["PROVA 1", "PROVA 2", "PROVA 3"] as const;
        const provaKeys = ["p1", "p2", "p3"] as const;
        const piColor = (st: string) => {
          if (!st) return muted;
          const s = st.toUpperCase();
          if (s.includes("REPROV")) return danger;
          if (s.includes("RESTR")) return warn;
          if (s.includes("APROV") || s.includes("LIBER")) return success;
          return muted;
        };
        // Prova mais recente com fotos — ordena por data desc; sem data usa última com foto
        const provasComFoto = (["p1","p2","p3"] as const).filter(pk => {
          const pi = provaInfo?.[pk];
          return pi && (pi.fotoFrente || pi.fotoLado || pi.fotoCostas);
        });
        provasComFoto.sort((a, b) => {
          const da = provaInfo?.[a]?.data || ""; const db = provaInfo?.[b]?.data || "";
          if (da && db) return db.localeCompare(da);
          if (da) return -1; if (db) return 1; return 0;
        });
        const latestPhotoProva = provasComFoto[0] || null;
        const modeloFrenteUrl = (latestPhotoProva ? provaInfo?.[latestPhotoProva]?.fotoFrente : null) || imgModelo || null;
        const modeloCostasUrl = (latestPhotoProva ? provaInfo?.[latestPhotoProva]?.fotoCostas : null) || null;
        const latestProvaIdx = latestPhotoProva ? parseInt(latestPhotoProva.slice(1)) : null;
        return (
        <div className="print-page" style={pb()}>
          <PageHead title={libTitle} sub={statusLib || "Pendente"} bg={modelagemColor} />

          {/* Aviso de Restrição */}
          {statusLib === "APROVADO COM RESTRIÇÃO" && (
            <div style={{ background: "#FFFBEB", border: `1px solid ${warn}`, borderRadius: "6px", padding: "8px 14px", marginBottom: "10px" }}>
              <div style={{ fontSize: "8px", fontWeight: 800, color: "#92400E", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                ⚠ ATENÇÃO: SE AS ALTERAÇÕES SOLICITADAS NÃO FOREM FEITAS, A PEÇA PODE SER DEVOLVIDA
              </div>
            </div>
          )}
          {statusLib === "REPROVADO" && (
            <div style={{ background: "#FEF2F2", border: `1px solid ${danger}`, borderRadius: "6px", padding: "8px 14px", marginBottom: "10px" }}>
              <div style={{ fontSize: "8px", fontWeight: 800, color: danger, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                ✗ PEÇA REPROVADA — FAVOR CORRIGIR CONFORME ANOTAÇÕES DE PROVA
              </div>
            </div>
          )}

          {/* Info */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0 16px", marginBottom: "8px" }}>
            <Field label="Referência" value={row.ref} />
            <Field label="Descrição" value={row.desc} />
            <Field label="Operação" value={row.operacao} />
            <Field label="Estilista" value={row.estilista} />
            <Field label="Fornecedor" value={row.fornecedor} />
            <Field label="Drop" value={row.drop} />
            <Field label="Coleção" value={row.colecao} />
            <Field label="Grade" value={row.grade} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "0 16px", marginBottom: "10px", borderTop: `0.5px solid ${line}`, paddingTop: "6px" }}>
            <Field label="Grupo" value={row.grupo} />
            <Field label="Tabela Base" value={tm} />
            <Field label="Padrão" value={gradBase || "—"} />
            <Field label="Tamanho" value={gradBase || "—"} />
            <Field label="Tecido" value={row.tecido} />
            <Field label="Composição" value={compOf(row.tecido)} />
          </div>

          {/* Tabela de Medidas — apenas prova mais recente */}
          {(() => {
            // Prova mais recente com medidas: ordena por data desc; sem data usa última com valor
            const provasComMedida = (["p1","p2","p3"] as const).filter(pk =>
              pts.some((p: any) => pv[p.cod]?.[pk])
            );
            provasComMedida.sort((a, b) => {
              const da = provaInfo?.[a]?.data || ""; const db = provaInfo?.[b]?.data || "";
              if (da && db) return db.localeCompare(da);
              if (da) return -1; if (db) return 1; return 0;
            });
            const latestPk = provasComMedida[0] || "p1";
            const pi = provaInfo?.[latestPk];
            const st = pi?.status || "";
            const col = piColor(st);
            const latestN = latestPk === "p3" ? 3 : latestPk === "p2" ? 2 : 1;
            return (
              <table style={tbl}>
                <thead>
                  <tr>
                    <th style={{ ...th, textAlign: "center", width: "26px" }} rowSpan={2}>Cód</th>
                    <th style={{ ...th }} rowSpan={2}>Descrição</th>
                    <th style={{ ...th, textAlign: "center", width: "40px", fontWeight: 800 }} rowSpan={2}>{gradBase ? `Tab. (${gradBase})` : "Tab."}</th>
                    <th colSpan={2} style={{ ...th, textAlign: "center", background: `${col}18`, borderBottom: `2px solid ${col}`, padding: "3px 4px" }}>
                      <div style={{ fontWeight: 800, color: col, fontSize: "7.5px", letterSpacing: "0.06em" }}>PROVA {latestN}</div>
                      {pi?.tipo && <div style={{ fontSize: "7px", color: col, fontWeight: 700, textTransform: "uppercase" }}>{pi.tipo}</div>}
                      {st && <div style={{ fontSize: "7px", color: col, fontWeight: 600 }}>{st}</div>}
                      {pi?.data && <div style={{ fontSize: "6.5px", color: muted, fontWeight: 500 }}>{pi.data}</div>}
                    </th>
                    <th style={{ ...th, textAlign: "center", width: "42px", fontSize: "7px" }} rowSpan={2}>Tol.</th>
                  </tr>
                  <tr style={headRow}>
                    <th style={{ ...th, textAlign: "center", width: "42px", fontSize: "7px" }}>MED.</th>
                    <th style={{ ...th, textAlign: "center", width: "34px", fontSize: "7px" }}>DIF</th>
                  </tr>
                </thead>
                <tbody>{pts.map((p: any, pi2: number) => {
                  const v = pv[p.cod] || { p1: "", p2: "", p3: "" };
                  const val = v[latestPk];
                  const d = gd(p.tabela, val);
                  const absD = Math.abs(parseFloat(d) || 0);
                  const isOk = d === "0"; const isBad = d && !isOk && absD > 1; const isWarn = d && !isOk && !isBad;
                  return (
                    <tr key={p.cod} style={pi2 % 2 ? { background: bg } : {}}>
                      <td style={{ ...td, textAlign: "center", fontWeight: 800, color: light, fontSize: "7.5px" }}>{p.cod}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{p.desc}</td>
                      <td style={{ ...td, textAlign: "center", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{p.tabela}</td>
                      <td style={{ ...td, textAlign: "center", fontWeight: val ? 700 : 400, fontVariantNumeric: "tabular-nums" }}>{val || "—"}</td>
                      <td style={{ ...td, textAlign: "center", fontSize: "7.5px", fontWeight: 800, fontVariantNumeric: "tabular-nums", color: isOk ? success : isBad ? danger : isWarn ? warn : lineDark }}>{d || "—"}</td>
                      <td style={{ ...td, textAlign: "center", fontSize: "7px", color: light }}>{p.tol}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
            );
          })()}

          {/* Modo de Medir + Modelo lado a lado */}
          {(imgModoMedir || modeloFrenteUrl) && (
            <div style={{ display: "flex", gap: "14px", marginTop: "14px", alignItems: "flex-start" }}>
              {imgModoMedir && (
                <div style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ fontSize: "6.5px", fontWeight: 700, color: light, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "5px" }}>Modo de Medir</div>
                  <img src={imgModoMedir} alt="Modo de Medir" style={{ width: "100%", maxHeight: "320px", objectFit: "contain", border: `0.5px solid ${line}`, borderRadius: "4px" }} />
                </div>
              )}
              {(modeloFrenteUrl || modeloCostasUrl) && (
                <div style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ fontSize: "6.5px", fontWeight: 700, color: light, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "5px" }}>Modelo</div>
                  <div style={{ display: "flex", gap: "6px", justifyContent: "center" }}>
                    {modeloFrenteUrl && <img src={modeloFrenteUrl} alt="Frente" style={{ maxHeight: "320px", maxWidth: "48%", objectFit: "contain", borderRadius: "4px" }} />}
                    {modeloCostasUrl && <img src={modeloCostasUrl} alt="Costas" style={{ maxHeight: "320px", maxWidth: "48%", objectFit: "contain", borderRadius: "4px" }} />}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        );
      })()}

      {/* ══════════ LIBERAÇÃO — Pág 2: Fotos + Comentários da prova mais recente ══════════ */}
      {sec.liberacao && (() => {
        // Filtra provas com conteúdo real, depois ordena pela data mais recente
        const provasComDados = (["p1","p2","p3"] as const).filter(pk => {
          const pi = provaInfo?.[pk];
          const a = an[pk];
          const pilRow = pil[parseInt(pk.slice(1))-1];
          return pi?.fotoFrente || pi?.fotoLado || pi?.fotoCostas || a?.texto || a?.video || pi?.link || pilRow?.num || pilRow?.lacre;
        });
        // Ordena por data desc (mais recente primeiro); sem data, mantém ordem natural
        provasComDados.sort((a, b) => {
          const da = provaInfo?.[a]?.data || "";
          const db = provaInfo?.[b]?.data || "";
          if (da && db) return db.localeCompare(da);
          if (da) return -1;
          if (db) return 1;
          return 0;
        });
        const latestKey = provasComDados[0];
        if (!latestKey) return null;
        const latestN = latestKey === "p3" ? 3 : latestKey === "p2" ? 2 : 1;
        const pi = provaInfo?.[latestKey];
        const a = an[latestKey];
        const pilRow = pil[latestN - 1];
        const piSt = pi?.status || "";
        const piCol = piSt.includes("REPROV") ? danger : piSt.includes("RESTR") ? warn : piSt.includes("APROV") || piSt.includes("LIBER") ? success : muted;
        const fotos = [
          { label: "FRENTE", url: pi?.fotoFrente },
          { label: "LADO", url: pi?.fotoLado },
          { label: "COSTAS", url: pi?.fotoCostas },
        ].filter(f => f.url);
        return (
        <div className="print-page" style={pb()}>
          <PageHead title="COMENTÁRIOS DE PROVA" sub={statusLib || "Pendente"} bg={modelagemColor} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0 16px", marginBottom: "10px" }}>
            <Field label="Referência" value={row.ref} />
            <Field label="Descrição" value={row.desc} />
            <Field label="Estilista" value={row.estilista} />
            <Field label="Fornecedor" value={row.fornecedor} />
          </div>

          {/* Fotos da prova mais recente — primeiro */}
          {fotos.length > 0 && (
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "7px", fontWeight: 800, color: navy, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px", borderBottom: `1px solid ${lineDark}`, paddingBottom: "3px" }}>
                Fotos da Prova {latestN}{pi?.tipo ? ` — ${pi.tipo}` : ""}
              </div>
              <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
                {fotos.map(f => (
                  <div key={f.label} style={{ textAlign: "center", flex: 1 }}>
                    <img src={f.url!} alt={f.label} style={{ width: "100%", maxHeight: "220px", objectFit: "contain", borderRadius: "6px", border: `0.5px solid ${line}` }} />
                    <div style={{ fontSize: "7px", color: muted, marginTop: "4px", fontWeight: 600 }}>{f.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Comentários da prova mais recente */}
          <div style={{ border: `0.5px solid ${line}`, borderRadius: "6px", overflow: "hidden" }}>
            <div style={{ background: `${piCol}18`, borderBottom: `1px solid ${piCol}44`, padding: "6px 12px", display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ fontSize: "8px", fontWeight: 800, color: piCol, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Anotações da Prova {latestN}{pilRow?.num ? ` — ${pilRow.num}` : pi?.tipo ? ` — ${pi.tipo}` : ""}
              </div>
              {piSt && <div style={{ fontSize: "7.5px", color: piCol, fontWeight: 700 }}>— {piSt}</div>}
              {pi?.data && <div style={{ fontSize: "7px", color: muted, marginLeft: "auto" }}>{pi.data}</div>}
            </div>
            <div style={{ padding: "8px 12px" }}>
              {/* Bullets */}
              {a?.texto && (
                <div style={{ marginBottom: "8px" }}>
                  {a.texto.split('\n').filter((l: string) => l.trim()).map((line: string, i: number) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "6px", marginBottom: "3px" }}>
                      <span style={{ color: piCol, fontWeight: 800, fontSize: "10px", lineHeight: "1.6", flexShrink: 0 }}>•</span>
                      <span style={{ fontSize: "8.5px", color: navy, lineHeight: "1.6" }}>{line}</span>
                    </div>
                  ))}
                </div>
              )}
              {(a?.video || pi?.link) && (
                <div style={{ fontSize: "8px", color: accent, marginBottom: "8px" }}>
                  <span style={{ fontWeight: 700, color: muted, marginRight: "4px" }}>LINK DO VÍDEO:</span>
                  {a?.video || pi?.link}
                </div>
              )}
              {/* Nº Lacre / Data de Prova / Status */}
              {pilRow && (pilRow.num || pilRow.lacre || pilRow.prova) && (
                <table style={{ ...tbl, marginTop: 0 }}>
                  <thead><tr style={headRow}>
                    <th style={th}>Tipo</th>
                    <th style={th}>Nº Lacre</th>
                    <th style={th}>Data de Prova</th>
                    <th style={th}>Status</th>
                  </tr></thead>
                  <tbody>
                    <tr>
                      <td style={td}>{pilRow.num || "—"}</td>
                      <td style={td}>{pilRow.lacre || "—"}</td>
                      <td style={td}>{pilRow.prova || "—"}</td>
                      <td style={{ ...td, fontWeight: 700, color: piCol }}>{piSt || "—"}</td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
        );
      })()}

      {/* ══════════ GRADUAÇÃO DE PRODUÇÃO ══════════ */}
      {sec.graduacao && grad.length > 0 && (statusLib === "APROVADO" || statusLib === "APROVADO COM RESTRIÇÃO") && (fichaType === "producao") && (() => {
        const valorGrad = (g: any, t: string) => valorNoTamanho(g, t, tabTamanhos);
        // A base é a medida da TABELA BASE — não a medida aferida na prova. Os
        // demais tamanhos saem dela acumulando as ampliações (que variam por
        // tamanho).
        const getMedidaBase = (g: any): string => valorGrad(g, gradBase);
        const calcRow = (g: any): Record<string, string> => {
          const medida = getMedidaBase(g);
          if (isNaN(tamNum(medida))) {
            const out: Record<string, string> = {};
            gradTamanhos.forEach(t => { out[t] = valorGrad(g, t); });
            return out;
          }
          return calcularDaBase(g, gradTamanhos, gradBase, medida);
        };
        const gradColor = statusLib === "APROVADO COM RESTRIÇÃO" ? warn : success;
        const wTam = gradTamanhos.length > 6 ? "28px" : "34px";
        return (
        <div className="print-page" style={pb()}>
          <PageHead title="GRADUAÇÃO DE PRODUÇÃO" sub={statusLib} bg={gradColor} />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0 16px", marginBottom: "12px" }}>
            <Field label="Referência" value={row.ref} />
            <Field label="Descrição" value={row.desc} />
            <Field label="Fornecedor" value={row.fornecedor} />
            <Field label="Estilista" value={row.estilista} />
            <Field label="Grupo" value={row.grupo} />
            <Field label="Tabela Base" value={row.tab_medidas} />
            <Field label="Grade" value={row.grade} />
            <Field label="Tamanho" value={gradBase || "—"} />
            <Field label="Tecido" value={row.tecido} />
            <Field label="Composição" value={row.composicao} />
            <Field label="Coleção" value={row.colecao} />
            <Field label="Operação" value={row.operacao} />
          </div>

          <table style={tbl}>
            <thead>
              <tr>
                <th style={{ ...th, background: "#1a3a2a", color: white }} colSpan={gradTamanhos.length + 1}>GRADUAÇÃO</th>
                <th style={{ ...th }}>Tolerância</th>
              </tr>
              <tr style={headRow}>
                <th style={th}>Descrição</th>
                {gradTamanhos.map(t => (
                  <th key={t} style={t === gradBase
                    ? { ...th, textAlign: "center", width: wTam, background: "#FEFCE8", color: warn, fontWeight: 800 }
                    : { ...th, textAlign: "center", width: wTam, background: "#e6f4ed", color: success }}>{t}</th>
                ))}
                <th style={{ ...th, textAlign: "center", width: "44px" }}>Tol.</th>
              </tr>
            </thead>
            <tbody>
              {grad.map((g: any, i: number) => {
                const calc = calcRow(g);
                return (
                  <tr key={i} style={i % 2 ? { background: bg } : {}}>
                    <td style={{ ...td, fontWeight: 600 }}>{g.desc}</td>
                    {gradTamanhos.map(t => (
                      t === gradBase ? (
                        <td key={t} style={{ ...td, textAlign: "center", fontWeight: 800, fontVariantNumeric: "tabular-nums", background: "#FEFCE8", color: warn }}>{calc[t] || "—"}</td>
                      ) : (
                        <td key={t} style={{ ...td, textAlign: "center", fontVariantNumeric: "tabular-nums", background: "#f0faf4" }}>{calc[t] || "—"}</td>
                      )
                    ))}
                    <td style={{ ...td, textAlign: "center", fontSize: "8px", color: light }}>{g.tol || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {statusLib === "APROVADO COM RESTRIÇÃO" && (
            <div style={{ marginTop: "10px", background: "#FFF7ED", border: `0.5px solid ${warn}`, borderRadius: "6px", padding: "8px 12px" }}>
              <div style={{ fontSize: "8px", color: warn, fontWeight: 700 }}>ATENÇÃO — Liberado com Restrição</div>
              <div style={{ fontSize: "8px", color: navy, marginTop: "2px" }}>Valores em vermelho excedem a tolerância. Verificar antes de iniciar a produção completa.</div>
            </div>
          )}
        </div>
        );
      })()}

      {/* Watermark footer via CSS */}
      <style>{`
        @media print {
          .print-page { position: relative; padding-bottom: 24px; }
          .print-page::after {
            content: "Austral® · Confidencial";
            position: absolute; bottom: 4px; left: 0; right: 0;
            text-align: center;
            font-size: 6.5px; color: ${lineDark}; letter-spacing: 0.08em;
            font-family: -apple-system, Helvetica, sans-serif;
          }
        }
      `}</style>
    </div>
  );
}

/* ── Shared styles ── */
const secTitle: React.CSSProperties = { fontSize: "10px", fontWeight: 800, color: navy, letterSpacing: "-0.01em", marginBottom: "6px", paddingBottom: "4px", borderBottom: `1.5px solid ${navy}` };
const th: React.CSSProperties = { padding: "5px 8px", textAlign: "left", fontSize: "7px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: light, borderBottom: `1px solid ${lineDark}` };
const td: React.CSSProperties = { padding: "4.5px 8px", borderBottom: `0.5px solid ${line}`, fontSize: "9px", verticalAlign: "middle", color: navy };
const tbl: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };
const headRow: React.CSSProperties = { background: bg };
