-- 029 — Tecido da ficha volta a acompanhar o tecido do SKU
--
-- CONTEXTO: a ficha técnica avisa que "o tecido principal vem do SKU", mas
-- ficha_tecidos guarda o nome COPIADO no momento em que a ficha foi salva.
-- Nada reescrevia essa cópia: trocar o tecido em Desenvolvimento atualizava
-- produtos.tecido e mais nada. A ficha, o PDF, as variantes e a explosão de
-- custo seguiam mostrando o artigo antigo — foi o que apareceu na ref 23020004,
-- com "COTTON DOUBLE" no SKU e o tecido anterior na ficha.
--
-- O app já foi corrigido (updateProdutoFields propaga a troca na hora, e a
-- ficha realinha o Tec.01 na leitura). Esta migração conserta o que já estava
-- dessincronizado no banco e faz o rename de referência arrastar a ficha junto.

-- ── 1. Quantas fichas estão fora de sincronia hoje ──────────────────────────
DO $$
DECLARE
  fora INT;
BEGIN
  SELECT COUNT(*) INTO fora
  FROM (
    SELECT DISTINCT ON (ft.ficha_id) ft.artigo, f.produto_ref
      FROM ficha_tecidos ft
      JOIN fichas_tecnicas f ON f.id = ft.ficha_id
     ORDER BY ft.ficha_id, ft.id
  ) pr
  JOIN produtos p ON p.ref = pr.produto_ref
  WHERE COALESCE(p.tecido, '') <> '' AND pr.artigo IS DISTINCT FROM p.tecido;

  RAISE NOTICE 'Fichas com o Tec.01 diferente do tecido do SKU: %', fora;
END $$;

-- ── 2. Realinha o Tec.01 (1ª linha de tecido) de cada ficha ─────────────────
-- Só o artigo principal: as demais linhas de tecido e as cores são da ficha,
-- não do SKU, e ficam intactas. O preço acompanha o artigo e sai do cadastro,
-- igual ao que o seletor de tecido da ficha faz.
WITH principal AS (
  SELECT DISTINCT ON (ft.ficha_id) ft.id, ft.artigo, f.produto_ref
    FROM ficha_tecidos ft
    JOIN fichas_tecnicas f ON f.id = ft.ficha_id
   ORDER BY ft.ficha_id, ft.id
)
UPDATE ficha_tecidos ft
   SET artigo     = p.tecido,
       fornecedor = COALESCE(NULLIF(p.forn_tecido, ''), t.fornecedor, ''),
       preco      = COALESCE(t.preco, 0)
  FROM principal pr
  JOIN produtos p ON p.ref = pr.produto_ref
  LEFT JOIN tecidos t ON t.nome = p.tecido
 WHERE ft.id = pr.id
   AND COALESCE(p.tecido, '') <> ''
   AND pr.artigo IS DISTINCT FROM p.tecido;

-- ── 3. Ficha sem nenhuma linha de tecido nasce com o tecido do SKU ──────────
INSERT INTO ficha_tecidos (ficha_id, artigo, fornecedor, preco, cores)
SELECT f.id, p.tecido,
       COALESCE(NULLIF(p.forn_tecido, ''), t.fornecedor, ''),
       COALESCE(t.preco, 0), '{}'
  FROM fichas_tecnicas f
  JOIN produtos p ON p.ref = f.produto_ref
  LEFT JOIN tecidos t ON t.nome = p.tecido
 WHERE COALESCE(p.tecido, '') <> ''
   AND NOT EXISTS (SELECT 1 FROM ficha_tecidos ft WHERE ft.ficha_id = f.id);

-- ── 4. Renomear a referência arrasta ficha e controle de fluxo ──────────────
-- As duas FKs foram criadas só com ON DELETE CASCADE. Sem ON UPDATE CASCADE,
-- corrigir a referência de um SKU em Desenvolvimento é recusado pelo banco
-- (violação de chave estrangeira) e a alteração some sem explicação na tela.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fichas_tecnicas_produto_ref_fkey') THEN
    ALTER TABLE fichas_tecnicas DROP CONSTRAINT fichas_tecnicas_produto_ref_fkey;
  END IF;
  ALTER TABLE fichas_tecnicas
    ADD CONSTRAINT fichas_tecnicas_produto_ref_fkey
    FOREIGN KEY (produto_ref) REFERENCES produtos(ref) ON UPDATE CASCADE ON DELETE CASCADE;
END $$;

DO $$
DECLARE
  nome_fk TEXT;
BEGIN
  SELECT conname INTO nome_fk
    FROM pg_constraint
   WHERE conrelid = 'controle_fluxo'::regclass AND contype = 'f'
     AND pg_get_constraintdef(oid) LIKE '%REFERENCES produtos(ref)%';
  IF nome_fk IS NOT NULL THEN
    EXECUTE format('ALTER TABLE controle_fluxo DROP CONSTRAINT %I', nome_fk);
  END IF;
  ALTER TABLE controle_fluxo
    ADD CONSTRAINT controle_fluxo_produto_ref_fkey
    FOREIGN KEY (produto_ref) REFERENCES produtos(ref) ON UPDATE CASCADE ON DELETE CASCADE;
END $$;
