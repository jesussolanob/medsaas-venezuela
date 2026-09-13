import 'server-only';

/**
 * app/api/doctor/pending-consultations/unused-sessions/[patientId]/route.ts
 *
 * GET — thin-proxy a GET /api/doctor/pending-consultations/patient/:patientId/unused-sessions
 *
 * Responde qué paquetes de este paciente tienen sesiones sin usar. Devuelve DOS
 * señales por paquete y las dos importan:
 *
 *   - `pending_rows`: sesiones ya registradas para agendar (el camino feliz).
 *   - `unused_sessions`: las que el plan incluye y todavía no se reservaron.
 *
 * La segunda es la red de seguridad. El aviso anterior contaba sólo filas de
 * `pending_consultations`, y un paquete comprado antes de que esa función
 * existiera no genera ninguna: cero filas, ningún aviso, y una especialista
 * terminó vendiendo el mismo paquete tres veces (ver ADR-079).
 *
 * El `doctorId` lo resuelve el backend desde el token — nunca viaja en la URL.
 */

import { NextRequest, NextResponse } from 'next/server';
import { backendGet } from '@/lib/api-client.server';

export const dynamic = 'force-dynamic';

interface UnusedPackageSessions {
  plan_name: string;
  total_sessions: number;
  booked_sessions: number;
  pending_rows: number;
  unused_sessions: number;
  has_pending_rows: boolean;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ patientId: string }> },
): Promise<NextResponse> {
  const { patientId } = await params;

  if (!patientId) {
    return NextResponse.json({ error: 'patientId es requerido' }, { status: 400 });
  }

  const result = await backendGet<UnusedPackageSessions[]>(
    `/api/doctor/pending-consultations/patient/${patientId}/unused-sessions`,
  );

  if (!result.ok) {
    // Degrada en silencio a "sin paquetes": este aviso es una ayuda, no una
    // condición para reservar. Romper la pantalla por no poder consultarlo
    // sería peor que no mostrarlo.
    return NextResponse.json({ success: true, data: [] });
  }

  return NextResponse.json({
    success: true,
    data: Array.isArray(result.value) ? result.value : [],
  });
}
