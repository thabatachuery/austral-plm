-- ═══════════════════════════════════════════════════════════════════════
-- Localização do tecido na ficha (ex.: CORPO, FORRO, BOLSO).
--
-- Há modelos com um tecido para a peça e outro para o forro, e a ficha (e o
-- PDF que vai para a produção) precisa dizer onde cada um entra.
--
-- O índice único de 035 era (ficha_id, artigo): impedia usar o MESMO artigo
-- na peça e no forro. Passa a ser (ficha_id, artigo, localizacao) — continua
-- barrando a duplicação do auto-save (a linha repetida é idêntica, inclusive
-- na localização).
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE ficha_tecidos ADD COLUMN IF NOT EXISTS localizacao TEXT NOT NULL DEFAULT '';

DROP INDEX IF EXISTS uniq_ficha_tecidos_artigo;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ficha_tecidos_artigo_local
  ON ficha_tecidos (ficha_id, artigo, localizacao);
