-- =============================================
-- AUSTRAL PLM — Migration 045: Vídeo do laudo de pré-produção
--
-- Vídeo opcional do laudo (pré ou correção). O PDF do laudo imprime o QR
-- code do vídeo para abrir no celular, como na ficha técnica.
--
-- Rodar no SQL Editor do Supabase. Pode rodar mais de uma vez.
-- =============================================

ALTER TABLE ficha_laudo_pp_pedidos ADD COLUMN IF NOT EXISTS video_url TEXT;

NOTIFY pgrst, 'reload schema';
