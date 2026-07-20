/**
 * GET /api/public/appointments/confirm-info?token=TOKEN
 *
 * Thin public proxy — sin auth, sin sesión requerida.
 *
 * Obtiene el resumen de la cita asociada al token de confirmación para
 * mostrárselo al paciente antes de que confirme. El backend responde con
 * { success: true, data: { status, doctorName, date, time, modality } }
 * o HTTP 404 cuando el token es inválido/expirado (anti-enumeración).
 *
 * NO se adjuntan headers x-dev-user-* porque el endpoint de backend
 * es completamente público (sin DevAuthGuard / Auth0).
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:3001';

export interface AppointmentConfirmInfo {
  status: 'scheduled' | 'confirmed' | 'cancelled' | 'completed' | 'no_show';
  doctorName: string;
  date: string;
  time: string;
  modality: string;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = req.nextUrl.searchParams.get('token');

  if (!token || token.trim() === '') {
    return NextResponse.json({ error: 'El parámetro token es requerido.' }, { status: 400 });
  }

  let backendRes: Response;
  try {
    backendRes = await fetch(
      `${BACKEND_URL}/api/public/appointments/confirm-info?token=${encodeURIComponent(token)}`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
      },
    );
  } catch {
    return NextResponse.json(
      { error: 'No se pudo conectar con el servidor. Intenta de nuevo.' },
      { status: 502 },
    );
  }

  if (!backendRes.ok) {
    let errorMessage = 'Este enlace no es válido o ha expirado.';
    try {
      const errJson = (await backendRes.json()) as { message?: string; error?: string };
      errorMessage = errJson?.message ?? errJson?.error ?? errorMessage;
    } catch {
      // cuerpo vacío o no-JSON; usar el mensaje por defecto
    }
    return NextResponse.json({ error: errorMessage }, { status: backendRes.status });
  }

  let json: unknown;
  try {
    json = await backendRes.json();
  } catch {
    return NextResponse.json(
      { error: 'El servidor devolvió una respuesta no válida.' },
      { status: 502 },
    );
  }

  const envelope = json as { success: boolean; data: AppointmentConfirmInfo };
  return NextResponse.json({ data: envelope.data }, { status: 200 });
}
