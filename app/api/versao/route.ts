import { NextResponse } from "next/server";

// Versão do deploy que está no ar. O app compara isso com a versão que estava
// no ar quando a aba foi carregada: se mudou, o JavaScript aberto no navegador
// é antigo e a pessoa precisa recarregar (ver AvisoVersao.tsx).
//
// Nunca pode ser cacheado, senão o aviso nunca aparece.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const versao =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.VERCEL_DEPLOYMENT_ID ||
    "local";
  return NextResponse.json(
    { versao },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } },
  );
}
