/**
 * GET /api/doctor/support-info
 *
 * Thin-proxy → NestJS GET /api/doctor/support-info
 * Returns: { whatsapp, callNowAvailable, supportHours }
 */
import { NextResponse } from 'next/server';
import { backendGet } from '@/lib/api-client.server';
import { requireRole } from '@/lib/auth-guards';

export const dynamic = 'force-dynamic';

interface SupportHours {
  days: number[];
  start: string;
  end: string;
  timezone: string;
}

interface SupportInfoResponse {
  whatsapp: string;
  callNowAvailable: boolean;
  supportHours: SupportHours;
}

export async function GET() {
  const guard = await requireRole(['doctor']);
  if (!guard.ok) return guard.response;

  const result = await backendGet<SupportInfoResponse>('/api/doctor/support-info');
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }
  return NextResponse.json({ success: true, data: result.value });
}
