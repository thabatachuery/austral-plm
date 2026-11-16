-- 038: fecha o banco para quem não está logado.
--
-- Antes desta migration, a chave pública (anon), que vai junto no site,
-- lia produtos, fichas, envios (com os tokens dos links de fornecedor),
-- alertas e o fluxo sem login — e escrevia nas tabelas com RLS desligado
-- (013, 015, 033, 037 desligaram de propósito).
--
-- Para QUEM ESTÁ LOGADO nada muda:
--   • tabela que estava com RLS desligado ganha uma política "libera tudo"
--     só para authenticated (mesmo comportamento de antes, inclusive DELETE);
--   • política que valia para public/anon passa a valer só para authenticated.
--
-- Fora do app:
--   • a página pública /envio/<token> lê com a service role no servidor —
--     continua funcionando;
--   • o script do Illustrator (illustrator/plm-upload.ps1) precisa da versão
--     que faz login logo de início — reinstale nas máquinas ANTES de rodar isto;
--   • fotos do bucket público continuam abrindo pela URL /object/public/.
--
-- Rodar no SQL Editor do Supabase. Pode rodar mais de uma vez.

DO $$
DECLARE
  r RECORD;
  p RECORD;
BEGIN
  -- 1. Tabelas com RLS desligado: troca qualquer política antiga por
  --    "libera tudo para logado" e liga o RLS.
  FOR r IN
    SELECT c.relname AS tabela
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
  LOOP
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = r.tabela LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, r.tabela);
    END LOOP;
    EXECUTE format('CREATE POLICY "authenticated_all" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', r.tabela);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tabela);
    RAISE NOTICE 'RLS ligado em %', r.tabela;
  END LOOP;

  -- 2. Políticas que valiam para public/anon passam a valer só para logado.
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname IN ('public', 'storage')
      AND (roles && ARRAY['public', 'anon']::name[])
  LOOP
    BEGIN
      EXECUTE format('ALTER POLICY %I ON %I.%I TO authenticated', r.policyname, r.schemaname, r.tablename);
      RAISE NOTICE 'Política % em %.% agora só para authenticated', r.policyname, r.schemaname, r.tablename;
    EXCEPTION WHEN insufficient_privilege THEN
      -- storage.objects pode pertencer a outro papel no Supabase: aí ajustar
      -- em Storage > Policies no painel (a consulta final lista o que sobrou).
      RAISE NOTICE 'Sem permissão para alterar % em %.% — ajustar pelo painel', r.policyname, r.schemaname, r.tablename;
    END;
  END LOOP;
END $$;

-- Conferência: as duas consultas abaixo devem voltar VAZIAS.
SELECT c.relname AS tabela_sem_rls
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;

SELECT schemaname, tablename, policyname, roles AS politica_ainda_aberta
FROM pg_policies
WHERE schemaname IN ('public', 'storage') AND (roles && ARRAY['public', 'anon']::name[]);
