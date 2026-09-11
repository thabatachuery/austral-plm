-- ═══════════════════════════════════════════════════════════════════════
-- Agrupa os alertas de uma mesma edição num aviso só.
--
-- Antes, cada campo alterado virava um alerta, e o auto-save da ficha (a cada
-- 1,5s de digitação) disparava a comparação a cada pausa: uma sessão de edição
-- normal virava uma rajada de popups bloqueantes para todo mundo. Uma única
-- referência chegou a gerar 47 alertas, 14 deles no mesmo minuto.
--
-- Com grupo_id, as alterações da mesma edição chegam com a mesma marca e a
-- tela mostra um aviso só, listando tudo que mudou.
--
-- Linhas antigas ficam com grupo_id NULL de propósito: sem grupo, cada uma
-- continua valendo por si, como já era. Não há o que migrar.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE alertas ADD COLUMN IF NOT EXISTS grupo_id TEXT;

CREATE INDEX IF NOT EXISTS idx_alertas_grupo ON alertas(grupo_id);
