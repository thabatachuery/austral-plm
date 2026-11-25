-- =============================================
-- AUSTRAL PLM — Migration 043: Conferência (checklist) do laudo de pré-produção
--
-- Itens conferidos na pré como "correto" ou "incorreto": embalagem, tag de
-- papel, códigos de barras (referência, cor, nome, tamanho), aviamentos e
-- etiqueta de composição. Guardado por laudo, em JSONB:
--   { "embalagem": "ok", "cb_cor": "nok", ... }   (sem chave = não conferido)
-- A lista de itens fica no app (lib/preproducao.ts, CHECKLIST_PP).
--
-- Rodar no SQL Editor do Supabase. Pode rodar mais de uma vez.
-- =============================================

ALTER TABLE ficha_laudo_pp_pedidos ADD COLUMN IF NOT EXISTS checklist JSONB DEFAULT '{}';

NOTIFY pgrst, 'reload schema';
