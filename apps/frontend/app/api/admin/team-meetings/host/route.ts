/**
 * GET  /api/admin/team-meetings/host — get the configured host profile
 * PUT  /api/admin/team-meetings/host — set the host profile (body: { profileId })
 *
 * Thin-proxy → NestJS GET/PUT /api/admin/team-meetings/host
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth-guards';
import { backendGet, backendPut } from '@/lib/api-client.server';
import { AdminUpdateTeamMeetingHostDtoSchema } from '@delta/shared-types';

export const dynamic = 'force-dynamic';

export interface MeetingHost {
  profileId: string | null;
  fullName: string | null;
  email: string | null;
  googleConnected: boolean;
}

export async function GET() {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const result = await backendGet<MeetingHost>('/api/admin/team-meetings/host');
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }
  return NextResponse.json({ success: true, data: result.value });
}

export async function PUT(req: NextRequest) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  const parsed = AdminUpdateTeamMeetingHostDtoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' },
      { status: 422 },
    );
  }

  const result = await backendPut<null>('/api/admin/team-meetings/host', parsed.data);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }
  return NextResponse.json({ success: true, data: null });
}
