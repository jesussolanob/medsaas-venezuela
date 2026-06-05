/**
 * GET /api/integrations/google/callback
 *
 * ETAPA 2 — NOT IMPLEMENTED.
 * The Google OAuth2 callback flow requires persisting the refresh token in the
 * NestJS backend (doctor profile). Deferred to Etapa 2.
 *
 * All requests are redirected to /doctor so no broken page is shown.
 */
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const origin = new URL(req.url).origin;
  return NextResponse.redirect(`${origin}/doctor`);
}
