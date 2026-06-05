/**
 * POST /api/doctor/subscription/checkout
 *
 * ETAPA 2 — NOT IMPLEMENTED.
 * Payment receipt upload (Supabase Storage → NestJS storage module) and
 * subscription_payments table management are deferred to Etapa 2.
 *
 * Callers receive a clear 501 so the UI can show a "próximamente" message.
 */
import { NextResponse } from 'next/server';

export async function POST(): Promise<NextResponse> {
  return NextResponse.json(
    { error: 'Pago de suscripción disponible próximamente', code: 'NOT_IMPLEMENTED' },
    { status: 501 },
  );
}
