// Calendário do PLM = espelho da planilha "Calendário 2026.xlsx" do SharePoint
// (Produto › 0 - CALENDÁRIOS › 2026). A planilha é a fonte: o PLM só lê.
//
// Formato da planilha: uma linha por tarefa (Tarefa, Coleção, Responsável,
// Status) e uma coluna por semana ("Semana 20/01 até 24/01", "13/10 até
// 17/10"...), com o texto do que acontece naquela semana. Células mescladas
// cobrem várias semanas e a cor de fundo vem da própria planilha.
//
// Roda no navegador (botão "Atualizar com o Excel") e no servidor (leitura
// automática pelo Microsoft Graph).

import * as XLSX from "xlsx";

export type SemanaPlanilha = { label: string; ini: string; fim: string };
export type CelulaPlanilha = { col: number; span: number; texto: string; cor: string | null };
export type LinhaPlanilha = { id: number; tarefa: string; colecao: string; responsavel: string; status: string; celulas: CelulaPlanilha[] };
export type CalendarioPlanilha = { aba: string; semanas: SemanaPlanilha[]; linhas: LinhaPlanilha[]; lidoEm: string; origem?: "sharepoint" | "upload"; enviadoPor?: string; arquivo?: string };

const norm = (s: any) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();
const txt = (c: any) => (c == null ? "" : String(c.w ?? c.v ?? "").trim());
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

// Cores do tema padrão do Office (quando a célula usa cor do tema em vez de RGB).
const TEMA = ["FFFFFF", "000000", "E7E6E6", "44546A", "4472C4", "ED7D31", "A5A5A5", "FFC000", "5B9BD5", "70AD47"];
function aplicaTint(hex: string, tint: number): string {
  const n = parseInt(hex, 16); let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = (c: number) => Math.round(tint < 0 ? c * (1 + tint) : c + (255 - c) * tint);
  r = f(r); g = f(g); b = f(b);
  return [r, g, b].map(x => x.toString(16).padStart(2, "0")).join("").toUpperCase();
}
function corDaCelula(c: any): string | null {
  const s = c?.s; if (!s || (s.patternType && s.patternType === "none")) return null;
  const fg = s.fgColor || s.bgColor; if (!fg) return null;
  let hex: string | null = null;
  if (fg.rgb) hex = String(fg.rgb).slice(-6).toUpperCase();
  else if (typeof fg.theme === "number" && TEMA[fg.theme]) hex = fg.tint ? aplicaTint(TEMA[fg.theme], fg.tint) : TEMA[fg.theme];
  if (!hex || hex === "FFFFFF" || !/^[0-9A-F]{6}$/.test(hex)) return null;
  return "#" + hex;
}

// "Semana 20/01 até 24/01", "29/12 até 02/01/2026", "08/12 até 12/dez"
const MES_TXT: Record<string, number> = { JAN: 1, FEV: 2, MAR: 3, ABR: 4, MAI: 5, JUN: 6, JUL: 7, AGO: 8, SET: 9, OUT: 10, NOV: 11, DEZ: 12 };
function lerSemana(label: string): { d1: number; m1: number; d2: number; m2: number; ano2: number | null } | null {
  const l = norm(label).replace(/^SEMANA\s+/, "");
  const m = l.match(/(\d{1,2})\/(\d{1,2})\s*(?:ATE|A|-)\s*(\d{1,2})\/(\d{1,2}|[A-Z]{3})(?:\/(\d{2,4}))?/);
  if (!m) return null;
  const m2 = /^\d+$/.test(m[4]) ? Number(m[4]) : MES_TXT[m[4]];
  if (!m2) return null;
  const ano2 = m[5] ? (m[5].length === 2 ? 2000 + Number(m[5]) : Number(m[5])) : null;
  return { d1: Number(m[1]), m1: Number(m[2]), d2: Number(m[3]), m2, ano2 };
}

// As semanas vêm em sequência e o ano só aparece de vez em quando
// ("29/12 até 02/01/2026"). O ano de cada coluna sai das viradas de ano
// (mês que volta para trás), ancorado no primeiro ano escrito.
function datarSemanas(labels: string[], anoPadrao: number): (SemanaPlanilha | null)[] {
  const lidas = labels.map(lerSemana);
  const viradas: number[] = []; let v = 0, ultimoMes = 0;
  lidas.forEach(s => { if (s) { if (ultimoMes && s.m1 < ultimoMes) v++; ultimoMes = s.m1; } viradas.push(v); });
  let base = anoPadrao - (viradas[viradas.length - 1] || 0);
  const ancora = lidas.findIndex(s => s?.ano2);
  if (ancora >= 0) { const s = lidas[ancora]!; base = s.ano2! - viradas[ancora] - (s.m2 < s.m1 ? 1 : 0); }
  return lidas.map((s, i) => {
    if (!s) return null;
    const y1 = base + viradas[i]; const y2 = s.m2 < s.m1 ? y1 + 1 : y1;
    return { label: labels[i], ini: iso(y1, s.m1, s.d1), fim: iso(y2, s.m2, s.d2) };
  });
}

export function lerCalendarioPlanilha(buf: ArrayBuffer, anoPadrao = new Date().getFullYear()): CalendarioPlanilha {
  const wb = XLSX.read(buf, { type: "array", cellStyles: true });
  // Primeira aba visível que tem o cabeçalho "Tarefa" (a planilha guarda uma aba antiga oculta).
  const visiveis = wb.SheetNames.filter((_, i) => !(wb.Workbook?.Sheets?.[i]?.Hidden));
  let aba = "", ws: XLSX.WorkSheet | null = null, linhaCab = -1;
  for (const nome of [...visiveis, ...wb.SheetNames]) {
    const w = wb.Sheets[nome]; if (!w?.["!ref"]) continue;
    const r = XLSX.utils.decode_range(w["!ref"]);
    for (let R = r.s.r; R <= Math.min(r.e.r, r.s.r + 15); R++) {
      if (norm(txt(w[XLSX.utils.encode_cell({ r: R, c: r.s.c })])) === "TAREFA") { aba = nome; ws = w; linhaCab = R; break; }
    }
    if (ws) break;
  }
  if (!ws) throw new Error("Não encontrei a aba com o cabeçalho “Tarefa” na planilha.");

  const range = XLSX.utils.decode_range(ws["!ref"]!);
  const cab: string[] = [];
  for (let C = range.s.c; C <= range.e.c; C++) cab.push(txt(ws[XLSX.utils.encode_cell({ r: linhaCab, c: C })]));
  const idx = (...nomes: string[]) => cab.findIndex(h => nomes.includes(norm(h)));
  const cTarefa = idx("TAREFA"), cColecao = idx("COLECAO"), cResp = idx("RESPONSAVEL"), cStatus = idx("STATUS");
  const primeiraSemana = Math.max(cTarefa, cColecao, cResp, cStatus) + 1;
  const datas = datarSemanas(cab.slice(primeiraSemana), anoPadrao);
  // mapa coluna da planilha -> índice da semana no PLM
  const semanas: SemanaPlanilha[] = []; const colParaSemana: Record<number, number> = {};
  datas.forEach((s, i) => { if (s) { colParaSemana[range.s.c + primeiraSemana + i] = semanas.length; semanas.push(s); } });

  // Mesclas: a célula de cima/esquerda leva o texto e cobre as semanas seguintes.
  const merges = (ws["!merges"] || []).filter(m => m.s.r === m.e.r);
  const mescla = (r: number, c: number) => merges.find(m => m.s.r === r && m.s.c === c);
  const linhasOcultas = ws["!rows"] || [];

  const linhas: LinhaPlanilha[] = [];
  for (let R = linhaCab + 1; R <= range.e.r; R++) {
    if (linhasOcultas[R]?.hidden) continue;
    const get = (c: number) => (c < 0 ? "" : txt(ws![XLSX.utils.encode_cell({ r: R, c: range.s.c + c })]));
    const tarefa = get(cTarefa);
    const celulas: CelulaPlanilha[] = [];
    for (const [colStr, sIdx] of Object.entries(colParaSemana)) {
      const col = Number(colStr);
      const cell = ws[XLSX.utils.encode_cell({ r: R, c: col })];
      const texto = txt(cell); const cor = corDaCelula(cell);
      if (!texto && !cor) continue;
      const m = mescla(R, col);
      const span = m ? Math.max(1, Object.keys(colParaSemana).filter(k => Number(k) >= m.s.c && Number(k) <= m.e.c).length) : 1;
      celulas.push({ col: sIdx, span, texto, cor });
    }
    if (!tarefa && !celulas.length) continue;
    linhas.push({ id: R + 1, tarefa, colecao: get(cColecao), responsavel: get(cResp), status: get(cStatus).toUpperCase(), celulas });
  }
  return { aba, semanas, linhas, lidoEm: new Date().toISOString() };
}

