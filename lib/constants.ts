// Status de desenvolvimento (aba Estilo)
export const STATUS_ESTILO = {
  DESENVOLVIMENTO:       "DESENVOLVIMENTO",
  MOSTARIO_LIBERADO:     "MOSTRUÁRIO LIBERADO",
  PRODUCAO_LIBERADA:     "PRODUÇÃO LIBERADA",
  REPILOTANDO_PRODUCAO:  "REPILOTANDO PRODUÇÃO",
  CANCELADO:             "CANCELADO",
} as const;

export const STATUS_ESTILO_OPTS = [
  STATUS_ESTILO.DESENVOLVIMENTO,
  STATUS_ESTILO.MOSTARIO_LIBERADO,
  STATUS_ESTILO.PRODUCAO_LIBERADA,
  STATUS_ESTILO.REPILOTANDO_PRODUCAO,
  STATUS_ESTILO.CANCELADO,
];

// Status de compras (aba Compras)
export const STATUS_COMPRAS = {
  PEDIDO_MOST_COLOCADO:      "PEDIDO MOST. COLOCADO",
  MOSTARIO_ENTREGUE:         "MOSTRUÁRIO ENTREGUE",
  PED_PRODUCAO_COLOCADO:     "PED. DE PRODUÇÃO COLOCADO",
  PRODUCAO_ENTREGUE:         "PRODUÇÃO ENTREGUE",
} as const;

export const STATUS_COMPRAS_OPTS = [
  STATUS_COMPRAS.PEDIDO_MOST_COLOCADO,
  STATUS_COMPRAS.MOSTARIO_ENTREGUE,
  STATUS_COMPRAS.PED_PRODUCAO_COLOCADO,
  STATUS_COMPRAS.PRODUCAO_ENTREGUE,
];

// Status de liberação da ficha (pilotagem/prova)
export const STATUS_LIB = {
  APROVADO:              "APROVADO",
  APROVADO_COM_RESTRICAO:"APROVADO COM RESTRIÇÃO",
  REPROVADO:             "REPROVADO",
} as const;

// Status visíveis no filtro de compras (produtos que devem aparecer na aba)
export const COMPRAS_STATUS_ALLOW = [
  STATUS_ESTILO.DESENVOLVIMENTO,
  STATUS_ESTILO.MOSTARIO_LIBERADO,
  STATUS_ESTILO.PRODUCAO_LIBERADA,
  STATUS_ESTILO.REPILOTANDO_PRODUCAO,
];

// Status do laudo de pré-produção — mesmas opções do campo status_pre_producao
// do Controle de Fluxo (tabela antiga, hoje substituída pelo kanban), reaproveitadas
// dentro de cada laudo/pedido (components/preproducao).
export const STATUS_PRE_PRODUCAO_OPTS = ["", "LIBERADA", "LIBERADA COM RESTRIÇÃO", "REPROVADA - CORRIGIR", "REPROVADA - NEGOCIAR"];

export const STATUS_PRE_PRODUCAO_COLORS: Record<string, { bg: string; color: string }> = {
  "LIBERADA":               { bg: "rgba(52,199,89,0.15)",  color: "#1a7a35" },
  "LIBERADA COM RESTRIÇÃO": { bg: "rgba(255,149,0,0.15)",  color: "#b86a00" },
  "REPROVADA - CORRIGIR":   { bg: "rgba(234,47,70,0.12)",  color: "#c41e3a" },
  "REPROVADA - NEGOCIAR":   { bg: "rgba(234,47,70,0.12)",  color: "#c41e3a" },
};
