-- 041: registro dos e-mails de pré-produção (cobrar 15 dias / recebida /
-- urgente 5 dias), para cada pedido ser avisado uma vez por aviso.
-- Data de entrega remarcada = aviso novo.
CREATE TABLE IF NOT EXISTS avisos_pre_email (
  tipo         TEXT NOT NULL,          -- cobrar | urgente | recebida
  ref          TEXT NOT NULL,
  numero       TEXT NOT NULL DEFAULT '',
  data_entrega DATE NOT NULL,
  enviado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tipo, ref, numero, data_entrega)
);

ALTER TABLE avisos_pre_email ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authenticated_all ON avisos_pre_email;
CREATE POLICY authenticated_all ON avisos_pre_email FOR ALL TO authenticated USING (true) WITH CHECK (true);
