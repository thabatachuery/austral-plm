// Imagens dos mapas (coleção e entregas) nos modos Desenho e Foto.
//
// Modo foto: foto anexada na ficha (frente/costas) → foto do produto no site
// da Austral / catálogo Teceo (/api/foto-produto) → foto de modelo → desenho.
// Como só dá pra saber se o site tem a foto tentando carregar, cada posição
// é uma lista de candidatas, tentadas em ordem.

export type ModoImagem = "desenho" | "foto";

// proxy: devolve os bytes pela própria API em vez de redirecionar pro CDN —
// o PDF desenha a imagem num canvas e o CDN externo não libera CORS.
export const urlFotoSite = (ref: string, proxy = false) =>
  `/api/foto-produto?ref=${encodeURIComponent(ref)}${proxy ? "&proxy=1" : ""}`;

// Cada item do retorno é uma posição (1 ou 2 imagens lado a lado) com suas
// candidatas em ordem de preferência.
export function imagensDoMapa(item: any, modo: ModoImagem, proxy = false): string[][] {
  if (modo === "desenho") return item.imagem_url ? [[item.imagem_url]] : [];
  if (item.imagem_frente && item.imagem_costas) return [[item.imagem_frente], [item.imagem_costas]];
  const cands = [
    item.imagem_frente,
    item.ref ? urlFotoSite(String(item.ref), proxy) : null,
    item.imagem_modelo,
    item.imagem_url,
  ].filter(Boolean) as string[];
  return cands.length ? [cands] : [];
}
