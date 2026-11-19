-- =============================================
-- AUSTRAL PLM — Migration 039: Datas do laudo de pré-produção por PEDIDO
--
-- Cada laudo (1 por pedido de produção) passa a guardar:
--   • data_entrega_producao — data programada do pedido no Linx (copiada ao
--     criar o laudo, porque o pedido some do Linx depois de entregue);
--   • data_entrega_pre      — dia em que a pré-produção chegou;
--   • data_laudo            — dia em que o laudo foi feito.
-- A previsão de entrega da pré é calculada (entrega da produção − 10 dias).
--
-- Antes essas datas ficavam por REFERÊNCIA em controle_fluxo
-- (data_entrega_pre_producao / data_retorno_pre_producao) — o app continua
-- copiando para lá, porque o kanban usa a data de entrega da pré.
--
-- Rodar no SQL Editor do Supabase. Pode rodar mais de uma vez.
-- =============================================

ALTER TABLE ficha_laudo_pp_pedidos ADD COLUMN IF NOT EXISTS data_entrega_producao DATE;
ALTER TABLE ficha_laudo_pp_pedidos ADD COLUMN IF NOT EXISTS data_entrega_pre DATE;
ALTER TABLE ficha_laudo_pp_pedidos ADD COLUMN IF NOT EXISTS data_laudo DATE;

-- Laudos que já existiam: herdam as datas que estavam na referência.
UPDATE ficha_laudo_pp_pedidos p
SET data_entrega_pre = COALESCE(p.data_entrega_pre, cf.data_entrega_pre_producao),
    data_laudo       = COALESCE(p.data_laudo, cf.data_retorno_pre_producao,
                                CASE WHEN COALESCE(p.status, '') <> '' THEN p.updated_at::date END)
FROM fichas_tecnicas f
JOIN controle_fluxo cf ON cf.produto_ref = f.produto_ref
WHERE f.id = p.ficha_id;

NOTIFY pgrst, 'reload schema';
