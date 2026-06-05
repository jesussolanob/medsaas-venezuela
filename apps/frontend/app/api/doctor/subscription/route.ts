/**
 * GET /api/doctor/subscription
 *
 * ETAPA 2 — NOT IMPLEMENTED.
 * Subscription state (profile plan/status, payment history, duration options)
 * will be served by the NestJS billing module once implemented.
 * The previous implementation queried Supabase directly via createAdminClient
 * and lib/subscription (which also uses Supabase) — both removed here.
 *
 * Callers receive a clear 501 so the UI can show a "próximamente" message.
 */
import { NextResponse } from 'next/server';

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { error: 'Gestión de suscripción disponible próximamente', code: 'NOT_IMPLEMENTED' },
    { status: 501 },
  );
}
