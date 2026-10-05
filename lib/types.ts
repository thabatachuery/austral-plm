// Tipos que espelham as tabelas do Supabase.
// Depois de rodar `npm run db:types` isso é gerado automaticamente.
// Por enquanto, definimos manualmente para o PLM funcionar.

export type Produto = {
  id: number;
  ref: string;
  desc: string;
  tecido: string;
  composicao: string;
  forn_tecido: string;
  status: string;
  colecao: string;
  grupo: string;
  subgrupo: string;
  operacao: string;
  fornecedor: string;
  grade: string;
  cor: string;
  categoria: string;
  subcategoria: string;
  lavagem: string;
  tipo: string;
  linha: string;
  drop: string;
  estilista: string;
  custo_forn: number;
  custo_total: number;
  mkp: number;
  created_at: string;
  updated_at: string;
};

export type Tecido = {
  id: number;
  nome: string;
  fornecedor: string;
  composicao: string;
  preco: number | null;
};

export type Aviamento = {
  id: number;
  codigo: string;
  nome: string;
  preco: number;
};

export type FichaTecnica = {
  id: number;
  produto_ref: string;
  tabela_medidas: string;
  observacoes: string;
  created_at: string;
};

export type FichaTecido = {
  id: number;
  ficha_id: number;
  artigo: string;
  fornecedor: string;
  preco: number;
  cores: string[]; // array de nomes de cor por variante
  localizacao: string; // onde o tecido entra na peça (CORPO, FORRO…)
};

export type FichaAviamento = {
  id: number;
  ficha_id: number;
  item: string;
  codigo: string;
  qtd: number;
  valor: number;
  localizacao: string;
};

export type FichaPilotagem = {
  id: number;
  ficha_id: number;
  num: string;
  lacre: string;
  data_envio: string | null;
  data_recebimento: string | null;
  data_prova: string | null;
  status: string;
};

// Tipo genérico para cadastros auxiliares (grupo, subgrupo, cor, etc.)
export type CadastroItem = {
  id: number;
  nome: string;
  tabela: string; // ex: "grupo", "subgrupo", "cor"
};
