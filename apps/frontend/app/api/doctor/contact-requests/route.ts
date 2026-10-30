/**
 * /api/doctor/contact-requests
 *
 * POST → NestJS POST /api/doctor/contact-requests
 *   Body: { channel: 'call_now'|'whatsapp'|'call'|'email', message?: string|null }
 *   Returns: { id, channel, status, createdAt, updatedAt }
 *   Errors (forwarded from backend):
 *     422 CALL_NOW_OUTSIDE_SUPPORT_HOURS
 *     429 CONTACT_REQUEST_RATE_LIMITED
 */
import { NextRequest, NextResponse } from 'next/server';
import { backendPost } from '@/lib/api-client.server';
import { requireRole } from '@/lib/auth-guards';
import { CreateContactRequestDtoSchema } from '@delta/shared-types';

export const dynamic = 'force-dynamic';

interface ContactRequestResponse {
  id: string;
  channel: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export async function POST(req: NextRequest) {
  const guard = await requireRole(['doctor', 'assistant']);
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  const parsed = CreateContactRequestDtoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' },
      { status: 422 },
    );
  }

  const result = await backendPost<ContactRequestResponse>(
    '/api/doctor/contact-requests',
    parsed.data,
  );
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message, code: result.error.code },
      { status: result.error.status || 500 },
    );
  }
  return NextResponse.json({ success: true, data: result.value });
}
