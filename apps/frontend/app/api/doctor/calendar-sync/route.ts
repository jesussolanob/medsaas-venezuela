/**
 * POST /api/doctor/calendar-sync
 *
 * Envía al Google Calendar del especialista las citas próximas que todavía no
 * tienen evento (presenciales históricas, citas creadas antes de conectar
 * Google, y las que cayeron en el fallback de Jitsi).
 *
 * Thin-proxy a `POST /api/appointments/calendar-sync`. El backend resuelve el
 * doctorId desde el token (anti-IDOR) y devuelve los contadores del backfill.
 * El backfill NO envía correos ni invitaciones a los pacientes.
 */
import { NextResponse } from 'next/server';
import { backendPost } from '@/lib/api-client.server';

export const dynamic = 'force-dynamic';

interface CalendarSyncResult {
  total: number;
  synced: number;
  failed: number;
}

/** Construye el mensaje que ve el especialista a partir de los contadores. */
function buildMessage({ total, synced, failed }: CalendarSyncResult): string {
  if (total === 0) {
    return 'Tus citas ya están en Google Calendar';
  }

  const base =
    synced === 1
      ? '1 cita enviada a Google Calendar'
      : `${synced} citas enviadas a Google Calendar`;

  if (failed > 0) {
    return `${base} · ${failed} no se pudieron sincronizar`;
  }

  return base;
}

export async function POST(): Promise<NextResponse> {
  const result = await backendPost<CalendarSyncResult>('/api/appointments/calendar-sync', {});

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message, code: result.error.code },
      { status: result.error.status ?? 502 },
    );
  }

  return NextResponse.json({
    success: true,
    message: buildMessage(result.value),
    ...result.value,
  });
}
