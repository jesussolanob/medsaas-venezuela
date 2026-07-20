/**
 * POST /api/public/appointments/confirm
 *
 * Thin public proxy — sin auth, sin sesión requerida.
 *
 * Reenvía la confirmación de asistencia del paciente al backend.
 * Body: { token: string }
 * Respuesta: { data: { status, doctorName, date, time, modality } }
 *
 * Es idempotente: si la cita ya estaba confirmada el backend devuelve
 * el mismo status 'confirmed' sin error.
 *
 * NO se adjuntan headers x-dev-user-* porque el endpoint de backend
 * es completamente público (sin DevAuthGuard / Auth0).
 */

import { NextRequest, NextResponse } from 'next/server';
import type { AppointmentConfirmInfo } from '../confirm-info/route';

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:3001';

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'El cuerpo de la solicitud no es JSON válido.' },
      { status: 400 },
    );
  }

  const { token } = body as { token?: string };

  if (!token || typeof token !== 'string' || token.trim() === '') {
    return NextResponse.json({ error: 'El campo token es requerido.' }, { status: 400 });
  }

  let backendRes: Response;
  try {
    backendRes = await fetch(`${BACKEND_URL}/api/public/appointments/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
  } catch {
    return NextResponse.json(
      { error: 'No se pudo conectar con el servidor. Intenta de nuevo.' },
      { status: 502 },
    );
  }

  if (!backendRes.ok) {
    let errorMessage = 'No se pudo confirmar la cita. Intenta de nuevo.';
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
