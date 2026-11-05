// Canal de venda de cada filial do Linx, pelo nome — o /vendas e o /estoque
// mandam só a filial. Segue o que o BI descreve para o /vendas: PDV de loja
// própria, outlet, franquia, e-commerce (que sai da MATRIZ) e atacado
// multimarcas (AUSTRAL ATACADISTA, ATACADO e SHOWROOM). As filiais
// operacionais (pré-produção, segunda qualidade, em análise...) não vendem.
//
// Loja nova cai sozinha no canal certo se seguir o padrão do nome (LOJA...,
// FRQ..., OUTLET...). Exceções sem prefixo ficam listadas abaixo.

export const CANAIS = ["LOJA PRÓPRIA", "FRANQUIA", "OUTLET", "E-COMMERCE", "ATACADO", "OPERACIONAL"] as const;
export type Canal = (typeof CANAIS)[number];

const LOJA_SEM_PREFIXO = ["IGUATEMI ALPHAVILLE", "AUSTRAL RIBEIRAO PRETO"];
const ATACADO = ["AUSTRAL ATACADISTA", "ATACADO", "SHOWROOM"];

export function canalDaFilial(filial: string): Canal {
  const f = String(filial || "").trim().toUpperCase();
  if (f === "MATRIZ") return "E-COMMERCE";
  if (ATACADO.includes(f)) return "ATACADO";
  if (f.startsWith("FRQ")) return "FRANQUIA";
  if (f.startsWith("OUTLET") || f.includes("BAZAR")) return "OUTLET";
  if (f.startsWith("LOJA") || LOJA_SEM_PREFIXO.includes(f)) return "LOJA PRÓPRIA";
  return "OPERACIONAL";
}
