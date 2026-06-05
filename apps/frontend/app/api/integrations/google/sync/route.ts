/**
 * POST /api/integrations/google/sync
 *
 * ETAPA 2 — NOT IMPLEMENTED.
 * Google Calendar event creation (OAuth2 refresh token flow) requires the
 * NestJS integrations module and the doctor's persisted refresh token.
 * Deferred to Etapa 2.
 *
 * Callers receive a clear 501 so the UI can show a "próximamente" message.
 */
import { NextResponse } from 'next/server';

export async function POST(): Promise<NextResponse> {
  return NextResponse.json(
    { error: 'Sincronización con Google Calendar disponible próximamente', code: 'NOT_IMPLEMENTED' },
    { status: 501 },
  );
}
