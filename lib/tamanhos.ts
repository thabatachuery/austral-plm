// Tamanhos das tabelas de medidas.
//
// Uma tabela declara sua própria lista de tamanhos (ex. 38..48 com base 42, ou
// PP..GG com base M). O produto tem uma GRADE (ex. "PP AO GG", "XPP AO GG"),
// que define quais desses tamanhos aparecem na graduação da ficha.
//
// Quando a grade inclui um tamanho de ponta que a tabela não define (o caso do
// XPP: as tabelas oficiais de letra vão de PP a GG, mas existem produtos na
// grade XPP AO GG), o valor é derivado extrapolando o passo da ponta.

import { normGrade } from "./etiquetas-tamanho";

export const SEQ_LETRAS = ["XPP", "PP", "P", "M", "G", "GG", "XGG"];

export type LinhaGrad = {
  desc: string;
  valores: Record<string, string>;
  ampliacoes: Record<string, string>;
  tol: string;
};

// "39" | "45,5" | "+2,5" -> número (ou NaN)
export function num(v: any): number {
  return parseFloat(String(v ?? "").replace(",", ".").replace(/^\+/, ""));
}

// 45.5 -> "45,5" | 39 -> "39"
export function fmt(n: number): string {
  if (!isFinite(n)) return "";
  const s = n % 1 === 0 ? String(n) : n.toFixed(1);
  return s.replace(".", ",");
}

// Grades numéricas de calçado (tamanho a tamanho, não de 2 em 2), com o
// tamanho base de cada uma. Chave já normalizada ("38 AO 44" -> "38-44").
export const GRADES_CALCADO: Record<string, { base: string }> = {
  "38-44": { base: "41" },
  "35-45": { base: "40" },
};

// Expande a grade na lista ordenada de tamanhos que ela cobre.
// "PP AO GG" -> [PP,P,M,G,GG] · "38 AO 46" -> [38,40,42,44,46]
// "34-35 AO 44-45" -> [34-35,36-37,38-39,40-41,42-43,44-45]
export function tamanhosDaGrade(grade?: string): string[] {
  const g = normGrade(grade);
  if (!g) return [];

  // Pares de calçado: "34-35-44-45" após a normalização de " AO " para "-"
  const par = g.match(/^(\d+)-(\d+)-(\d+)-(\d+)$/);
  if (par) {
    const [, a1, a2, b1] = par;
    const out: string[] = [];
    for (let x = Number(a1), y = Number(a2); x <= Number(b1); x += 2, y += 2) out.push(`${x}-${y}`);
    return out;
  }

  const [ini, fim] = g.split("-");
  if (!ini || !fim) return [];

  // Numérica: passo de 2 (38,40,42...); calçado anda de 1 em 1 (38,39,40...)
  if (/^\d+$/.test(ini) && /^\d+$/.test(fim)) {
    const passo = GRADES_CALCADO[g] ? 1 : 2;
    const out: string[] = [];
    for (let x = Number(ini); x <= Number(fim); x += passo) out.push(String(x));
    return out;
  }

  // Letras
  const i = SEQ_LETRAS.indexOf(ini), f = SEQ_LETRAS.indexOf(fim);
  return i >= 0 && f >= i ? SEQ_LETRAS.slice(i, f + 1) : [];
}

// Tamanhos a exibir na graduação: os da grade do produto, limitados ao que a
// tabela define — mais os de ponta que a grade pede e a tabela não tem (XPP,
// XGG), que serão derivados. Sem grade, mostra os tamanhos da tabela.
export function tamanhosParaExibir(tamanhosTabela: string[], grade?: string): string[] {
  const daGrade = tamanhosDaGrade(grade);
  if (!daGrade.length) return tamanhosTabela;
  if (!tamanhosTabela.length) return daGrade;
  // Só faz sentido cruzar se forem do mesmo tipo (letra × numérica)
  const mesmoTipo = daGrade.some(t => tamanhosTabela.includes(t));
  return mesmoTipo ? daGrade : tamanhosTabela;
}

// Valor de uma linha num tamanho. Se a tabela não define esse tamanho (ponta
// derivada), extrapola a partir da ponta mais próxima somando/subtraindo o
// passo de ampliação dela.
export function valorNoTamanho(linha: LinhaGrad, tamanho: string, tamanhosTabela: string[]): string {
  const direto = linha.valores?.[tamanho];
  if (direto !== undefined && String(direto).trim() !== "") return String(direto);
  if (!tamanhosTabela.length) return "";

  const seq = SEQ_LETRAS.includes(tamanho) ? SEQ_LETRAS : null;
  if (!seq) return "";
  const idx = seq.indexOf(tamanho);
  const idxIni = seq.indexOf(tamanhosTabela[0]);
  const idxFim = seq.indexOf(tamanhosTabela[tamanhosTabela.length - 1]);
  if (idx < 0 || idxIni < 0 || idxFim < 0) return "";

  // Abaixo da primeira: desce o passo da primeira, uma vez por degrau
  if (idx < idxIni) {
    const base = num(linha.valores?.[tamanhosTabela[0]]);
    const passo = Math.abs(num(linha.ampliacoes?.[tamanhosTabela[0]]));
    if (isNaN(base) || isNaN(passo)) return "";
    return fmt(base - passo * (idxIni - idx));
  }
  // Acima da última: sobe o passo da última
  if (idx > idxFim) {
    const base = num(linha.valores?.[tamanhosTabela[tamanhosTabela.length - 1]]);
    const passo = Math.abs(num(linha.ampliacoes?.[tamanhosTabela[tamanhosTabela.length - 1]]));
    if (isNaN(base) || isNaN(passo)) return "";
    return fmt(base + passo * (idx - idxFim));
  }
  return "";
}

// Tolerância é texto livre por ponto (ex. "1,0 + OU -", "0,5") — extrai o
// primeiro número e devolve o módulo, aplicado simetricamente pra mais e
// pra menos. Sem número reconhecível, devolve 0 (qualquer diferença conta
// como fora da tolerância).
export function parseTolerancia(tol: any): number {
  const m = String(tol ?? "").replace(",", ".").match(/\d+(\.\d+)?/);
  return m ? Math.abs(parseFloat(m[0])) : 0;
}

// Recalcula todos os tamanhos a partir de um valor medido no tamanho base,
// acumulando os passos de ampliação para fora da base. Usado na Graduação de
// Produção, onde a base é a medida real da prova aprovada.
export function calcularDaBase(
  linha: LinhaGrad,
  tamanhos: string[],
  base: string,
  valorBase: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  const b = tamanhos.indexOf(base);
  const vb = num(valorBase);
  if (b < 0 || isNaN(vb)) {
    // Sem base utilizável, devolve os valores de tabela como estão
    tamanhos.forEach(t => { out[t] = valorNoTamanho(linha, t, tamanhos); });
    return out;
  }
  out[base] = fmt(vb);
  let acc = vb;
  for (let i = b + 1; i < tamanhos.length; i++) {
    const passo = num(linha.ampliacoes?.[tamanhos[i]]);
    acc = isNaN(passo) ? acc : acc + Math.abs(passo);
    out[tamanhos[i]] = fmt(acc);
  }
  acc = vb;
  for (let i = b - 1; i >= 0; i--) {
    const passo = num(linha.ampliacoes?.[tamanhos[i]]);
    acc = isNaN(passo) ? acc : acc - Math.abs(passo);
    out[tamanhos[i]] = fmt(acc);
  }
  return out;
}
