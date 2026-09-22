-- ═══════════════════════════════════════════════════════════════════════
-- Envios de ficha para fornecedor, com histórico.
--
-- Hoje isso vive no OneDrive: exporta o PDF, sobe numa pasta
-- Coleção/Estágio/Fornecedor e compartilha o link da pasta. Funciona para
-- entregar, mas não deixa histórico consultável — não dá para perguntar ao
-- OneDrive "a ficha da 23090002 chegou a ir para a Pandora na Verão 28?".
--
-- Aqui cada envio é um pacote (coleção + estágio + fornecedor) com N
-- arquivos. O token é o que o fornecedor recebe: abre a página do pacote em
-- /envio/<token> sem login, lista os PDFs e baixa.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS envios (
  id BIGSERIAL PRIMARY KEY,
  -- Aleatório e longo: é a única credencial do link. Sem ele a página não abre.
  token TEXT NOT NULL UNIQUE,
  colecao TEXT NOT NULL,
  estagio TEXT NOT NULL,              -- DESENVOLVIMENTO | MOSTRUÁRIO | PRODUÇÃO
  fornecedor TEXT NOT NULL,
  observacao TEXT DEFAULT '',
  -- Desativar em vez de apagar: o histórico continua valendo mesmo depois de
  -- o link ser revogado.
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_por_nome TEXT NOT NULL DEFAULT '',
  criado_por_user_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS envio_arquivos (
  id BIGSERIAL PRIMARY KEY,
  envio_id BIGINT NOT NULL REFERENCES envios(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  url TEXT NOT NULL,
  tamanho BIGINT DEFAULT 0,
  -- Referências que o PDF cobre. É o que faz o histórico responder por SKU,
  -- e não só por pasta.
  refs TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_envios_token ON envios(token);
CREATE INDEX IF NOT EXISTS idx_envios_filtro ON envios(colecao, estagio, fornecedor);
CREATE INDEX IF NOT EXISTS idx_envio_arquivos_envio ON envio_arquivos(envio_id);
CREATE INDEX IF NOT EXISTS idx_envio_arquivos_refs ON envio_arquivos USING GIN(refs);

-- Mesma postura do resto do schema (ver 013): o Supabase liga RLS sozinho em
-- tabela nova, o que bloquearia o app.
ALTER TABLE envios DISABLE ROW LEVEL SECURITY;
ALTER TABLE envio_arquivos DISABLE ROW LEVEL SECURITY;
