/**
 * GET /api/booking/:doctorId/unused-sessions?email=...
 *
 * Proxy público al backend `GET /api/booking/:doctorId/unused-sessions`.
 *
 * WHY THIS EXISTS: le avisa al paciente que ya tiene sesiones pagadas antes de
 * que reserve —y pague— otra vez. Es **solo informativo**: no alimenta el estado
 * `activePackage` del cliente, que dispara "saltear el pago y consumir el
 * paquete" y necesita un `package_id` que en el modelo real no existe (ADR-078).
 *
 * Degrada SIEMPRE a lista vacía: es una ayuda, no una condición para reservar.
 * Que el aviso no aparezca es molesto; que la reserva se rompa por él, inaceptable.
 *
 * PII: la respuesta del backend no incluye nombre ni identificador del paciente,
 * solo el plan y los contadores. El correo viaja en la query y no se registra.
 */

import { NextRequest, NextResponse } from 'next/server';
import { reportError } from '@/lib/report-error';

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:3001';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ doctorId: string }> },
): Promise<NextResponse> {
  const { doctorId } = await params;
  const email = req.nextUrl.searchParams.get('email') ?? '';

  if (!UUID_RE.test(doctorId) || !email) {
    return NextResponse.json({ data: [] }, { status: 200 });
  }

  try {
    const res = await fetch(
      `${BACKEND_URL}/api/booking/${encodeURIComponent(doctorId)}/unused-sessions` +
        `?email=${encodeURIComponent(email)}`,
      { cache: 'no-store' },
    );

    if (!res.ok) {
      return NextResponse.json({ data: [] }, { status: 200 });
    }

    const json = (await res.json()) as { success?: boolean; data?: unknown[] };
    return NextResponse.json({ data: json?.data ?? [] }, { status: 200 });
  } catch (err) {
    // Sin el correo en el log: es PII.
    reportError('booking-unused-sessions-proxy', 'GET', err);
    return NextResponse.json({ data: [] }, { status: 200 });
  }
}
