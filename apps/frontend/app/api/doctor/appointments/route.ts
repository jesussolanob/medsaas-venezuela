/**
 * app/api/doctor/appointments/route.ts
 *
 * GET  — returns booked time slots for a given date.
 *        Query: ?date=YYYY-MM-DD
 *        Response: { success: true, data: { bookedAt: string[] } }
 *        Used by the NewAppointmentFlow wizard to grey out already-taken slots.
 *
 * DELETE — proxies to the backend `DELETE /api/appointments/:id`, which deletes
 *          the appointment and cascades to its linked consultation. Ownership is
 *          enforced server-side (anti-IDOR); the backend returns 403/404 for a
 *          non-owned id.
 */
import { NextRequest, NextResponse } from 'next/server';
import { backendDelete, backendGet } from '@/lib/api-client.server';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BackendAppointment {
  id: string;
  scheduledAt: string;
  status: string;
}

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// GET — booked slots for a date
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest): Promise<NextResponse> {
  const date = req.nextUrl.searchParams.get('date');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: 'Parámetro date inválido. Formato esperado: YYYY-MM-DD', code: 'BAD_REQUEST' },
      { status: 400 },
    );
  }

  // Límites del día en hora de Caracas (UTC-4, sin DST). Con límites UTC, las
  // citas nocturnas (20:00–23:59 VE) caían fuera del rango y sus slots
  // aparecían libres aunque estuvieran ocupados.
  const dateFrom = encodeURIComponent(`${date}T00:00:00-04:00`);
  const dateTo = encodeURIComponent(`${date}T23:59:59-04:00`);
  const qs = `date_from=${dateFrom}&date_to=${dateTo}&page=1&limit=100`;

  // El backend GET /api/appointments devuelve el envelope { success, data: [...], meta };
  // backendGet ya desempaqueta `data`, así que result.value ES el array de citas.
  const result = await backendGet<BackendAppointment[]>(`/api/appointments?${qs}`);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message, code: result.error.code },
      { status: result.error.status ?? 502 },
    );
  }

  const appointments = Array.isArray(result.value) ? result.value : [];
  const bookedAt = appointments.filter((a) => a.status !== 'cancelled').map((a) => a.scheduledAt);

  return NextResponse.json({ success: true, data: { bookedAt } });
}

// ---------------------------------------------------------------------------
// DELETE — cancel / delete an appointment
// ---------------------------------------------------------------------------

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json(
      { error: 'Falta el parámetro id', code: 'BAD_REQUEST' },
      { status: 400 },
    );
  }

  const result = await backendDelete<unknown>(`/api/appointments/${id}`);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message, code: result.error.code },
      { status: result.error.status ?? 502 },
    );
  }

  return NextResponse.json({ success: true });
}
