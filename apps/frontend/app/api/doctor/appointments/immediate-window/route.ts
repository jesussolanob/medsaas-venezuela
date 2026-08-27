/**
 * GET /api/doctor/appointments/immediate-window
 *
 * Thin-proxy a `GET /api/doctor/appointments/immediate-window` del backend.
 *
 * Responde cuánto espacio hay AHORA para una consulta inmediata, sin crear
 * nada: hasta cuándo puede durar antes de pisar la próxima cita. Lo usa el
 * modal para avisar ANTES de guardar cuando no queda lugar.
 *
 * La hora la pone el servidor; acá no se manda ninguna.
 */
import { NextRequest, NextResponse } from 'next/server';
import { backendGet } from '@/lib/api-client.server';

export const dynamic = 'force-dynamic';

interface ImmediateWindow {
  now: string;
  nextAppointmentAt: string | null;
  availableMinutes: number | null;
  effectiveDuration: number;
  fits: boolean;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Sin office_id a propósito: la ventana es del especialista completo — su
  // próxima cita lo ocupa atienda donde atienda.
  const durationMinutes = req.nextUrl.searchParams.get('duration_minutes') ?? '';

  if (!durationMinutes) {
    return NextResponse.json(
      { error: 'duration_minutes es requerido', code: 'BAD_REQUEST' },
      { status: 400 },
    );
  }

  const result = await backendGet<ImmediateWindow>(
    `/api/doctor/appointments/immediate-window?duration_minutes=${encodeURIComponent(durationMinutes)}`,
  );

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message, code: result.error.code },
      { status: result.error.status ?? 502 },
    );
  }

  return NextResponse.json({ success: true, data: result.value });
}
