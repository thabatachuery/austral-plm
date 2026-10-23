import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Security headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Content Security Policy — permite assets locais e Supabase
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Next.js necessita unsafe-inline para HMR em dev
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://notcdmsqbbtuhsgtupck.supabase.co https://austral.vteximg.com.br https://austral.vtexassets.com https://d22oza65jfl1r0.cloudfront.net", // Bucket Supabase + fotos do site VTEX + catálogo Teceo
    "font-src 'self' data:",
    "connect-src 'self' https://notcdmsqbbtuhsgtupck.supabase.co wss://notcdmsqbbtuhsgtupck.supabase.co",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; ');

  response.headers.set('Content-Security-Policy', csp);

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
