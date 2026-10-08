-- Ficha clonada: guarda a referência de origem para achar o desenho original.
-- Só aparece dentro da ficha (aviso interno), nunca no PDF.
ALTER TABLE fichas_tecnicas ADD COLUMN IF NOT EXISTS clonada_de TEXT;
