-- ═══════════════════════════════════════════════════════════════════════
-- Kanban de etapas (aba "Fluxo"): cada ref é um card que anda por 19 etapas.
--
-- A etapa atual fica no próprio controle_fluxo, para que o kanban e a tabela
-- do Controle de Fluxo sejam o mesmo dado: mover o card também preenche as
-- datas da tabela (data entrega piloto, data prova, entrega mostruário...).
--
-- O histórico de cada movimento (quem, quando, de qual ciclo) fica em
-- fluxo_eventos — é dele que saem as datas de cada etapa e o tempo médio
-- parado em cada uma.
--
-- RLS desabilitada como o resto do schema (ver 013/015): o Supabase deste
-- projeto liga RLS sozinho em tabela nova e isso bloquearia o app.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE controle_fluxo
  ADD COLUMN IF NOT EXISTS etapa        INTEGER,
  ADD COLUMN IF NOT EXISTS ciclo        INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS etapa_desde  DATE,
  -- previsões, cores de mostruário entregues, data de entrega da
  -- pré-produção e pedidos do Linx já vistos (para detectar pedido novo)
  ADD COLUMN IF NOT EXISTS fluxo_meta   JSONB DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS fluxo_eventos (
  id          BIGSERIAL PRIMARY KEY,
  produto_ref TEXT NOT NULL REFERENCES produtos(ref) ON DELETE CASCADE ON UPDATE CASCADE,
  etapa       INTEGER NOT NULL,
  ciclo       INTEGER NOT NULL DEFAULT 1,
  data        DATE NOT NULL,
  por         TEXT DEFAULT '',
  auto        BOOLEAN DEFAULT false,
  obs         TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fluxo_eventos_ref ON fluxo_eventos(produto_ref);

ALTER TABLE fluxo_eventos DISABLE ROW LEVEL SECURITY;

-- Realtime: quem está com o quadro aberto vê o card andar na hora.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'fluxo_eventos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE fluxo_eventos;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
