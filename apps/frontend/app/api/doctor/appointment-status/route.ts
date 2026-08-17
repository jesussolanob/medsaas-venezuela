import 'server-only';

/**
 * POST /api/doctor/appointment-status
 *
 * Thin-proxy → PUT /api/appointments/:id/status (NestJS backend).
 *
 * MIGRATED — Etapa 1: Supabase removed.
 *
 * DEFERRED (Fase 5 — Google Calendar integration):
 *   - started_at sync on consultations (was done inline after RPC call)
 *   → Now handled by the backend's UpdateAppointmentStatusUseCase.
 *
 * DEFERRED (Fase 5 — no backend equivalent yet):
 *   - package session restore on cancel (previously via restore_package_session RPC)
 *   → Backend handles this in its use case (optimistic lock pattern).
 */

import { NextRequest, NextResponse } from 'next/server';
import { backendPut } from '@/lib/api-client.server';

export const dynamic = 'force-dynamic';

/** Maps backend domain error codes to Spanish (es-VE) messages for the UI. */
function spanishError(code: string, fallback: string): string {
  switch (code) {
    case 'APPOINTMENT_NOT_FOUND':
      return 'Cita no encontrada';
    case 'APPOINTMENT_INVALID_TRANSITION':
      return 'No se puede cambiar la cita a ese estado desde su estado actual';
    default:
      return fallback;
  }
}

// The UI sends: { appointment_id, new_status, reason? }
// Backend PUT /:id/status expects: { status, actor_id?, reason? }
export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  const { appointment_id, new_status, reason } = body as {
    appointment_id?: string;
    new_status?: string;
    reason?: string | null;
  };

  if (!appointment_id || !new_status) {
    return NextResponse.json(
      { error: 'appointment_id y new_status son requeridos' },
      { status: 400 },
    );
  }

  const result = await backendPut<{ id: string; status: string }>(
    `/api/appointments/${appointment_id}/status`,
    {
      status: new_status,
      reason: reason ?? null,
    },
  );

  if (!result.ok) {
    const { code, message, status } = result.error;
    if (status === 403) {
      return NextResponse.json(
        { error: 'No tienes permiso para cambiar esta cita' },
        { status: 403 },
      );
    }
    if (status === 409 || code === 'APPOINTMENT_CANCEL_REQUIRES_RESCHEDULE') {
      // Cancelling an appointment with an approved payment requires rescheduling first.
      // The backend message is already in Spanish; forward it to the UI intact.
      return NextResponse.json(
        { error: message, code: 'APPOINTMENT_CANCEL_REQUIRES_RESCHEDULE' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: spanishError(code, message) }, { status: status || 500 });
  }

  return NextResponse.json({ success: true, new_status });
}
