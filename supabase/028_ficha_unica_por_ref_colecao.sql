-- 028 — Uma ficha técnica por (referência, coleção)
--
-- CONTEXTO: em 27/08/2026 a ref 12270701 apareceu com SEIS fichas, todas sem
-- coleção. A causa estava no app (fetchFicha usava maybeSingle(), que dá erro
-- com mais de uma linha: a ficha abria em branco e o salvamento seguinte criava
-- outra duplicata, num ciclo). O app já foi corrigido — a leitura pega a mais
-- recente e o upsert procura ficha existente antes de criar — e as duplicatas
-- foram limpas. Este índice é a garantia no banco, pra não depender só do app.
--
-- COALESCE em vez de UNIQUE (produto_ref, colecao): no Postgres, NULLs são
-- distintos entre si, então a constraint comum deixaria passar várias linhas com
-- colecao = NULL — exatamente o caso que aconteceu. Referência normal tem uma
-- ficha com colecao NULL; "clássico" tem uma por temporada.

CREATE UNIQUE INDEX IF NOT EXISTS fichas_tecnicas_ref_colecao_unico
  ON fichas_tecnicas (produto_ref, COALESCE(colecao, ''));

-- Se der erro de violação de unicidade, é porque voltou a existir duplicata.
-- Para achar antes de criar o índice:
--
--   SELECT produto_ref, COALESCE(colecao, '') AS colecao,
--          COUNT(*) AS fichas, array_agg(id ORDER BY id) AS ids
--     FROM fichas_tecnicas
--    GROUP BY 1, 2
--   HAVING COUNT(*) > 1;
--
-- A regra usada na limpeza foi: manter a ficha de maior id (a que o app abre,
-- com os últimos dados salvos) e, antes de excluir as outras, copiar pra ela os
-- campos que só existiam nas antigas (imagens e NCM).
