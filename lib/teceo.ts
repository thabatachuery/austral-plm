import "server-only";

// Catálogo compartilhado da Teceo (link público "catálogo inverno 27"). A API
// não busca por código, então o catálogo inteiro (~300 itens, um por cor) é
// lido de 100 em 100 e guardado em memória por um tempo.
//
// Os ids abaixo são os do link compartilhado — o próprio site manda esses
// cabeçalhos para quem abre o link, sem login. Catálogo novo = trocar o
// CATALOGO_ID (é o uuid no fim do link).
const CATALOGO_ID = "0e552090-11df-423b-8c9a-00ce255a268e";
const HEADERS = {
  Accept: "application/json",
  "x-public-id": CATALOGO_ID,
  "x-team-id": "423cd1e1-9be0-4dc3-9171-a0176c47e6ea",
  "x-brand-id": "729a96b8-7200-466d-a407-8423c541b6d7",
};
const VALIDADE_MS = 30 * 60 * 1000;

export type TeceoCor = { cor: string; fotos: string[] };
let cache: { em: number; porRef: Map<string, TeceoCor[]> } | null = null;

export async function carregarCatalogoTeceo(): Promise<Map<string, TeceoCor[]>> {
  if (cache && Date.now() - cache.em < VALIDADE_MS) return cache.porRef;
  const porRef = new Map<string, TeceoCor[]>();
  for (let skip = 0; skip < 5000; skip += 100) {
    const r = await fetch(
      `https://api.app.teceo.co/catalogs/${CATALOGO_ID}/products?active=true&isAdminSeller=false&limit=100&skip=${skip}&order%5Bposition%5D=ASC`,
      { headers: HEADERS, cache: "no-store" },
    );
    if (!r.ok) throw new Error(`Teceo respondeu ${r.status}`);
    const pagina: any[] = await r.json();
    for (const { item } of pagina) {
      const ref = String(item?.code || "").trim();
      // Fotos na ordem do catálogo: a 1ª é a frente, a 2ª as costas.
      const fotos = [...(item?.medias || [])]
        .filter((m: any) => m.type === "IMAGE" && m.url)
        .sort((a: any, b: any) => a.position - b.position)
        .map((m: any) => m.url as string);
      if (!ref || !fotos.length) continue;
      const cor = (item.allColors || []).find((c: any) => c.productColorId === item.productColorId)?.name || "";
      porRef.set(ref, [...(porRef.get(ref) || []), { cor, fotos }]);
    }
    if (pagina.length < 100) break;
  }
  cache = { em: Date.now(), porRef };
  return porRef;
}

// O CDN gera uma versão "-lg.webp" (~200 KB, boa pra imprimir) da original
// (JPEG de ~2 MB), mas nem toda foto tem. Sem ela, vai a original.
export async function melhorVersaoTeceo(url: string | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    const r = await fetch(`${url}-lg.webp`, { method: "HEAD", cache: "no-store" });
    if (r.ok) return `${url}-lg.webp`;
  } catch {}
  return url;
}
