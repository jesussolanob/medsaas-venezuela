/**
 * POST /api/doctor/team-meetings
 *
 * Thin-proxy → NestJS POST /api/doctor/team-meetings
 * Books a team meeting at the given date/time.
 * Body: { date: 'YYYY-MM-DD', time: 'HH:MM' }
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import { backendPost } from '@/lib/api-client.server';
import { BookTeamMeetingDtoSchema } from '@delta/shared-types';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const guard = await requireRole(['doctor']);
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  const parsed = BookTeamMeetingDtoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' },
      { status: 422 },
    );
  }

  const result = await backendPost<unknown>('/api/doctor/team-meetings', parsed.data);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }
  return NextResponse.json({ success: true, data: result.value }, { status: 201 });
}
