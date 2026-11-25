"use client";
import { Fragment, useLayoutEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { cellStatus } from "./LaudoPPModal";
import { CHECKLIST_PP, resultadoCheck, valorCheck, obsKey, type ChecklistPP, type CheckValor, type ItemCheck } from "@/lib/preproducao";

type Ponto = { cod: string; desc: string; tabela: string; tol: string };

type Props = {
  row: any;
  pts: Ponto[];
  gradTamanhos: string[];
  gradBase: string;
  esperados: Record<string, string>[];
  medidas: Record<string, Record<string, string>>;
  statusPP: string;
  imgModoMedir?: string | null;
  comentarios?: string;
  fotos?: string[];
  numeroPedido?: string;
  coresTamanho?: Record<string, string>;
  dataRecebimentoPre?: string;
  dataLiberacao?: string;
  checklist?: ChecklistPP;
  fotoProduto?: string;
  videoUrl?: string;
  itensCheck?: ItemCheck[];     // itens da conferência (fixos + cores do pedido)
  correcao?: number;          // 1, 2… = laudo de correção (pré corrigida)
};

const fmtDataBR = (v?: string) => (v ? v.split("-").reverse().join("/") : "—");

/* ── Design tokens — mesma paleta do FichaPDF ── */
const navy = "#0C1D2E";
const muted = "#64748B";
const light = "#94A3B8";
const line = "#E2E8F0";
const lineDark = "#CBD5E1";
const bg = "#F8FAFC";
const success = "#059669";
const warn = "#D97706";
const danger = "#DC2626";
const white = "#FFFFFF";

const th: React.CSSProperties = { padding: "4px 6px", textAlign: "left", fontSize: "7px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: light, borderBottom: `1px solid ${lineDark}` };
const td: React.CSSProperties = { padding: "3.5px 6px", borderBottom: `0.5px solid ${line}`, fontSize: "9.5px", verticalAlign: "middle", color: navy };
const tbl: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };
const rotulo: React.CSSProperties = { fontSize: "6.5px", fontWeight: 600, color: light, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "2px" };

// Área útil da folha A4 retrato com as margens do @page (12mm × 10mm), em px
// CSS (96 dpi). A folha 1 (dados + conferência + medidas) e a folha 2
// (comentários + fotos) têm de caber cada uma numa página só.
const MM = 96 / 25.4;
const FOLHA_W = 190 * MM;
const FOLHA_H = 273 * MM - 30; // desconta o rodapé "Austral® · Confidencial" e uma folga
const ALTURA_MIDIA = 215;      // modo de medir / foto do produto, lado a lado
const ALTURA_MIDIA_MAX = 380;  // se sobrar folha, crescem até aqui

// Grade de fotos que deixa cada foto o maior possível no espaço livre.
// Fotos de celular: assume 4:3 e mostra a foto inteira (contain).
function melhorGrade(n: number, w: number, h: number, gap = 8) {
  let melhor = { cols: 1, cw: w, ch: h, area: 0 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const cw = (w - gap * (cols - 1)) / cols;
    const ch = (h - gap * (rows - 1)) / rows;
    if (cw <= 0 || ch <= 0) continue;
    const fw = Math.min(cw, ch * 4 / 3), fh = Math.min(ch, cw * 3 / 4);
    if (fw * fh > melhor.area) melhor = { cols, cw, ch, area: fw * fh };
  }
  return melhor;
}

const STATUS_PP_COLOR: Record<string, string> = {
  "LIBERADA": success,
  "LIBERADA COM RESTRIÇÃO": warn,
  "REPROVADA - CORRIGIR": danger,
  "REPROVADA - NEGOCIAR": danger,
};

export default function LaudoPPPDF({ row, pts, gradTamanhos, gradBase, esperados, medidas, statusPP, imgModoMedir, comentarios, fotos = [], numeroPedido, coresTamanho = {}, dataRecebimentoPre, dataLiberacao, correcao = 0, checklist = {}, fotoProduto = "", videoUrl = "", itensCheck = CHECKLIST_PP }: Props) {
  const temCheck = itensCheck.some(i => [i.key, ...(i.sub || []).map(s => s.key)].some(k => valorCheck(checklist, k)));
  const Marca = ({ v }: { v: CheckValor | "" | undefined }) => (
    <span style={{ fontWeight: 700, color: v === "ok" ? success : v === "nok" ? danger : light }}>
      {v === "ok" ? "✓ Correto" : v === "nok" ? "✗ Incorreto" : "—"}
    </span>
  );
  const headerBg = STATUS_PP_COLOR[statusPP] || "#4464AF";
  // Colunas de tamanho só com a largura dos números: sobra espaço para o
  // nome do ponto não quebrar em duas linhas (cada quebra rouba altura da folha).
  const tdNum: React.CSSProperties = { ...td, textAlign: "center", fontVariantNumeric: "tabular-nums", padding: "3.5px 3px", whiteSpace: "nowrap" };
  const bulletsList = (comentarios || "").split("\n").map(s => s.trim()).filter(Boolean);
  const temNotas = bulletsList.length > 0 || fotos.length > 0;
  const temCores = Object.keys(coresTamanho).length > 0;

  // ── Encaixe automático em uma folha ──
  // Folha 1: monta no tamanho "confortável"; se passar da altura da A4,
  // reduz (zoom) só o necessário — e alarga na mesma proporção, para o
  // conteúdo continuar ocupando a largura toda da folha.
  // Folha 2: mede o título + comentários e dá às fotos o resto da folha.
  // As alturas de imagem são fixas, então a medida não depende de a foto já
  // ter carregado.
  const folha1Ref = useRef<HTMLDivElement>(null);
  const notasRef = useRef<HTMLDivElement>(null);
  const [zoom1, setZoom1] = useState(1);
  const [alturaFotos, setAlturaFotos] = useState(FOLHA_H - 60);
  useLayoutEffect(() => {
    const el = folha1Ref.current;
    if (el) {
      // Altura visível com zoom z (largura alargada na mesma proporção).
      el.style.zoom = "1";
      const midias = Array.from(el.querySelectorAll<HTMLElement>("[data-midia]"));
      midias.forEach(m => { m.style.height = `${ALTURA_MIDIA}px`; });
      const alturaCom = (z: number) => { el.style.width = `${FOLHA_W / z}px`; return el.scrollHeight * z; };
      // Maior zoom que cabe: alargar reduz a altura, então busca binária.
      let z = 1;
      const h1 = alturaCom(1);
      if (h1 > FOLHA_H) {
        let lo = 0.5, hi = 1;
        // -12: com zoom o navegador arredonda as linhas para cima; folga contra isso.
        for (let i = 0; i < 10; i++) { const mid = (lo + hi) / 2; if (alturaCom(mid) <= FOLHA_H - 12) lo = mid; else hi = mid; }
        z = lo;
      } else if (midias.length) {
        // Sobrou folha: aumenta o modo de medir / foto do produto até preencher.
        const extra = Math.min(ALTURA_MIDIA_MAX - ALTURA_MIDIA, Math.floor(FOLHA_H - h1));
        midias.forEach(m => { m.style.height = `${ALTURA_MIDIA + extra}px`; });
        el.style.width = `${FOLHA_W}px`;
      }
      // Aplica direto: se o zoom calculado for igual ao anterior, o React não
      // re-renderiza e o elemento ficaria com o zoom 1 da medição.
      el.style.zoom = String(z);
      el.style.width = `${FOLHA_W / z}px`;
      setZoom1(z);
    }
    if (notasRef.current) setAlturaFotos(Math.max(150, FOLHA_H - notasRef.current.offsetHeight - 12));
  }, [pts, gradTamanhos, itensCheck, checklist, comentarios, fotos.length, fotoProduto, videoUrl, imgModoMedir, coresTamanho]);
  // Ao reduzir, a 2ª passada (largura maior → menos quebra de linha) pode
  // sobrar espaço, nunca faltar — então uma medida basta.
  const grade = melhorGrade(fotos.length, FOLHA_W, alturaFotos);

  const Field = ({ label, value }: { label: string; value: string }) => (
    <div style={{ padding: "3px 0", borderBottom: `0.5px solid ${line}` }}>
      <div style={{ ...rotulo, marginBottom: "0" }}>{label}</div>
      <div style={{ fontSize: "9.5px", fontWeight: 600, color: navy, lineHeight: 1.3 }}>{value || "—"}</div>
    </div>
  );

  return (
    <div className="print-ficha" style={{ fontFamily: "'Inter', -apple-system, 'Helvetica Neue', Arial, sans-serif", fontSize: "9px", color: navy, lineHeight: 1.4 }}>
      <div className="print-page" ref={folha1Ref} style={{ width: `${FOLHA_W / zoom1}px`, zoom: zoom1 }}>
        <div style={{ background: headerBg, color: white, borderRadius: "4px", padding: "7px 12px", marginBottom: "8px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
          <div>
            <div style={{ fontSize: "6.5px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", opacity: 0.6, marginBottom: "1px" }}>Austral®</div>
            <div style={{ fontSize: "16px", fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.1 }}>LAUDO DE PRÉ-PRODUÇÃO</div>
          </div>
          {statusPP && (
            <div style={{ fontSize: "15px", fontWeight: 800, letterSpacing: "-0.01em", background: "rgba(255,255,255,0.2)", padding: "5px 14px", borderRadius: "5px" }}>
              {statusPP}
            </div>
          )}
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "8px", opacity: 0.7, lineHeight: 1.6 }}>Coleção <strong style={{ opacity: 1 }}>{row.colecao}</strong></div>
            <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "-0.01em" }}>{row.ref}{numeroPedido ? ` · Pedido ${numeroPedido}` : ""}{correcao ? ` · Correção${correcao > 1 ? ` ${correcao}` : ""}` : ""}</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "0 12px", marginBottom: "8px" }}>
          <Field label="Referência" value={row.ref} />
          <Field label="Descrição" value={row.desc} />
          <Field label="Fornecedor" value={row.fornecedor} />
          <Field label="Grade" value={row.grade} />
          <Field label="Tabela de medidas" value={row.tab_medidas} />
          <Field label="Tamanho base" value={gradBase} />
          <Field label="Grupo" value={row.grupo} />
          <Field label="Estilista" value={row.estilista} />
          <Field label="Número do pedido" value={numeroPedido || ""} />
          <Field label="Data receb. da pré" value={fmtDataBR(dataRecebimentoPre)} />
          <Field label="Data de liberação" value={fmtDataBR(dataLiberacao)} />
        </div>

        {temCheck && (
          <div style={{ marginBottom: "8px" }}>
            <div style={rotulo}>Conferência</div>
            <table style={tbl}>
              <tbody>
                {itensCheck.map(item => (
                  <tr key={item.key}>
                    <td style={{ ...td, fontWeight: 600, width: "32%" }}>{item.label}</td>
                    <td style={{ ...td, width: "18%" }}><Marca v={resultadoCheck(item, checklist)} /></td>
                    <td style={{ ...td, color: muted, fontSize: "8px" }}>
                      {item.sub?.map((s, i) => (
                        <span key={s.key}>{i > 0 && " · "}{s.label}: <Marca v={valorCheck(checklist, s.key)} /></span>
                      ))}
                      {/* O que está incorreto (item e subitens) */}
                      {[{ key: item.key, label: "" }, ...(item.sub || [])]
                        .filter(s => valorCheck(checklist, s.key) === "nok" && checklist[obsKey(s.key)])
                        .map(s => (
                          <div key={`obs-${s.key}`} style={{ color: danger, fontSize: "8px", marginTop: "1px" }}>
                            {s.label ? `${s.label}: ` : ""}{checklist[obsKey(s.key)]}
                          </div>
                        ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Modo de medir e foto do produto lado a lado (economiza folha);
            o QR do vídeo, se houver, numa coluna estreita no fim. */}
        {(imgModoMedir || fotoProduto || videoUrl) && (
          <div style={{ display: "flex", gap: "8px", marginBottom: "8px", alignItems: "stretch" }}>
            {imgModoMedir && (
              <div style={{ flex: 1.3, minWidth: 0 }}>
                <div style={rotulo}>Modo de medir</div>
                <div data-midia style={{ height: ALTURA_MIDIA, border: `0.5px solid ${line}`, borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  <img src={imgModoMedir} alt="Modo de medir" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                </div>
              </div>
            )}
            {fotoProduto && (
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={rotulo}>Foto do produto</div>
                <div data-midia style={{ height: ALTURA_MIDIA, border: `0.5px solid ${line}`, borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  <img src={fotoProduto} alt="Foto do produto" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                </div>
              </div>
            )}
            {videoUrl && (
              <div style={{ width: "96px", flexShrink: 0 }}>
                <div style={rotulo}>Vídeo do laudo</div>
                {/* QR: o laudo vai impresso; aponta o celular e abre o vídeo. */}
                <a href={videoUrl}><QRCodeSVG value={videoUrl} size={92} level="L" marginSize={1} /></a>
                <div style={{ fontSize: "7px", color: muted, marginTop: "2px", lineHeight: 1.3 }}>Aponte a câmera do celular para abrir o vídeo</div>
              </div>
            )}
          </div>
        )}

        {pts.length === 0 ? (
          <p style={{ fontSize: "9px", color: muted }}>Nenhum ponto de medida cadastrado para esta referência.</p>
        ) : (
          <table style={tbl}>
            <thead>
              <tr>
                <th style={th} rowSpan={temCores ? 3 : 2}>Ponto</th>
                {gradTamanhos.map(t => (
                  <th key={t} style={{ ...th, textAlign: "center", padding: "4px 3px", background: t === gradBase ? "#FEFCE8" : "#eef4fb", color: t === gradBase ? warn : muted }} colSpan={2}>{t}{t === gradBase ? " (base)" : ""}</th>
                ))}
                <th style={{ ...th, textAlign: "center", width: "38px" }} rowSpan={temCores ? 3 : 2}>Tol.</th>
              </tr>
              <tr>
                {gradTamanhos.map(t => (
                  <Fragment key={t}>
                    <th style={{ ...th, textAlign: "center", fontSize: "6px", padding: "3px 2px" }}>Aprov.</th>
                    <th style={{ ...th, textAlign: "center", fontSize: "6px", padding: "3px 2px" }}>Medido</th>
                  </Fragment>
                ))}
              </tr>
              {temCores && (
                <tr>
                  {gradTamanhos.map(t => (
                    <th key={t} colSpan={2} style={{ ...th, textAlign: "center", fontSize: "6px", fontWeight: 600, color: navy, background: "#F8FAFC", padding: "3px 2px", textTransform: "none", letterSpacing: 0 }}>
                      {coresTamanho[t] ? `Cor: ${coresTamanho[t]}` : "—"}
                    </th>
                  ))}
                </tr>
              )}
            </thead>
            <tbody>
              {pts.map((pt, i) => (
                <tr key={pt.cod} style={i % 2 ? { background: bg } : {}}>
                  <td style={{ ...td, fontWeight: 600 }}>
                    {pt.cod} <span style={{ color: light, fontWeight: 400 }}>— {pt.desc}</span>
                  </td>
                  {gradTamanhos.map(t => {
                    const esperado = esperados[i]?.[t] || "";
                    const medido = medidas[pt.cod]?.[t] || "";
                    const st = cellStatus(esperado, medido, pt.tol);
                    const medidoStyle: React.CSSProperties =
                      st === "acima" ? { color: danger, fontWeight: 800, background: "#FEF2F2" } :
                      st === "abaixo" ? { color: warn, fontWeight: 800, background: "#FFF7ED" } :
                      st === "ok" ? { color: success, fontWeight: 700 } : { color: light };
                    return (
                      <Fragment key={t}>
                        <td style={tdNum}>{esperado || "—"}</td>
                        <td style={{ ...tdNum, ...medidoStyle }}>{medido || "—"}</td>
                      </Fragment>
                    );
                  })}
                  <td style={{ ...td, textAlign: "center", fontSize: "8px", color: light }}>{pt.tol || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div style={{ marginTop: "6px", display: "flex", gap: "14px", fontSize: "7.5px", color: muted }}>
          <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: danger, marginRight: 4 }} />Acima da tolerância</span>
          <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: warn, marginRight: 4 }} />Abaixo da tolerância</span>
          <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: success, marginRight: 4 }} />Dentro da tolerância</span>
        </div>
      </div>

      {temNotas && (
        <div className="print-page" style={{ pageBreakBefore: "always", width: `${FOLHA_W}px` }}>
          <div ref={notasRef}>
            <div style={{ fontSize: "10px", fontWeight: 800, color: navy, letterSpacing: "-0.01em", marginBottom: "8px", paddingBottom: "4px", borderBottom: `1.5px solid ${navy}` }}>
              Comentários e fotos — {row.ref}{numeroPedido ? ` · Pedido ${numeroPedido}` : ""}{correcao ? ` · Correção${correcao > 1 ? ` ${correcao}` : ""}` : ""}
            </div>

            {bulletsList.length > 0 && (
              <ul style={{ margin: "0 0 10px", padding: 0, listStyle: "none" }}>
                {bulletsList.map((b, i) => (
                  <li key={i} style={{ display: "flex", gap: "6px", fontSize: "10px", color: navy, marginBottom: "3px" }}>
                    <span style={{ color: light }}>•</span>{b}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Fotos o maior possível, preenchendo o resto da folha (sem 3ª página) */}
          {fotos.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${grade.cols}, ${grade.cw}px)`, gap: "8px" }}>
              {fotos.map((url, i) => (
                <div key={i} style={{ width: grade.cw, height: grade.ch, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  <img src={url} alt={`Foto ${i + 1} do laudo`} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", border: `0.5px solid ${line}`, borderRadius: "4px" }} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
