/**
 * POST /api/doctor/calendar-sync
 *
 * ETAPA 2 — NOT IMPLEMENTED.
 * Google Calendar bidirectional sync (OAuth2 refresh token, GCal event CRUD,
 * meet-link generation, appointment cascade import) requires the NestJS
 * integrations module. Deferred to Etapa 2.
 *
 * Callers receive a clear 501 so the UI can show a "próximamente" message.
 */
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(): Promise<NextResponse> {
  return NextResponse.json(
    { error: 'Sincronización con Google Calendar disponible próximamente', code: 'NOT_IMPLEMENTED' },
    { status: 501 },
  );
}
