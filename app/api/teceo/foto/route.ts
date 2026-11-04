import { NextResponse } from "next/server";
import { carregarCatalogoTeceo, melhorVersaoTeceo } from "@/lib/teceo";

// Foto do produto para a ficha de liberação, tirada do catálogo compartilhado
// da Teceo (ver lib/teceo.ts).
export async function GET(req: Request) {
  const ref = new URL(req.url).searchParams.get("ref")?.trim();
  if (!ref) return NextResponse.json({ error: "ref obrigatória" }, { status: 400 });
  try {
    const cores = (await carregarCatalogoTeceo()).get(ref) || [];
    if (!cores.length) return NextResponse.json({ frente: null, costas: null, cor: null });
    // Mais de uma cor: qualquer uma serve (pedido da usuária) — entre as que
    // têm frente e costas, se houver; tem cor com uma foto só no catálogo.
    const completas = cores.filter(c => c.fotos.length >= 2);
    const opcoes = completas.length ? completas : cores;
    const { cor, fotos } = opcoes[Math.floor(Math.random() * opcoes.length)];
    const [frente, costas] = await Promise.all([melhorVersaoTeceo(fotos[0]), melhorVersaoTeceo(fotos[1])]);
    return NextResponse.json({ frente, costas, cor });
  } catch (e: any) {
    console.error("teceo/foto:", e?.message || e);
    return NextResponse.json({ error: "Catálogo Teceo indisponível" }, { status: 502 });
  }
}
