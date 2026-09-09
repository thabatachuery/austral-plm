// Tradução dos RÓTULOS da ficha técnica para inglês, usada quando a ficha está
// marcada como "importado" (fichas_tecnicas.importado) — o fornecedor de fora
// precisa ler o documento.
//
// Só entram cabeçalhos de campo, de tabela e de seção. Os VALORES continuam em
// português de propósito: nome de cor, tecido, fornecedor, subgrupo e status
// vêm dos cadastros e do Linx, onde qualquer item novo entra em português; um
// dicionário de valores nasceria desatualizado no primeiro cadastro criado.
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
  "TABELA DE MOSTRUÁRIO": "SAMPLE MEASUREMENT CHART",
  "TABELA DE DESENVOLVIMENTO": "DEVELOPMENT MEASUREMENT CHART",
  "Detalhamento de Custo": "Cost Breakdown",
  "Informações de Compras": "Purchasing Information",

  // ── Tabela de tecidos ──
  "Artigo": "Article",
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
  "Tagless": "Tagless",
  "Localização Arte Tagless": "Tagless Artwork Placement",
  "LOCALIZAÇÃO ARTE TAGLESS": "TAGLESS ARTWORK PLACEMENT",
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
