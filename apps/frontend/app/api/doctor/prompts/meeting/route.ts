/**
 * GET /api/doctor/prompts/meeting
 *
 * Thin-proxy → NestJS GET /api/doctor/prompts/meeting
 * Returns: { show: boolean, source: 'email' | 'modal' | null }
 */
import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import { backendGet } from '@/lib/api-client.server';
import type { MeetingPromptStatusOutput } from '@delta/shared-types';

export const dynamic = 'force-dynamic';

export async function GET() {
  const guard = await requireRole(['doctor']);
  if (!guard.ok) return guard.response;

  const result = await backendGet<MeetingPromptStatusOutput>('/api/doctor/prompts/meeting');
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }
  return NextResponse.json({ success: true, data: result.value });
}
