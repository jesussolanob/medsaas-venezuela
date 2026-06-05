/**
 * GET /api/doctor/subscription/receipt/:id
 *
 * ETAPA 2 — NOT IMPLEMENTED.
 * Payment receipt download from storage and subscription_payments lookup are
 * deferred to Etapa 2 (NestJS billing + storage modules).
 *
 * Callers receive a clear 501 so the UI can show a "próximamente" message.
 */
import { NextResponse } from 'next/server';

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { error: 'Visualización de comprobantes disponible próximamente', code: 'NOT_IMPLEMENTED' },
    { status: 501 },
  );
}
