import { NextResponse } from 'next/server';

/**
 * GET /auth/callback — callback de OAuth (Google).
 *
 * ETAPA 1: el login social/OAuth es un bloqueante (Auth0 — Fase 4). Sin Supabase no
 * hay intercambio de código por sesión, por lo que este callback redirige al login.
 * Cuando se integre Auth0, aquí se validará el código y se establecerá la sesión.
 */
export function GET(request: Request): NextResponse {
  const { origin } = new URL(request.url);
  return NextResponse.redirect(`${origin}/login`);
}
