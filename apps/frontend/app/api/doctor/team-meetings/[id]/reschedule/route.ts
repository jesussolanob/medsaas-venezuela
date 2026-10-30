/**
 * PATCH /api/doctor/team-meetings/[id]/reschedule
 *
 * Thin-proxy → NestJS PATCH /api/doctor/team-meetings/:id/reschedule
 * Reschedules the meeting to a new date/time.
 * Body: { date: 'YYYY-MM-DD', time: 'HH:MM' }
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import { backendPatch } from '@/lib/api-client.server';
import { BookTeamMeetingDtoSchema } from '@delta/shared-types';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireRole(['doctor']);
  if (!guard.ok) return guard.response;

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

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

  const result = await backendPatch<unknown>(
    `/api/doctor/team-meetings/${id}/reschedule`,
    parsed.data,
  );
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }
  return NextResponse.json({ success: true, data: result.value });
}
