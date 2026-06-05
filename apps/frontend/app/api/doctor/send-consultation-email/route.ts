/**
 * POST /api/doctor/send-consultation-email
 *
 * ETAPA 2 — NOT IMPLEMENTED.
 * Transactional email delivery (Resend/SendGrid) is deferred to Etapa 2.
 * The previous implementation stored the notification in Supabase patient_messages
 * as a temporary workaround; that Supabase dependency is removed here.
 *
 * Callers receive a clear 501 so the UI can show a "próximamente" message.
 */
import { NextResponse } from 'next/server';

export async function POST(): Promise<NextResponse> {
  return NextResponse.json(
    { error: 'Envío de correo disponible próximamente', code: 'NOT_IMPLEMENTED' },
    { status: 501 },
  );
}
