-- =============================================
-- AUSTRAL PLM — Migration 042: Laudo de correção da pré-produção
--
-- Quando o laudo sai "REPROVADA - CORRIGIR", o fornecedor manda uma nova
-- pré corrigida. Ela ganha um laudo próprio (medidas, fotos, datas e status
-- novos) com o MESMO número de pedido, apontando para o laudo reprovado em
-- correcao_de. Uma correção também pode ser reprovada e gerar outra.
--
-- Apagar o laudo original apaga as correções dele (CASCADE).
--
-- Rodar no SQL Editor do Supabase. Pode rodar mais de uma vez.
-- =============================================

ALTER TABLE ficha_laudo_pp_pedidos
  ADD COLUMN IF NOT EXISTS correcao_de BIGINT REFERENCES ficha_laudo_pp_pedidos(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_ficha_laudo_pp_pedidos_correcao_de ON ficha_laudo_pp_pedidos(correcao_de);

NOTIFY pgrst, 'reload schema';
