/**
 * GET /api/booking/:doctorId/offices
 *
 * Thin public proxy to the NestJS backend `GET /api/booking/:doctorId/offices`.
 *
 * WHY THIS EXISTS: Client components (AgendarTokenClient, etc.) cannot reach the
 * internal BACKEND_INTERNAL_URL. This same-origin proxy makes the offices
 * endpoint reachable from the browser.
 *
 * Backend responde: { success: true, data: DoctorOfficeRaw[] }
 * Devolvemos: { offices: DoctorOfficeRaw[] } (desenvuelto)
 */

import { NextRequest, NextResponse } from 'next/server';
import { reportError } from '@/lib/report-error';

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:3001';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ doctorId: string }> },
): Promise<NextResponse> {
  const { doctorId } = await params;

  if (!UUID_RE.test(doctorId)) {
    return NextResponse.json({ offices: [] }, { status: 200 });
  }

  try {
    const res = await fetch(`${BACKEND_URL}/api/booking/${encodeURIComponent(doctorId)}/offices`, {
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      return NextResponse.json({ offices: [] }, { status: 200 });
    }

    const json = (await res.json()) as { success?: boolean; data?: unknown[] };
    const offices = json?.data ?? [];
    return NextResponse.json({ offices }, { status: 200 });
  } catch (err) {
    reportError('booking-offices-proxy', 'GET', err);
    return NextResponse.json({ offices: [] }, { status: 200 });
  }
}
