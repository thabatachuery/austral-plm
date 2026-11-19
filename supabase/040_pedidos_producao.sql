-- =============================================
-- AUSTRAL PLM — Migration 040: Pedidos de produção vistos no Linx
--
-- A API do Linx só lista pedidos AINDA PENDENTES. Para saber quando a
-- produção foi entregue, o PLM guarda cada pedido de produção que já viu
-- (sincroniza ao abrir a aba Pré-Produção e no cron diário): quando o pedido
-- some da lista de pendentes, ganha entregue_em = data em que sumiu.
-- A data pode ser corrigida à mão (entregue_manual = true não é mais
-- sobrescrita pela sincronização). Pedido cancelado também some do Linx —
-- nesse caso apague a data à mão.
--
-- Rodar no SQL Editor do Supabase. Pode rodar mais de uma vez.
-- =============================================

CREATE TABLE IF NOT EXISTS pedidos_producao (
  ref                  TEXT NOT NULL,
  numero               TEXT NOT NULL,          -- sem zeros à esquerda
  data_programada      DATE,
  quantidade           NUMERIC DEFAULT 0,
  quantidade_pendente  NUMERIC DEFAULT 0,
  tipo                 TEXT DEFAULT '',
  fornecedor           TEXT DEFAULT '',
  cores                JSONB DEFAULT '[]',
  situacao             TEXT DEFAULT '',        -- EM ABERTO | PARCIAL | ENTREGUE
  visto_em             TIMESTAMPTZ DEFAULT now(),
  entregue_em          DATE,
  entregue_manual      BOOLEAN DEFAULT false,
  PRIMARY KEY (ref, numero)
);

ALTER TABLE pedidos_producao ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON pedidos_producao;
CREATE POLICY "authenticated_all" ON pedidos_producao FOR ALL TO authenticated USING (true) WITH CHECK (true);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'pedidos_producao'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE pedidos_producao;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
