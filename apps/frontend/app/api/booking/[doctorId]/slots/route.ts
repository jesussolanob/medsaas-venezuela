/**
 * GET /api/booking/:doctorId/slots?date=YYYY-MM-DD
 *
 * Thin public proxy to the NestJS backend `GET /api/booking/:doctorId/slots`.
 *
 * WHY THIS EXISTS: BookingClient (client component) fetches this path to know
 * which time slots are taken/blocked (`available: false`). The public booking
 * *page* is a server component that talks to the backend directly via
 * BACKEND_INTERNAL_URL, but the client component cannot reach the internal
 * backend URL — it needs a same-origin route handler. Without this file the
 * fetch resolved to the Next app shell (HTML 404), so `unavailableTimes` stayed
 * empty and taken/blocked slots were never disabled in the grid.
 *
 * The backend responds `{ success: true, data: { date, slots: [{time, available}] } }`.
 * We unwrap `data` so the client can read `json.slots` directly.
 */

import { NextRequest, NextResponse } from 'next/server';
import { reportError } from '@/lib/report-error';

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:3001';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ doctorId: string }> },
): Promise<NextResponse> {
  const { doctorId } = await params;
  const date = req.nextUrl.searchParams.get('date');

  if (!date) {
    return NextResponse.json({ slots: [] }, { status: 200 });
  }

  try {
    const res = await fetch(
      `${BACKEND_URL}/api/booking/${encodeURIComponent(doctorId)}/slots?date=${encodeURIComponent(date)}`,
      { cache: 'no-store' },
    );

    if (!res.ok) {
      // Degrade gracefully: no slots info → client shows all slots as available.
      return NextResponse.json({ slots: [] }, { status: 200 });
    }

    const json = (await res.json()) as {
      data?: { date?: string; slots?: { time: string; available: boolean }[] };
      slots?: { time: string; available: boolean }[];
    };

    // Unwrap the backend envelope so the client can read `json.slots`.
    const slots = json?.data?.slots ?? json?.slots ?? [];
    return NextResponse.json({ date, slots }, { status: 200 });
  } catch (err) {
    reportError('booking-slots-proxy', 'GET', err);
    return NextResponse.json({ slots: [] }, { status: 200 });
  }
}
