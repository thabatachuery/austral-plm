-- =============================================
-- AUSTRAL PLM — Migration 044: Foto do produto no laudo de pré-produção
--
-- Campo próprio (obrigatório no app) para a foto de uma das peças
-- conferidas — separado das demais fotos do laudo (coluna fotos).
--
-- Rodar no SQL Editor do Supabase. Pode rodar mais de uma vez.
-- =============================================

ALTER TABLE ficha_laudo_pp_pedidos ADD COLUMN IF NOT EXISTS foto_produto TEXT;

NOTIFY pgrst, 'reload schema';
