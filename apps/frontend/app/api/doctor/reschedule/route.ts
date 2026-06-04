/**
 * /api/doctor/reschedule — reagenda una cita del médico.
 *
 * ETAPA 1 — thin-proxy al módulo NestJS `appointments`
 * (`PUT /api/appointments/:id/reschedule`). El backend valida ownership (actor =
 * usuario autenticado), estado reagendable (scheduled|confirmed) y conflicto de
 * slot, y registra el cambio en appointment_changes_log. Reemplaza la RPC Supabase
 * `reschedule_appointment`.
 *
 * Request (sin cambios para el consumidor de la agenda):
 *   { appointmentId | appointment_id, newDate | new_scheduled_at }
 *
 * Diferido a Fase 5 (sin endpoint en Etapa 1): sincronización con Google Calendar
 * (la versión legacy actualizaba el evento de GCal tras reagendar).
 */
import { NextRequest, NextResponse } from 'next/server';
import { backendPut } from '@/lib/api-client.server';

/** Maps backend domain error codes to Spanish (es-VE) messages for the UI. */
function spanishError(code: string, fallback: string): string {
  switch (code) {
    case 'APPOINTMENT_CONFLICT':
      return 'Ya hay otra cita en ese horario';
    case 'APPOINTMENT_NOT_RESCHEDULABLE':
      return 'Esta cita ya fue cancelada o atendida';
    case 'APPOINTMENT_NOT_FOUND':
      return 'Cita no encontrada';
    default:
      return fallback;
  }
}

export async function POST(req: NextRequest) {
  const body: unknown = await req.json();
  const obj = (typeof body === 'object' && body ? body : {}) as Record<string, unknown>;
  const appointmentId = String(obj.appointmentId ?? obj.appointment_id ?? '');
  const newDate = String(obj.newDate ?? obj.new_scheduled_at ?? '');

  if (!appointmentId || !newDate) {
    return NextResponse.json({ error: 'appointmentId y newDate requeridos' }, { status: 400 });
  }

  // Validate UUID before interpolating into the backend path (avoids path traversal
  // in the proxy URL; the backend also rejects, but we sanitise at the edge).
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(appointmentId)) {
    return NextResponse.json({ error: 'ID de cita inválido' }, { status: 400 });
  }

  const result = await backendPut<unknown>(`/api/appointments/${appointmentId}/reschedule`, {
    scheduled_at: newDate,
  });

  if (!result.ok) {
    const status = result.error.status || 500;
    return NextResponse.json(
      { error: spanishError(result.error.code, result.error.message) },
      { status },
    );
  }

  return NextResponse.json({ success: true });
}
