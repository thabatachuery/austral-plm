-- 030 — Ficha de importado (cabeçalhos em inglês)
--
-- CONTEXTO: parte das referências é produzida por fornecedor de fora, que não
-- lê a ficha em português. A marcação é POR FICHA (e não por SKU) de propósito:
-- uma referência clássica tem uma ficha por temporada, e a mesma peça pode ser
-- nacional numa temporada e importada em outra.
--
-- O flag só troca os RÓTULOS (campos, cabeçalhos de tabela e títulos de seção)
-- na tela da ficha e no PDF. Os valores continuam em português — vêm dos
-- cadastros e do Linx. Ver lib/ficha-i18n.ts.

ALTER TABLE fichas_tecnicas
  ADD COLUMN IF NOT EXISTS importado BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN fichas_tecnicas.importado IS
  'Ficha de fornecedor importado: exibe os rótulos da ficha e do PDF em inglês.';
