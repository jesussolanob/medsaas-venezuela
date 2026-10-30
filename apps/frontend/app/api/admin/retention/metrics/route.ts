/**
 * GET /api/admin/retention/metrics?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Thin-proxy → NestJS GET /api/admin/retention/metrics
 *
 * Returns aggregate retention metrics for the given Caracas-calendar-day range.
 * Both dates are inclusive.
 *
 * Query params:
 *   from — YYYY-MM-DD (required)
 *   to   — YYYY-MM-DD (required)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth-guards';
import { backendGet } from '@/lib/api-client.server';

export const dynamic = 'force-dynamic';

export interface RetentionMetrics {
  invitePreSent: number;
  inviteExpiredSent: number;
  inviteClicks: number;
  meetingsScheduledFromEmail: number;
  meetingsScheduledFromModal: number;
  meetingsDone: number;
  meetingsNoShow: number;
  graceMonthsGranted: number;
  contactRequestsPending: number;
  contactRequestsContacted: number;
  contactRequestsResolved: number;
  doctorsReturned: number;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const from = req.nextUrl.searchParams.get('from') ?? '';
  const to = req.nextUrl.searchParams.get('to') ?? '';

  if (!from || !DATE_RE.test(from) || !to || !DATE_RE.test(to)) {
    return NextResponse.json(
      { error: 'Los parámetros from y to son obligatorios (formato YYYY-MM-DD).' },
      { status: 400 },
    );
  }

  const result = await backendGet<RetentionMetrics>(
    `/api/admin/retention/metrics?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }

  return NextResponse.json({ success: true, data: result.value });
}
