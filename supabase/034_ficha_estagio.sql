-- ═══════════════════════════════════════════════════════════════════════
-- Estágio da ficha escolhido à mão: DESENVOLVIMENTO | MOSTRUÁRIO | PRODUÇÃO.
--
-- Até agora o estágio era DEDUZIDO do status do SKU (ver fichaType em
-- FichaPDF): status com "PRODUÇÃO" pintava a ficha de verde, com "MOSTRUÁRIO"
-- de amarelo. Deduzir dava errado — aprovar uma prova de mostruário mandava o
-- SKU para "PRODUÇÃO LIBERADA" e a ficha saía verde, pulando a etapa amarela.
--
-- Com o campo explícito, quem monta a ficha diz o que ela é, e tanto a tarja
-- do PDF quanto o status automático da liberação seguem essa escolha.
--
-- Nulo = comportamento antigo (deduz do status do SKU), então as 151 fichas
-- que já existem não mudam de aparência até alguém escolher.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE fichas_tecnicas ADD COLUMN IF NOT EXISTS estagio TEXT;
