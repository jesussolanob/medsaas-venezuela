/**
 * POST /api/doctor/account/deactivate
 *
 * BFF thin-proxy to the NestJS endpoint of the same path. The specialist
 * switches their OWN account off; the backend takes the target from the
 * authenticated token, so no id travels in the body.
 *
 * The backend refuses with 422 ACCOUNT_HAS_UPCOMING_APPOINTMENTS when the
 * specialist still has patients booked ahead. That message is written for the
 * user and carries the count, so it is forwarded verbatim — the modal shows it
 * as-is instead of a generic failure.
 */

import { NextResponse } from 'next/server';
import { backendPost } from '@/lib/api-client.server';

export async function POST(request: Request) {
  let reason: string | null = null;

  try {
    const body = (await request.json()) as { reason?: unknown };
    if (typeof body?.reason === 'string') reason = body.reason;
  } catch {
    // No body, or not JSON — the reason is optional, so proceed without it.
  }

  const result = await backendPost<{ deactivated: boolean; activeUntil: string | null }>(
    '/api/doctor/account/deactivate',
    { reason },
  );

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }

  // `activeUntil` viaja al cliente: cuando la baja queda programada porque al
  // especialista le quedan días pagos, la tarjeta lo dice en vez de cerrarle la
  // sesión como si ya estuviera apagada.
  return NextResponse.json({ success: true, activeUntil: result.value?.activeUntil ?? null });
}
