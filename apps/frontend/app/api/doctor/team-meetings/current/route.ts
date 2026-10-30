/**
 * GET /api/doctor/team-meetings/current
 *
 * Thin-proxy → NestJS GET /api/doctor/team-meetings/current
 * Returns the doctor's current scheduled team meeting, or null if none.
 */
import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import { backendGet } from '@/lib/api-client.server';

export const dynamic = 'force-dynamic';

export interface CurrentMeeting {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  meetingUrl: string | null;
  source: string;
}

export async function GET() {
  const guard = await requireRole(['doctor']);
  if (!guard.ok) return guard.response;

  const result = await backendGet<CurrentMeeting | null>('/api/doctor/team-meetings/current');
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }
  return NextResponse.json({ success: true, data: result.value });
}
