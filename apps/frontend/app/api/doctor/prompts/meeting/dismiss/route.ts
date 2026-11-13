/**
 * POST /api/doctor/prompts/meeting/dismiss
 *
 * Thin-proxy → NestJS POST /api/doctor/prompts/meeting/dismiss
 * Permanently dismisses the meeting_modal prompt ("No me interesa").
 */
import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import { backendPost } from '@/lib/api-client.server';

export const dynamic = 'force-dynamic';

export async function POST() {
  const guard = await requireRole(['doctor']);
  if (!guard.ok) return guard.response;

  const result = await backendPost<{ id: string; dismissedAt: string }>(
    '/api/doctor/prompts/meeting/dismiss',
    {},
  );
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }
  return NextResponse.json({ success: true, data: result.value });
}
