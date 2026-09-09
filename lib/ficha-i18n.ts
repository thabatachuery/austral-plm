// Tradução dos RÓTULOS da ficha técnica para inglês, usada quando a ficha está
// marcada como "importado" (fichas_tecnicas.importado) — o fornecedor de fora
// precisa ler o documento.
//
// Só entram cabeçalhos de campo, de tabela e de seção. Os VALORES continuam em
// português de propósito: nome de cor, tecido, fornecedor e subgrupo vêm dos
// cadastros e do Linx, onde qualquer item novo entra em português; um
// dicionário de valores nasceria desatualizado no primeiro cadastro criado.
//
// A exceção é o estágio da ficha (DESENVOLVIMENTO/MOSTRUÁRIO/PRODUÇÃO): ele é
// a tarja que identifica o documento, não um dado da peça, e vem de uma lista
// fechada — está traduzido logo abaixo.
//
// Botões, avisos de salvamento e placeholders da tela também ficam em
// português: quem opera o PLM é o time interno.

const EN: Record<string, string> = {
  // ── Identificação do produto ──
  "Referência": "Reference",
  "Descrição": "Description",
  "Coleção": "Collection",
  "Tecido": "Fabric",
  "Forn. tecido": "Fabric supplier",
  "Forn. Tecido": "Fabric Supplier",
  "Composição": "Composition",
  "Operação": "Operation",
  "Fornecedor": "Supplier",
  "Fornec.": "Supplier",
  "Forn.": "Supplier",
  "Estilista": "Designer",
  "Tab. medidas": "Size chart",
  "Tab. Medidas": "Size Chart",
  "Tabela base": "Base chart",
  "Tabela Base": "Base Chart",
  "Tabela de medidas": "Measurement chart",
  "NCM": "HS Code",
  "Peso Estimado": "Estimated Weight",
  "Drop": "Drop",
  "Grade": "Size range",
  "Tamanho": "Size",
  "Padrão": "Base size",
  "Tipo": "Type",
  "Linha": "Line",
  "Grupo": "Group",
  "Subgrupo": "Subgroup",
  "Categoria": "Category",
  "Subcategoria": "Subcategory",

  // ── Estágio da ficha (a tarja do cabeçalho) ──
  // Única exceção à regra de manter valores em português: a tarja identifica o
  // documento, e sair "DESENVOLVIMENTO" numa ficha em inglês confunde o
  // fornecedor. "SMS" (salesman sample) é como o mostruário é chamado lá fora.
  "DESENVOLVIMENTO": "DEVELOPMENT",
  "MOSTRUÁRIO": "SMS",
  "PRODUÇÃO": "PRODUCTION",
  "REPILOTANDO PRODUÇÃO": "PRODUCTION RE-SAMPLING",
  "CANCELADO": "CANCELLED",

  // ── Seções e cabeçalhos de página ──
  "FICHA TÉCNICA": "TECH PACK",
  "Ficha Técnica": "Tech Pack",
  "Desenho Técnico": "Technical Drawing",
  "Tecidos & Variantes": "Fabrics & Colorways",
  "Aviamentação": "Trims & Notions",
  "AVIAMENTAÇÃO": "TRIMS & NOTIONS",
  "Referência Visual": "Visual Reference",
  "Total Aviamentos": "Trims Total",
  "Observações": "Remarks",
  "Nenhuma observação.": "No remarks.",
  "Liberação": "Approval",
  "Graduação de Produção": "Production Grading",
  "GRADUAÇÃO DE PRODUÇÃO": "PRODUCTION GRADING",
  "GRADUAÇÃO": "GRADING",
  "FOTO DO PRODUTO": "PRODUCT PHOTO",
  "Foto do produto": "Product photo",
  "COMENTÁRIOS DE PROVA": "FITTING COMMENTS",
  "TABELA DE PRODUÇÃO": "PRODUCTION MEASUREMENT CHART",
  "TABELA DE MOSTRUÁRIO": "SMS MEASUREMENT CHART",
  "TABELA DE DESENVOLVIMENTO": "DEVELOPMENT MEASUREMENT CHART",
  "TABELA DE MEDIDAS — LIBERAÇÃO DE": "MEASUREMENT CHART — APPROVAL FOR",
  "Detalhamento de Custo": "Cost Breakdown",
  "Informações de Compras": "Purchasing Information",

  // ── Tabela de tecidos ──
  // A coluna "Artigo" da tabela de tecidos é o próprio tecido — "Article" não
  // diz nada para o fornecedor de fora.
  "Artigo": "Fabric",
  "Preço": "Price",
  "Pantone": "Pantone",
  "Pantone / Código": "Pantone / Code",
  "Tipo de Tingimento": "Dyeing Type",
  "Qtd. Compra 1": "Order Qty 1",
  "Nº Pedido 1": "PO No. 1",
  "Qtd. Compra": "Order Qty",
  "NÚMERO DO PEDIDO 1": "PURCHASE ORDER No. 1",

  // ── Aviamentos ──
  "Código": "Code",
  "Cód": "Code",
  "Cód. forn.": "Supplier code",
  "Matéria prima": "Material",
  "Qtd": "Qty",
  "Valor": "Value",
  "Localização": "Placement",
  "Total": "Total",

  // ── Estamparia ──
  "ESTAMPARIA": "PRINTING",
  "Estamparia": "Printing",
  "BORDADO": "EMBROIDERY",
  "Bordado": "Embroidery",
  "APLIQUE": "APPLIQUE",
  "Aplique": "Applique",
  "ARTE": "ARTWORK",
  "Arte": "Artwork",
  // "Localização Arte" é uma expressão só: em inglês a ordem inverte
  // ("Artwork Placement"), então não pode sair da soma dos dois rótulos.
  "Localização Arte": "Artwork Placement",
  "LOCALIZAÇÃO ARTE": "ARTWORK PLACEMENT",
  // Posição da arte — valor de lista fechada, como o estágio da ficha.
  "LATERAL": "SIDE",
  "TAGLESS": "TAGLESS",
  "Tagless": "Tagless",
  "Localização Arte Tagless": "Artwork Placement Tagless",
  "LOCALIZAÇÃO ARTE TAGLESS": "ARTWORK PLACEMENT TAGLESS",
  "Técnica": "Technique",
  "Técnica de Estamparia": "Printing Technique",
  "TÉCNICA DE ESTAMPARIA": "PRINTING TECHNIQUE",
  "Simulação": "Mock-up",
  "SIMULAÇÕES E FOTOS": "MOCK-UPS & PHOTOS",
  "Variante": "Colorway",
  "Foto": "Photo",
  "Sem imagem": "No image",
  "Sem foto": "No photo",

  // ── Liberação / provas ──
  "Frente": "Front",
  "Costas": "Back",
  "Lado": "Side",
  "FRENTE": "FRONT",
  "COSTAS": "BACK",
  "LADO": "SIDE",
  "Pendente": "Pending",
  "Medida": "Measurement",
  "Diferença": "Difference",
  "MED.": "MEAS.",
  "DIF": "DIFF",
  "Tol.": "Tol.",
  "Tolerância": "Tolerance",
  "Tab.": "Spec",
  "Nº Lacre": "Seal No.",
  "Data de Prova": "Fitting Date",
  "Status": "Status",
  "Status da liberação": "Approval status",
  "Modo de Medir": "How to Measure",
  "Modelo": "Fit Model",
  "Fotos das Provas": "Fitting Photos",
  "LINK DO VÍDEO:": "VIDEO LINK:",

  // ── Custo ──
  "Mão de Obra": "Labour",
  "Total M.O.": "Labour Total",
  "Produto Acabado": "Finished Goods",
  "Total P.A.": "Finished Goods Total",
  "Custo Forn.": "Supplier Cost",
  "M.P.": "Raw material",
  "M.O.": "Labour",
  "Avios.": "Trims",
  "Compra 1": "Order 1",
  "Compra 2": "Order 2",
  "Pedido": "PO",
  "Entrega": "Delivery",
  "Especial": "Custom",
  "Observações de fechamento de custo": "Cost closing remarks",

  // ── Avisos impressos no PDF ──
  "⚠ ATENÇÃO: SE AS ALTERAÇÕES SOLICITADAS NÃO FOREM FEITAS, A PEÇA PODE SER DEVOLVIDA":
    "⚠ WARNING: IF THE REQUESTED CHANGES ARE NOT MADE, THE GARMENT MAY BE REJECTED",
  "✗ PEÇA REPROVADA — FAVOR CORRIGIR CONFORME ANOTAÇÕES DE PROVA":
    "✗ GARMENT REJECTED — PLEASE CORRECT AS PER FITTING COMMENTS",
  "ATENÇÃO — Liberado com Restrição": "WARNING — Approved with Restrictions",
  "Valores em vermelho excedem a tolerância. Verificar antes de iniciar a produção completa.":
    "Values in red exceed tolerance. Please check before starting bulk production.",
  "Austral® · Confidencial": "Austral® · Confidential",
};

export type Tradutor = ((pt: string) => string) & { importado: boolean };

// Devolve o tradutor da ficha. Fora do modo importado (e para qualquer texto
// sem tradução cadastrada) o texto sai exatamente como entrou — assim um rótulo
// novo aparece em português em vez de sumir.
export function criarTradutor(importado: boolean): Tradutor {
  const t = importado
    ? (pt: string) => EN[pt] ?? pt
    : (pt: string) => pt;
  return Object.assign(t, { importado });
}

// Título da ficha de estamparia. Não sai por concatenação de rótulo porque a
// ordem das palavras inverte: "FICHA TÉCNICA DE BORDADO" vira "EMBROIDERY TECH
// PACK". Os nomes em inglês também não são tradução literal — é o vocabulário
// que o fornecedor de fora usa (aplique → embellishment).
const TIPO_EST_EN: Record<string, string> = {
  ESTAMPARIA: "Print",
  BORDADO: "Embroidery",
  APLIQUE: "Embellishment",
};
const normalizaTipoEst = (tipo: string) => String(tipo || "ESTAMPARIA").trim().toUpperCase() || "ESTAMPARIA";

// Só o nome do tipo (para as opções do seletor na tela).
export function nomeTipoEstamparia(t: Tradutor, tipo: string) {
  const tp = normalizaTipoEst(tipo);
  return t.importado ? (TIPO_EST_EN[tp] ?? tp).toUpperCase() : tp;
}

// Título completo da ficha, em caixa alta (faixa da tela) ou title case (PDF).
export function tituloFichaEstamparia(t: Tradutor, tipo: string, caixaAlta = false) {
  const tp = normalizaTipoEst(tipo);
  if (!t.importado) {
    const titulo = tp.charAt(0) + tp.slice(1).toLowerCase();
    return caixaAlta ? `FICHA TÉCNICA DE ${tp}` : titulo;
  }
  const en = `${TIPO_EST_EN[tp] ?? tp.charAt(0) + tp.slice(1).toLowerCase()} Tech Pack`;
  return caixaAlta ? en.toUpperCase() : en;
}

// Título da tabela de técnicas — usa só o nome do tipo, não o título da ficha
// (senão sairia "Print Tech Pack Techniques").
export function tituloTecnicas(t: Tradutor, tipo: string) {
  const tp = normalizaTipoEst(tipo);
  const nome = tp.charAt(0) + tp.slice(1).toLowerCase();
  return t.importado ? `${TIPO_EST_EN[tp] ?? nome} Techniques` : `Técnicas de ${nome}`;
}

// ── Pontos de medida ────────────────────────────────────────────────────────
// Descrição de ponto de medida é cadastro (tabela_medida_pontos.descricao), mas
// ao contrário de cor e fornecedor é vocabulário fechado de ficha técnica — e é
// justamente o que o fornecedor de fora precisa entender pra medir a peça certo.
// Ponto novo que não esteja aqui sai em português, como qualquer outro rótulo.
const MEDIDAS: [string, string][] = [
  ["TORAX", "CHEST"],
  ["CINTURA", "WAIST"],
  ["QUADRIL", "HIP"],
  ["BARRA", "HEM"],
  ["BARRA DA MANGA", "SLEEVE HEM"],
  ["BARRA C/ PUNHO", "HEM W/ CUFF"],
  ["BARRA S/ PUNHO", "HEM W/O CUFF"],
  ["OMBRO A OMBRO", "SHOULDER TO SHOULDER"],
  ["COMPRIMENTO TOTAL", "TOTAL LENGTH"],
  ["COMPRIMENTO TOTAL(HPS)", "TOTAL LENGTH (HPS)"],
  ["COMPRIMENTO LATERAL", "SIDE LENGTH"],
  ["COMP. TOTAL TRASEIRO CENTRO", "CENTER BACK TOTAL LENGTH"],
  ["COMP. TOTAL TRASEIRO - BARRA RETA", "CENTER BACK LENGTH - STRAIGHT HEM"],
  ["COMP. TOTAL TRASEIRO - BARRA CURVA", "CENTER BACK LENGTH - CURVED HEM"],
  ["COMPRIMENTO DA MANGA", "SLEEVE LENGTH"],
  ["COMPRIMENTO DA MANGA RAGLAN", "RAGLAN SLEEVE LENGTH"],
  ["ABERTURA DA MANGA", "SLEEVE OPENING"],
  ["ABERTURA DA MANGA C/ PUNHO", "SLEEVE OPENING W/ CUFF"],
  ["BICEPS", "BICEPS"],
  ["COTOVELO", "ELBOW"],
  ["PUNHO", "CUFF"],
  ["PUNHO FECHADO", "CUFF CLOSED"],
  ["CAVA RETA", "ARMHOLE STRAIGHT"],
  ["CAVA RAGLAN FRENTE", "FRONT RAGLAN ARMHOLE"],
  ["CAVA RAGLAN COSTAS", "BACK RAGLAN ARMHOLE"],
  ["ENTRE CAVAS FRENTE", "ACROSS FRONT"],
  ["ENTRE CAVAS COSTAS", "ACROSS BACK"],
  ["ABERTURA DO DECOTE", "NECK WIDTH"],
  ["PROFUNDIDADE DO DECOTE", "NECK DROP"],
  ["CIRCUNFERENCIA DO DECOTE", "NECK CIRCUMFERENCE"],
  ["ABERTURA DECOTE C/ CAPUZ", "NECK WIDTH W/ HOOD"],
  ["PROFUNDIDADE DECOTE C/ CAPUZ", "NECK DROP W/ HOOD"],
  ["ALTURA DO CAPUZ", "HOOD HEIGHT"],
  ["LARGURA DO CAPUZ", "HOOD WIDTH"],
  ["COLARINHO", "COLLAR"],
  ["COLARINHO COM PÉ DE GOLA", "COLLAR WITH STAND"],
  ["COLARINHO SEM PÉ DE GOLA", "COLLAR WITHOUT STAND"],
  ["CONTORNO S/ PÉ DE GOLA", "NECK CIRCUMFERENCE W/O STAND"],
  ["GOLA", "COLLAR"],
  ["PONTA DE GOLA", "COLLAR POINT"],
  ["COMPRIMENTO DA VISTA", "PLACKET LENGTH"],
  ["LARGURA DA VISTA", "PLACKET WIDTH"],
  ["COMP. TOTAL DA CARCELA", "SLEEVE PLACKET TOTAL LENGTH"],
  ["ABERTURA DA CARCELA", "SLEEVE PLACKET OPENING"],
  ["GANCHO DIANTEIRO COM CÓS", "FRONT RISE INCL. WAISTBAND"],
  ["GANCHO TRASEIRO COM CÓS", "BACK RISE INCL. WAISTBAND"],
  ["ENTREPERNAS", "INSEAM"],
  ["COXA", "THIGH"],
  ["JOELHO A 31 CM DO GANCHO", "KNEE AT 31 CM FROM CROTCH"],
];

// A busca ignora acento, caixa e pontuação: o mesmo ponto aparece cadastrado
// como "COMPRIMENTO TOTAL(HPS)" e "Comprimento Total (HPS)" em tabelas
// diferentes, e as duas formas têm de cair na mesma tradução.
const chaveMedida = (d: string) =>
  String(d ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const MEDIDAS_EN = new Map(MEDIDAS.map(([pt, en]) => [chaveMedida(pt), en]));

export function traduzirPontoMedida(t: Tradutor, descricao: string) {
  if (!t.importado) return descricao;
  return MEDIDAS_EN.get(chaveMedida(descricao)) ?? descricao;
}

// Rótulos montados em tempo de execução ("Prova 2", "Arte COSTAS"): traduz só a
// parte fixa e mantém o resto, que costuma ser valor (posição, número).
export function rotuloProva(t: Tradutor, n: number | string) {
  return t.importado ? `FITTING ${n}` : `PROVA ${n}`;
}
export function rotuloFotosProva(t: Tradutor, n: number | string) {
  return t.importado ? `Fitting ${n} Photos` : `Fotos da Prova ${n}`;
}
export function rotuloAnotacoesProva(t: Tradutor, n: number | string) {
  return t.importado ? `Fitting ${n} Comments` : `Anotações da Prova ${n}`;
}
