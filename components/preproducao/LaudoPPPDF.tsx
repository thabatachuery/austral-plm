"use client";
import { Fragment } from "react";
import { QRCodeSVG } from "qrcode.react";
import { cellStatus } from "./LaudoPPModal";
import { CHECKLIST_PP, resultadoCheck, valorCheck, obsKey, type ChecklistPP, type CheckValor } from "@/lib/preproducao";

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

const th: React.CSSProperties = { padding: "5px 6px", textAlign: "left", fontSize: "7px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: light, borderBottom: `1px solid ${lineDark}` };
const td: React.CSSProperties = { padding: "4.5px 6px", borderBottom: `0.5px solid ${line}`, fontSize: "9px", verticalAlign: "middle", color: navy };
const tbl: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };

const STATUS_PP_COLOR: Record<string, string> = {
  "LIBERADA": success,
  "LIBERADA COM RESTRIÇÃO": warn,
  "REPROVADA - CORRIGIR": danger,
  "REPROVADA - NEGOCIAR": danger,
};

export default function LaudoPPPDF({ row, pts, gradTamanhos, gradBase, esperados, medidas, statusPP, imgModoMedir, comentarios, fotos = [], numeroPedido, coresTamanho = {}, dataRecebimentoPre, dataLiberacao, correcao = 0, checklist = {}, fotoProduto = "", videoUrl = "" }: Props) {
  const temCheck = CHECKLIST_PP.some(i => [i.key, ...(i.sub || []).map(s => s.key)].some(k => valorCheck(checklist, k)));
  const Marca = ({ v }: { v: CheckValor | "" | undefined }) => (
    <span style={{ fontWeight: 700, color: v === "ok" ? success : v === "nok" ? danger : light }}>
      {v === "ok" ? "✓ Correto" : v === "nok" ? "✗ Incorreto" : "—"}
    </span>
  );
  const headerBg = STATUS_PP_COLOR[statusPP] || "#4464AF";
  const wTam = gradTamanhos.length > 5 ? "42px" : "52px";
  const bulletsList = (comentarios || "").split("\n").map(s => s.trim()).filter(Boolean);
  const temNotas = bulletsList.length > 0 || fotos.length > 0;
  const temCores = Object.keys(coresTamanho).length > 0;

  const Field = ({ label, value }: { label: string; value: string }) => (
    <div style={{ padding: "6px 0", borderBottom: `0.5px solid ${line}` }}>
      <div style={{ fontSize: "6.5px", fontWeight: 600, color: light, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "1px" }}>{label}</div>
      <div style={{ fontSize: "9.5px", fontWeight: 600, color: navy }}>{value || "—"}</div>
    </div>
  );

  return (
    <div className="print-ficha" style={{ fontFamily: "'Inter', -apple-system, 'Helvetica Neue', Arial, sans-serif", fontSize: "9px", color: navy, lineHeight: 1.5 }}>
      <div className="print-page">
        <div style={{ background: headerBg, color: white, borderRadius: "4px", padding: "10px 14px", marginBottom: "14px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
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

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0 16px", marginBottom: "12px" }}>
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

        {fotoProduto && (
          <div style={{ marginBottom: "12px" }}>
            <div style={{ fontSize: "6.5px", fontWeight: 600, color: light, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "3px" }}>Foto do produto</div>
            <img src={fotoProduto} alt="Foto do produto" style={{ maxWidth: "100%", maxHeight: "170px", objectFit: "contain", border: `0.5px solid ${line}`, borderRadius: "4px" }} />
          </div>
        )}

        {videoUrl && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px", pageBreakInside: "avoid" }}>
            {/* QR: o laudo vai impresso; aponta o celular e abre o vídeo. */}
            <QRCodeSVG value={videoUrl} size={92} level="L" marginSize={1} style={{ flexShrink: 0 }} />
            <div style={{ fontSize: "8px", wordBreak: "break-all", minWidth: 0 }}>
              <span style={{ display: "block", fontWeight: 700, color: muted, marginBottom: "2px" }}>VÍDEO DO LAUDO:</span>
              <a href={videoUrl} style={{ color: navy, textDecoration: "underline" }}>{videoUrl}</a>
            </div>
          </div>
        )}

        {temCheck && (
          <div style={{ marginBottom: "12px" }}>
            <div style={{ fontSize: "6.5px", fontWeight: 600, color: light, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "3px" }}>Conferência</div>
            <table style={tbl}>
              <tbody>
                {CHECKLIST_PP.map(item => (
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

        {imgModoMedir && (
          <div style={{ marginBottom: "12px" }}>
            <div style={{ fontSize: "6.5px", fontWeight: 600, color: light, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "3px" }}>Modo de Medir</div>
            <img src={imgModoMedir} alt="Modo de Medir" style={{ maxWidth: "100%", maxHeight: "220px", objectFit: "contain", border: `0.5px solid ${line}`, borderRadius: "4px" }} />
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
                  <th key={t} style={{ ...th, textAlign: "center", width: wTam, background: t === gradBase ? "#FEFCE8" : "#eef4fb", color: t === gradBase ? warn : muted }} colSpan={2}>{t}{t === gradBase ? " (base)" : ""}</th>
                ))}
                <th style={{ ...th, textAlign: "center", width: "38px" }} rowSpan={temCores ? 3 : 2}>Tol.</th>
              </tr>
              <tr>
                {gradTamanhos.map(t => (
                  <Fragment key={t}>
                    <th style={{ ...th, textAlign: "center", fontSize: "6px" }}>Aprov.</th>
                    <th style={{ ...th, textAlign: "center", fontSize: "6px" }}>Medido</th>
                  </Fragment>
                ))}
              </tr>
              {temCores && (
                <tr>
                  {gradTamanhos.map(t => (
                    <th key={t} colSpan={2} style={{ ...th, textAlign: "center", fontSize: "6px", fontWeight: 600, color: navy, background: "#F8FAFC" }}>
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
                        <td style={{ ...td, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{esperado || "—"}</td>
                        <td style={{ ...td, textAlign: "center", fontVariantNumeric: "tabular-nums", ...medidoStyle }}>{medido || "—"}</td>
                      </Fragment>
                    );
                  })}
                  <td style={{ ...td, textAlign: "center", fontSize: "8px", color: light }}>{pt.tol || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div style={{ marginTop: "10px", display: "flex", gap: "14px", fontSize: "7.5px", color: muted }}>
          <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: danger, marginRight: 4 }} />Acima da tolerância</span>
          <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: warn, marginRight: 4 }} />Abaixo da tolerância</span>
          <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: success, marginRight: 4 }} />Dentro da tolerância</span>
        </div>
      </div>

      {temNotas && (
        <div className="print-page" style={{ pageBreakBefore: "always" }}>
          <div style={{ fontSize: "10px", fontWeight: 800, color: navy, letterSpacing: "-0.01em", marginBottom: "8px", paddingBottom: "4px", borderBottom: `1.5px solid ${navy}` }}>Comentários e fotos — {row.ref}</div>

          {bulletsList.length > 0 && (
            <ul style={{ margin: "0 0 14px", padding: 0, listStyle: "none" }}>
              {bulletsList.map((b, i) => (
                <li key={i} style={{ display: "flex", gap: "6px", fontSize: "9px", color: navy, marginBottom: "4px" }}>
                  <span style={{ color: light }}>•</span>{b}
                </li>
              ))}
            </ul>
          )}

          {fotos.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {fotos.map((url, i) => (
                <img key={i} src={url} alt={`Foto ${i + 1} do laudo`} style={{ width: "140px", height: "140px", objectFit: "cover", border: `0.5px solid ${line}`, borderRadius: "4px" }} />
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
