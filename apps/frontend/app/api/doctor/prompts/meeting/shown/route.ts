/**
 * POST /api/doctor/prompts/meeting/shown
 *
 * Thin-proxy → NestJS POST /api/doctor/prompts/meeting/shown
 * Increments shown_count for the meeting_modal prompt.
 */
import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import { backendPost } from '@/lib/api-client.server';

export const dynamic = 'force-dynamic';

export async function POST() {
  const guard = await requireRole(['doctor']);
  if (!guard.ok) return guard.response;

  const result = await backendPost<{ id: string; shownCount: number }>(
    '/api/doctor/prompts/meeting/shown',
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
