-- ═══════════════════════════════════════════════════════════════════════
-- Impede, no banco, que as linhas da ficha dupliquem.
--
-- O upsertFicha grava tecidos, aviamentos, pilotagem e tabela especial
-- APAGANDO e reinserindo. Sem trava, duas gravações ao mesmo tempo viram
-- "apaga A, apaga B, insere A, insere B" — e as linhas DOBRAM a cada rodada.
-- O auto-save dispara a cada 1,5s, então a sobreposição é comum.
--
-- A ficha da 22040058 chegou a 1.000 pontos de medida assim (os mesmos 12
-- repetidos 83 vezes). Foi limpa, e voltou a 96 em poucas horas — prova de
-- que a trava no navegador não basta: ela é por aba, e duas abas (ou duas
-- pessoas) têm travas independentes.
--
-- Com estes índices, a segunda inserção FALHA em vez de duplicar. O
-- salvamento acusa erro na tela, que é muito melhor do que corromper a ficha
-- em silêncio.
--
-- Os dados já foram limpos antes desta migration; se algum duplicado
-- reaparecer, o CREATE UNIQUE INDEX abaixo falha e aponta qual é.
-- ═══════════════════════════════════════════════════════════════════════

-- Um aviamento entra uma vez por ficha (confirmado com a usuária: repetir o
-- mesmo código na mesma ficha não é uso legítimo).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ficha_aviamentos_codigo
  ON ficha_aviamentos (ficha_id, codigo);

-- Um artigo de tecido entra uma vez por ficha.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ficha_tecidos_artigo
  ON ficha_tecidos (ficha_id, artigo);

-- Cada piloto aparece uma vez (Piloto 1, Piloto 2, Piloto 3).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ficha_pilotagem_num
  ON ficha_pilotagem (ficha_id, num);

-- Tabela especial: um ponto por código, uma linha de graduação por descrição.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ficha_pontos_especiais_cod
  ON ficha_pontos_especiais (ficha_id, cod);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_ficha_graduacao_especial_desc
  ON ficha_graduacao_especial (ficha_id, descricao);
