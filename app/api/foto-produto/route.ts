import { NextResponse } from "next/server";
import { carregarCatalogoTeceo, melhorVersaoTeceo } from "@/lib/teceo";

// GET /api/foto-produto?ref=21080008[&cor=C02][&tam=g]   (tam=g: versão grande)
// Redireciona para a foto de frente do produto — feito para usar direto em
// <img src>. Procura no site da Austral (VTEX, que tem quase todo o catálogo e
// devolve a foto já reduzida) e, se não achar, no catálogo da Teceo.
// Sem foto: 404 (a tela mostra o quadro vazio).
const VTEX_BASE = process.env.VTEX_BASE_URL || "https://austral.vtexcommercestable.com.br";
const VALIDADE_MS = 6 * 60 * 60 * 1000;
const cache = new Map<string, { em: number; url: string | null }>();

// ".../arquivos/ids/237244/foto.jpg" -> ".../arquivos/ids/237244-300-400/foto.jpg"
const reduzirVtex = (url: string, grande: boolean) => url.replace(/\/ids\/(\d+)\//, grande ? "/ids/$1-750-1000/" : "/ids/$1-300-400/");

async function fotoVtex(ref: string, cor: string, grande: boolean): Promise<string | null> {
  const r = await fetch(`${VTEX_BASE}/api/catalog_system/pub/products/search/${encodeURIComponent(ref)}`, { cache: "no-store" });
  if (!r.ok) return null;
  const arr = await r.json().catch(() => []);
  if (!Array.isArray(arr)) return null;
  // productReference vem como "<ref>_<cor>"; a busca por texto pode trazer
  // outros produtos, então só vale o que começa com a ref.
  const daRef = arr.filter((p: any) => String(p?.productReference || "").split("_")[0] === ref);
  const daCor = cor ? daRef.filter((p: any) => String(p.productReference).split("_")[1] === cor) : [];
  for (const p of [...daCor, ...daRef]) {
    const url = p?.items?.[0]?.images?.[0]?.imageUrl;
    if (url) return reduzirVtex(url, grande);
  }
  return null;
}

async function fotoTeceo(ref: string): Promise<string | null> {
  // Primeira cor cuja foto abre (o CDN recusa algumas — ver lib/teceo.ts).
  for (const c of (await carregarCatalogoTeceo()).get(ref) || []) {
    const url = await melhorVersaoTeceo(c.fotos[0]);
    if (url) return url;
  }
  return null;
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const ref = params.get("ref")?.trim() || "";
  const cor = params.get("cor")?.trim() || "";
  const grande = params.get("tam") === "g";
  if (!ref) return NextResponse.json({ error: "ref obrigatória" }, { status: 400 });

  const chave = `${ref}|${cor}|${grande ? "g" : "p"}`;
  let item = cache.get(chave);
  if (!item || Date.now() - item.em > VALIDADE_MS) {
    let url: string | null = null;
    try { url = await fotoVtex(ref, cor, grande); } catch {}
    if (!url) { try { url = await fotoTeceo(ref); } catch {} }
    item = { em: Date.now(), url };
    cache.set(chave, item);
  }

  if (!item.url) return new NextResponse(null, { status: 404, headers: { "Cache-Control": "public, max-age=3600" } });
  return NextResponse.redirect(item.url, { status: 302, headers: { "Cache-Control": "public, max-age=21600" } });
}
