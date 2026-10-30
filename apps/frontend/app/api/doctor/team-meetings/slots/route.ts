/**
 * GET /api/doctor/team-meetings/slots?days=14
 *
 * Thin-proxy → NestJS GET /api/doctor/team-meetings/slots
 * Returns available booking slots for the next N days.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import { backendGet } from '@/lib/api-client.server';

export const dynamic = 'force-dynamic';

export interface SlotDay {
  date: string;
  slots: string[];
}

export interface SlotsResponse {
  usesGenericHours: boolean;
  days: SlotDay[];
}

export async function GET(req: NextRequest) {
  const guard = await requireRole(['doctor']);
  if (!guard.ok) return guard.response;

  const days = req.nextUrl.searchParams.get('days') ?? '14';
  const result = await backendGet<SlotsResponse>(
    `/api/doctor/team-meetings/slots?days=${encodeURIComponent(days)}`,
  );
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }
  return NextResponse.json({ success: true, data: result.value });
}
