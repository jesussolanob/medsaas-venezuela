/**
 * /api/seller/specialist-invitations — thin-proxy to the backend `sellers` module.
 *
 * POST → the authenticated seller pre-registers (invites) a specialist. The backend
 * sets `sold_by` from the session, creates the profile with the personal data step
 * already done (onboarding starts at the office) and emails the invitation to log in.
 * Validation lives in the backend Zod schema; here we only forward the fields.
 */
import { NextRequest, NextResponse } from 'next/server';
import { backendPost } from '@/lib/api-client.server';

export const dynamic = 'force-dynamic';

interface InvitationBody {
  firstName?: string;
  lastName?: string;
  cedula?: string;
  phone?: string;
  email?: string;
  specialty?: string;
}

const trimmed = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: InvitationBody;
  try {
    body = (await req.json()) as InvitationBody;
  } catch {
    return NextResponse.json({ error: 'Solicitud inválida', code: 'BAD_REQUEST' }, { status: 400 });
  }

  const payload = {
    first_name: trimmed(body.firstName),
    last_name: trimmed(body.lastName),
    cedula: trimmed(body.cedula).toUpperCase(),
    phone: trimmed(body.phone),
    email: trimmed(body.email).toLowerCase(),
    specialty: trimmed(body.specialty),
  };

  if (Object.values(payload).some((v) => !v)) {
    return NextResponse.json(
      { error: 'Completa todos los campos para enviar la invitación.', code: 'BAD_REQUEST' },
      { status: 400 },
    );
  }

  const result = await backendPost<{ invitationEmailSent?: boolean }>(
    '/api/seller/specialist-invitations',
    payload,
  );

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message, code: result.error.code },
      { status: result.error.status ?? 502 },
    );
  }

  return NextResponse.json({ success: true, data: result.value });
}
