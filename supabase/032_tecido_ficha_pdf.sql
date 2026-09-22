-- ═══════════════════════════════════════════════════════════════════════
-- PDF da ficha técnica do tecido no cadastro.
--
-- O fornecedor manda a ficha do artigo em PDF (composição, gramatura,
-- testes, certificações). Até agora isso vivia em e-mail e pasta de rede;
-- aqui fica preso ao tecido, onde quem monta a ficha da peça vai procurar.
--
-- Guarda só a URL pública do arquivo no bucket "fichas-imagens" — mesmo
-- padrão da coluna "imagem".
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE tecidos ADD COLUMN IF NOT EXISTS ficha_pdf TEXT;
