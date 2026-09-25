// Carrega e monta os dados de uma ficha no formato que o FichaPDF espera, sem
// abrir a modal.
//
// Existe para a exportação em lote: montar o PDF de várias referências exigiria
// abrir e fechar o FichaModal uma vez por SKU, e a modal traz junto auto-save,
// realtime e geração de alerta — exportar viraria uma enxurrada de popups para
// a equipe inteira. Aqui só se lê.
//
// As derivações abaixo são as mesmas do carregamento do FichaModal (aviamentos
// automáticos, espelho do tecido do SKU, cor única preenchida sozinha). Mexeu
// lá, confira aqui — senão o PDF do lote diverge do PDF individual.

import {
  fetchFichaResolvida, fetchCadastros, fetchAviamentos, fetchTecidos,
  fetchVarianteCompras, fetchTabelasMedidas, fetchPontosByTabelaNome,
  fetchGraduacoesByTabelaNome,
} from "@/lib/db";
import { aviamentosAutomaticos } from "@/lib/etiquetas-tamanho";
import { tamanhosParaExibir } from "@/lib/tamanhos";

const DEFAULT_AVI = [{ item: "ADESIVO DE CÓDIGO DE BARRAS", cod: "AD0001", qtd: 1, valor: 0.10, local: "COLADO NO VERSO DO TAG", var01: "", var02: "", var03: "", var04: "", var05: "", var06: "" }];

const PILOTAGEM_PADRAO = [
  { num: "Piloto 1", lacre: "", envio: "", receb: "", prova: "", status: "" },
  { num: "Piloto 2", lacre: "", envio: "", receb: "", prova: "", status: "" },
  { num: "Piloto 3", lacre: "", envio: "", receb: "", prova: "", status: "" },
];

const ESTAMPARIA_PADRAO = {
  artes: [
    { posicao: "FRENTE", imagem: "", largura: "", localizacao: "" },
    { posicao: "COSTAS", imagem: "", largura: "", localizacao: "" },
    { posicao: "TAGLESS", imagem: "", largura: "", localizacao: "" },
  ],
  tecnicas: [],
  simulacoes: {
    var01: { nome: "", imgSim: "", imgFoto: "", status: "" },
    var02: { nome: "", imgSim: "", imgFoto: "", status: "" },
    var03: { nome: "", imgSim: "", imgFoto: "", status: "" },
    var04: { nome: "", imgSim: "", imgFoto: "", status: "" },
  },
  observacoes: "",
};

const provaVazia = () => ({ data: "", status: "", link: "", fotoFrente: "", fotoLado: "", fotoCostas: "", tipo: "" });
const PROVA_INFO_PADRAO = { p1: provaVazia(), p2: provaVazia(), p3: provaVazia() };
const ANOTACOES_PADRAO = { p1: { texto: "", video: "" }, p2: { texto: "", video: "" }, p3: { texto: "", video: "" } };

// O Tec.01 acompanha o tecido gravado no SKU — a ficha não pode mostrar um
// artigo diferente do que está em Desenvolvimento.
function espelharTecidoDoSku(row: any, linhas: any[], tecs: any[]) {
  if (!row.tecido) return linhas;
  const t0 = linhas[0];
  const forn = row.forn_tecido || "";
  if (t0 && t0.artigo === row.tecido && (t0.forn || "") === forn) return linhas;
  const preco = t0 && t0.artigo === row.tecido
    ? t0.preco
    : Number(String(tecs.find((t: any) => t.nome === row.tecido)?.preco ?? "").replace(",", ".")) || 0;
  const principal = { artigo: row.tecido, forn, preco, cores: t0?.cores || ["", "", "", ""] };
  return t0 ? [{ ...t0, ...principal }, ...linhas.slice(1)] : [principal];
}

export type DadosFichaPDF = Record<string, any>;

export async function carregarFichaParaPDF(row: any): Promise<DadosFichaPDF> {
  // fetchFichaResolvida e não fetchFicha: clássico não tem linha com
  // colecao=null, tem uma por temporada. Sem o fallback, toda referência 11xx
  // sairia como "sem ficha".
  const [ficha, cadastros, aviCad, tecs, vcAll, tabs] = await Promise.all([
    fetchFichaResolvida(row.ref), fetchCadastros(), fetchAviamentos(),
    fetchTecidos(), fetchVarianteCompras(), fetchTabelasMedidas(),
  ]);

  // ── Aviamentos: os salvos + os automáticos da grade/linha que faltarem ──
  const mkAvi = (cod: string) => {
    const c = aviCad.find((x: any) => x.cod === cod);
    return c ? { item: c.nome, cod: c.cod, qtd: 1, valor: c.preco, local: c.localizacao_padrao || "", var01: "", var02: "", var03: "", var04: "", var05: "", var06: "" } : null;
  };
  const aviBase = (() => {
    const autoCodes: string[] = aviamentosAutomaticos(row.grade, row.linha);
    let base: any[] = ficha?.aviamentos?.length ? [...ficha.aviamentos] : [];
    if (!base.some((a: any) => a.cod === "AD0001")) base = [mkAvi("AD0001") || DEFAULT_AVI[0], ...base];
    const faltantes = autoCodes.filter(cod => !base.some((a: any) => a.cod === cod));
    if (faltantes.length) base = [...base, ...faltantes.map(mkAvi).filter(Boolean)];
    return base.length ? base : [mkAvi("AD0001") || DEFAULT_AVI[0]];
  })();
  const avi = aviBase.map((a: any) => {
    const cat = aviCad.find((c: any) => c.cod === a.cod);
    const cores = cat?.cores_disponiveis || [];
    const autoColor = cores.length === 1 ? cores[0] : "";
    const varPatch: Record<string, string> = {};
    if (autoColor) (["var01", "var02", "var03", "var04", "var05", "var06"] as const).forEach(k => { if (!a[k]) varPatch[k] = autoColor; });
    return { ...a, ...varPatch, imagem: cat?.imagem || "", imagens_cores: cat?.imagens_cores || {}, cores_disponiveis: cores, fornecedor: cat?.fornecedor || "", codigo_fornecedor: cat?.codigo_fornecedor || "" };
  });

  // ── Tabela de medidas: diagrama do modo de medir e tamanhos ──
  const tabela = row.tab_medidas && tabs ? tabs.find((t: any) => t.nome === row.tab_medidas) : null;
  const imgModoMedir = (tabela as any)?.imagem_modo_medir || ficha?.imagem_modo_medir || null;

  const tec = espelharTecidoDoSku(
    row,
    ficha ? (ficha.tecidos || []) : [{ artigo: "", forn: "", preco: 0, cores: ["", "", "", ""] }],
    tecs,
  );

  let pts: any[] = [], grad: any[] = [], tabTamanhos: string[] = [], tabBase = "";
  if (row.tab_medidas) {
    const [p, g] = await Promise.all([
      fetchPontosByTabelaNome(row.tab_medidas),
      fetchGraduacoesByTabelaNome(row.tab_medidas),
    ]);
    pts = p; grad = g.linhas; tabTamanhos = g.tamanhos; tabBase = g.base;
  }

  // Sem provas salvas, a tabela sai com os pontos e as medidas em branco —
  // é o mesmo que a modal mostra ao abrir uma ficha nova.
  const pv = ficha?.provas || Object.fromEntries(pts.map((pt: any) => [pt.cod, { p1: "", p2: "", p3: "" }]));

  const estamparia = ficha?.estamparia
    ? {
        ...ESTAMPARIA_PADRAO, ...ficha.estamparia,
        artes: ficha.estamparia.artes?.length ? ficha.estamparia.artes : ESTAMPARIA_PADRAO.artes,
        simulacoes: ficha.estamparia.simulacoes || ESTAMPARIA_PADRAO.simulacoes,
      }
    : ESTAMPARIA_PADRAO;

  // provaInfo antigo guardava "foto" única; o novo tem frente/lado/costas.
  const provaInfo = ficha?.provaInfo
    ? { ...PROVA_INFO_PADRAO, ...Object.fromEntries(Object.entries(ficha.provaInfo).map(([k, v]: [string, any]) => [k, { data: v.data || "", status: v.status || "", link: v.link || "", fotoFrente: v.fotoFrente || v.foto || "", fotoLado: v.fotoLado || "", fotoCostas: v.fotoCostas || "", tipo: v.tipo || "", videoArquivo: v.videoArquivo || "" }])) }
    : PROVA_INFO_PADRAO;

  const tEsp = !!ficha?.tabelaEspecialAtiva;
  const hasEstamparia = (estamparia?.tecnicas || []).length > 0
    || (estamparia?.artes || []).some((a: any) => a.imagem || a.largura || a.localizacao);

  return {
    row,
    tec,
    avi,
    pil: ficha?.pilotagem?.length ? ficha.pilotagem : PILOTAGEM_PADRAO,
    pts: tEsp ? (ficha?.pontosEspeciais || []) : pts,
    grad: tEsp ? (ficha?.gradEspecial || []) : grad,
    pv,
    an: { ...ANOTACOES_PADRAO, ...(ficha?.anotacoes || {}) },
    img: ficha?.imagem_url || null,
    imgModelo: ficha?.imagem_modelo || null,
    imgModoMedir,
    imgFrente: ficha?.imagem_frente || null,
    imgCostas: ficha?.imagem_costas || null,
    hasEstamparia,
    estamparia,
    pantones: ficha?.pantones || { var01: "", var02: "", var03: "", var04: "", var05: "", var06: "" },
    obs: ficha?.observacoes || "",
    statusLib: ficha?.statusLiberacao || "",
    estagio: ficha?.estagio || "",
    tecCad: tecs,
    tabelaEspecial: tEsp,
    ncm: ficha?.ncm || "",
    peso: ficha?.pesoCalculo || null,
    vcCompras: vcAll,
    provaInfo,
    gradTamanhos: tamanhosParaExibir(tabTamanhos, row.grade),
    gradBase: tabBase || tabTamanhos[Math.floor(tabTamanhos.length / 2)] || "",
    tabTamanhos,
    importado: !!ficha?.importado,
  };
}
