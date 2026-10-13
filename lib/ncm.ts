/**
 * Classificador NCM automático para vestuário masculino.
 *
 * Fonte: tabela NCM vigente (Siscomex/Classif, Resolução Gecex) e Notas da
 * Seção XI do SH. Cada código abaixo foi conferido na tabela oficial — os
 * desdobramentos por fibra MUDAM de uma posição para outra (ex.: em 62.01 o
 * ".30" é algodão; em 62.05 o ".30" é sintética/artificial), por isso cada
 * posição tem a sua própria tabela, sem sufixo genérico.
 *
 *   Cap. 61 — vestuário de malha
 *   Cap. 62 — vestuário de tecido plano
 *
 * Fibra (Nota 2 da Seção XI): vale a matéria que predomina em peso sobre cada
 * uma das outras; sintéticas + artificiais (Cap. 54 e 55) somam como uma só;
 * empate → a que vem por último na ordem numérica (lã 51 < algodão 52 <
 * linho 53 < sintéticas/artificiais 54-55).
 *
 * 100 % local, sem custo de API.
 */

type Input = {
  grupo: string;        // BERMUDA, CALCA, CAMISA, CAMISETA, POLO, CASACO, JAQUETA, OVERSHIRT, TRICÔ…
  subgrupo: string;
  categoria: string;    // MALHA, MOLETOM, SARJA, LINHO, NYLON…
  tecido: string;       // nome do artigo
  composicao: string;   // "80% CO, 20% PES"
  descricao: string;
};

/* ── Helpers ── */

const up = (s: string) => (s || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/** Malha (cap. 61) ou tecido plano (cap. 62) */
function isMalha(grupo: string, subgrupo: string, cat: string, tecido: string, desc: string): boolean {
  const all = `${grupo} ${subgrupo} ${cat} ${tecido} ${desc}`;
  const malhaTerms = ["MALHA", "MOLETOM", "FLEECE", "TRICO", "JERSEY", "RIBANA", "PIQUET", "PIQUE", "INTERLOCK", "SUPLEX", "MOLETINHO"];
  return malhaTerms.some(t => all.includes(t));
}

/* ── Fibras ── */

// Ordem = ordem numérica dos capítulos (desempate da Nota 2 A).
type Fibra = "seda" | "la" | "algodao" | "vegetal" | "sintetica" | "artificial";

// Siglas da etiqueta (Inmetro) e nomes por extenso. CL = linho no cadastro da Austral.
const SIGLAS: [RegExp, Fibra][] = [
  [/^(CO|ALG|ALGODAO|ALGO|COTTON|COPIMA|PIMA)$/, "algodao"],
  [/^(CL|LI|LINHO|LINEN|CJ|CANHAMO|JUTA|JU|RAMI|HEMP)$/, "vegetal"],
  [/^(WO|WV|LA|WOOL|MERINO|CASHMERE|CAXEMIRA|WS|ALPACA|WP|MOHAIR|WM|ANGORA|WA|CAMELO)$/, "la"],
  [/^(SE|SEDA|SILK|S)$/, "seda"],
  [/^(CV|VISCOSE|RAYON|RAIOM|CMD|CMO|MODAL|CLY|LIOCEL|LYOCELL|TENCEL|CA|ACETATO|CTA|TRIACETATO|CUP|CUPRO|BAMBU)$/, "artificial"],
  [/^(PES|POLIESTER|POLYESTER|PA|POLIAMIDA|NAILON|NYLON|PUE|EL|EA|ELASTANO|ELASTOMERO|ELASTOMULTIESTER|SPANDEX|LYCRA|PAC|ACRILICO|ACRYLIC|PP|POLIPROPILENO|PE|POLIETILENO)$/, "sintetica"],
];

function tipoFibra(nome: string): Fibra | null {
  const n = up(nome).replace(/\(.*?\)/g, "").replace(/[^A-Z]/g, "");
  for (const [re, f] of SIGLAS) if (re.test(n)) return f;
  return null;
}

type Analise = { fibra: Fibra | null; pesos: Partial<Record<Fibra, number>>; desconhecidas: string[] };

/** Fibra que classifica a peça, pela Nota 2 da Seção XI. */
function analisarComposicao(comp: string): Analise {
  const pesos: Partial<Record<Fibra, number>> = {};
  const desconhecidas: string[] = [];
  // "52%CO, 40%PES, 8%PUE" · "98% CO e 2% PES" · "70,5% CO 22% CV"
  for (const m of Array.from(up(comp).matchAll(/(\d+(?:[.,]\d+)?)\s*%\s*([A-Z][A-Z ()]*?)(?=\s*(?:[,;/+.]|\bE\b|\d|$))/g))) {
    const pct = parseFloat(m[1].replace(",", "."));
    const f = tipoFibra(m[2]);
    if (!f) { desconhecidas.push(m[2].trim()); continue; }
    pesos[f] = (pesos[f] || 0) + pct;
  }

  // Cap. 54 e 55 entram juntos na comparação com os outros capítulos.
  const grupos: [Fibra | "54-55", number][] = [
    ["seda", pesos.seda || 0],
    ["la", pesos.la || 0],
    ["algodao", pesos.algodao || 0],
    ["vegetal", pesos.vegetal || 0],
    ["54-55", (pesos.sintetica || 0) + (pesos.artificial || 0)],
  ];
  let venc: Fibra | "54-55" | null = null;
  let max = 0;
  for (const [g, p] of grupos) if (p > 0 && p >= max) { venc = g; max = p; } // >= → empate fica com o último

  const fibra: Fibra | null = venc === "54-55"
    ? ((pesos.artificial || 0) >= (pesos.sintetica || 0) ? "artificial" : "sintetica")
    : venc;
  return { fibra, pesos, desconhecidas };
}

/* ── Tabelas oficiais por posição ── */

// Desdobramento de cada posição por fibra. "sintetica" e "artificial" só
// diferem onde a NCM separa (calças, paletós, banho).
type Tabela = Record<Fibra, string>;

const T: Record<string, { nome: string; cap: 61 | 62 | 42 | 65; tab: Tabela }> = {
  // ── Cap. 61 (malha) ──
  "61.01": { nome: "casaco/jaqueta de malha", cap: 61, tab: { algodao: "6101.20.00", sintetica: "6101.30.00", artificial: "6101.30.00", la: "6101.90.10", vegetal: "6101.90.90", seda: "6101.90.90" } },
  "61.03.3": { nome: "paletó de malha", cap: 61, tab: { la: "6103.31.00", algodao: "6103.32.00", sintetica: "6103.33.00", artificial: "6103.39.00", vegetal: "6103.39.00", seda: "6103.39.00" } },
  "61.03.4": { nome: "calça/bermuda de malha", cap: 61, tab: { la: "6103.41.00", algodao: "6103.42.00", sintetica: "6103.43.00", artificial: "6103.49.00", vegetal: "6103.49.00", seda: "6103.49.00" } },
  "61.05": { nome: "camisa/polo de malha", cap: 61, tab: { algodao: "6105.10.00", sintetica: "6105.20.00", artificial: "6105.20.00", la: "6105.90.00", vegetal: "6105.90.00", seda: "6105.90.00" } },
  "61.09": { nome: "camiseta de malha", cap: 61, tab: { algodao: "6109.10.00", sintetica: "6109.90.00", artificial: "6109.90.00", la: "6109.90.00", vegetal: "6109.90.00", seda: "6109.90.00" } },
  "61.10": { nome: "suéter/moletom/tricô", cap: 61, tab: { la: "6110.11.00", algodao: "6110.20.00", sintetica: "6110.30.00", artificial: "6110.30.00", vegetal: "6110.90.00", seda: "6110.90.00" } },
  "61.12.3": { nome: "short de banho de malha", cap: 61, tab: { sintetica: "6112.31.00", algodao: "6112.39.00", artificial: "6112.39.00", la: "6112.39.00", vegetal: "6112.39.00", seda: "6112.39.00" } },
  "61.14": { nome: "outro vestuário de malha", cap: 61, tab: { algodao: "6114.20.00", sintetica: "6114.30.00", artificial: "6114.30.00", la: "6114.90.10", vegetal: "6114.90.90", seda: "6114.90.90" } },
  // ── Cap. 62 (tecido plano) ──
  "62.01": { nome: "casaco/jaqueta", cap: 62, tab: { la: "6201.20.00", algodao: "6201.30.00", sintetica: "6201.40.00", artificial: "6201.40.00", vegetal: "6201.90.00", seda: "6201.90.00" } },
  "62.03.3": { nome: "paletó/blazer", cap: 62, tab: { la: "6203.31.00", algodao: "6203.32.00", sintetica: "6203.33.00", artificial: "6203.39.00", vegetal: "6203.39.00", seda: "6203.39.00" } },
  "62.03.4": { nome: "calça/bermuda", cap: 62, tab: { la: "6203.41.00", algodao: "6203.42.00", sintetica: "6203.43.00", artificial: "6203.49.00", vegetal: "6203.49.00", seda: "6203.49.00" } },
  "62.05": { nome: "camisa", cap: 62, tab: { algodao: "6205.20.00", sintetica: "6205.30.00", artificial: "6205.30.00", la: "6205.90.10", vegetal: "6205.90.90", seda: "6205.90.90" } },
  "62.11.1": { nome: "short de banho", cap: 62, tab: { algodao: "6211.11.00", sintetica: "6211.11.00", artificial: "6211.11.00", la: "6211.11.00", vegetal: "6211.11.00", seda: "6211.11.00" } },
  "62.11.3": { nome: "outro vestuário masculino", cap: 62, tab: { algodao: "6211.32.00", sintetica: "6211.33.00", artificial: "6211.33.00", la: "6211.39.10", vegetal: "6211.39.90", seda: "6211.39.90" } },
  // ── Acessórios ──
  "42.02.22": { nome: "bolsa de matéria têxtil", cap: 42, tab: { algodao: "4202.22.20", sintetica: "4202.22.20", artificial: "4202.22.20", la: "4202.22.20", vegetal: "4202.22.20", seda: "4202.22.20" } },
  "65.05.1": { nome: "boné", cap: 65, tab: { algodao: "6505.00.11", sintetica: "6505.00.12", artificial: "6505.00.12", la: "6505.00.19", vegetal: "6505.00.19", seda: "6505.00.19" } },
  "65.05.2": { nome: "gorro", cap: 65, tab: { algodao: "6505.00.21", sintetica: "6505.00.22", artificial: "6505.00.22", la: "6505.00.29", vegetal: "6505.00.29", seda: "6505.00.29" } },
};

/** Posição pelo tipo de peça: [termo, posição se malha, posição se plano]. A ordem importa. */
const PECAS: [string, string, string][] = [
  // banho antes de bermuda/short
  ["SWIMSHORT", "61.12.3", "62.11.1"],
  ["BOARDSHORT", "61.12.3", "62.11.1"],
  ["SUNGA", "61.12.3", "62.11.1"],
  ["BANHO", "61.12.3", "62.11.1"],
  // acessórios
  ["TOTE", "42.02.22", "42.02.22"],
  ["BOLSA", "42.02.22", "42.02.22"],
  ["BONE", "65.05.1", "65.05.1"],
  ["GORRO", "65.05.2", "65.05.2"],
  // agasalhos
  ["JAQUETA", "61.01", "62.01"],
  ["PARKA", "61.01", "62.01"],
  ["WINDBREAKER", "61.01", "62.01"],
  ["CORTA VENTO", "61.01", "62.01"],
  ["ANORAK", "61.01", "62.01"],
  ["SOBRETUDO", "61.01", "62.01"],
  ["TRENCH", "61.01", "62.01"],
  ["OVERSHIRT", "61.01", "62.01"],
  ["BLAZER", "61.03.3", "62.03.3"],
  ["PALETO", "61.03.3", "62.03.3"],
  ["TRICO", "61.10", "61.10"],
  ["SUETER", "61.10", "61.10"],
  ["CARDIGAN", "61.10", "61.10"],
  ["MOLETOM", "61.10", "62.01"],
  ["CASACO", "61.10", "62.01"],
  ["COLETE", "61.10", "62.01"],
  // partes de baixo
  ["CALCA", "61.03.4", "62.03.4"],
  ["JOGGER", "61.03.4", "62.03.4"],
  ["BERMUDA", "61.03.4", "62.03.4"],
  ["SHORT", "61.03.4", "62.03.4"],
  // partes de cima
  ["CAMISETA", "61.09", "62.05"],
  ["REGATA", "61.09", "62.11.3"],
  ["POLO", "61.05", "62.05"],
  ["CAMISA", "61.05", "62.05"],
];

const SEM_REGRA = /\b(CALCADOS?|TENIS|SANDALIAS?|CHINELOS?|SAPATOS?|BOTAS?|CINTOS?|MOCHILAS?|CARTEIRAS?|OCULOS)\b/;

/* ── Classificador principal ── */

export function classificarNCM(input: Input): { ncm: string; justificativa: string } {
  const grupo = up(input.grupo);
  const subgrupo = up(input.subgrupo);
  const categoria = up(input.categoria);
  const tecido = up(input.tecido);
  const desc = up(input.descricao);
  const comp = input.composicao || "";

  if (SEM_REGRA.test(`${grupo} ${subgrupo} ${desc}`)) {
    return { ncm: "", justificativa: "Calçado/acessório sem regra automática — classifique manualmente." };
  }

  const malha = isMalha(grupo, subgrupo, categoria, tecido, desc);
  const { fibra, pesos, desconhecidas } = analisarComposicao(comp);

  // Couro natural sai do capítulo têxtil. Camurça sintética (com fibra têxtil) segue a regra normal.
  if (up(comp).includes("COURO") || (!fibra && /\b(COURO|CAMURCA)\b/.test(`${categoria} ${tecido}`))) {
    return { ncm: "4203.10.00", justificativa: "Vestuário de couro natural (4203.10.00). Se não for couro natural, corrija a composição." };
  }

  if (!fibra) {
    return {
      ncm: "",
      justificativa: comp
        ? `Não reconheci as fibras da composição "${comp}" — corrija a composição ou classifique manualmente.`
        : "Sem composição cadastrada (no produto nem no tecido) — a NCM depende da fibra predominante.",
    };
  }

  // Posição: grupo, depois subgrupo, depois descrição.
  let pos: string | null = null;
  let peca = "";
  for (const termo of [grupo, subgrupo, desc]) {
    const achou = PECAS.find(([k]) => termo.includes(k));
    if (achou) { pos = malha ? achou[1] : achou[2]; peca = achou[0]; break; }
  }
  const generico = !pos;
  if (!pos) pos = malha ? "61.14" : "62.11.3";

  const p = T[pos];
  const ncm = p.tab[fibra];

  const nomeFibra: Record<Fibra, string> = {
    algodao: "algodão", sintetica: "sintética", artificial: "artificial", la: "lã/pelos finos", vegetal: "linho/outras vegetais", seda: "seda",
  };
  const pctTxt = (Object.entries(pesos) as [Fibra, number][]).map(([f, v]) => `${nomeFibra[f]} ${+v.toFixed(2)}%`).join(", ");
  const tipo = p.cap === 61 ? "malha (cap. 61)" : p.cap === 62 ? "tecido plano (cap. 62)" : `cap. ${p.cap}`;
  const avisos = [
    generico && "Peça não identificada — classificação genérica de vestuário masculino, confira.",
    desconhecidas.length && `Fibra(s) não reconhecida(s) ignorada(s): ${desconhecidas.join(", ")}.`,
    !malha && peca === "CAMISETA" && "Camiseta de tecido plano — confira se é mesmo plano.",
  ].filter(Boolean).join(" ");

  return {
    ncm,
    justificativa: `${generico ? "Vestuário" : peca} — ${p.nome}, ${tipo}. Fibra que classifica: ${nomeFibra[fibra]} (${pctTxt}).${avisos ? " " + avisos : ""}`,
  };
}
