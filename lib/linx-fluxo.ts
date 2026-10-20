import { getProdutos, getPedidosProduto } from "@/lib/linx";
import type { LinxFluxo } from "@/lib/fluxo";

// O que o kanban precisa do Linx: refs já cadastradas (etapa 7) e números dos
// pedidos de compra/produção em aberto por ref (etapa 16). Só servidor.
export async function linxParaFluxo(): Promise<LinxFluxo> {
  const [produtos, pedidos] = await Promise.all([getProdutos(), getPedidosProduto().catch(() => [])]);
  const cadastrados = Array.from(new Set(produtos.map(p => String(p.produto_pai).trim()).filter(Boolean)));
  const porRef: Record<string, string[]> = {};
  for (const p of pedidos) {
    const ref = String(p.produto_pai).trim(); const num = String(p.numero_pedido ?? "").trim();
    if (!ref || !num) continue;
    const l = (porRef[ref] ||= []);
    if (!l.includes(num)) l.push(num);
  }
  return { cadastrados, pedidos: porRef };
}
