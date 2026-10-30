/**
 * GET /api/doctor/contact-requests/current
 *
 * Thin-proxy → NestJS GET /api/doctor/contact-requests/current
 * Returns the pending contact request for the authenticated doctor, or null.
 */
import { NextResponse } from 'next/server';
import { backendGet } from '@/lib/api-client.server';
import { requireRole } from '@/lib/auth-guards';

export const dynamic = 'force-dynamic';

interface ContactRequestCurrent {
  id: string;
  channel: string;
  message: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export async function GET() {
  const guard = await requireRole(['doctor', 'assistant']);
  if (!guard.ok) return guard.response;

  const result = await backendGet<ContactRequestCurrent | null>(
    '/api/doctor/contact-requests/current',
  );
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }
  return NextResponse.json({ success: true, data: result.value });
}
