/**
 * GET  /api/public/appointments/reschedule/[token]
 * POST /api/public/appointments/reschedule/[token]
 *
 * Thin public proxies — sin auth, sin sesión requerida.
 *
 * GET:  Devuelve la información de la cita (nombre del paciente sin apellido,
 *       especialista, fecha, hora, modalidad) para que el formulario de
 *       reagendamiento se pueda pre-renderizar.
 *
 * POST: Recibe el nuevo scheduledAt y mueve la cita.
 *       Body: { scheduledAt: string } (ISO8601 con offset)
 *
 * El token es de uso único: después de mover la cita el scheduledAt cambia y
 * el token expira automáticamente (mismatch de satMs).
 *
 * NUNCA se adjuntan headers x-dev-user-*: el endpoint de backend es público.
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:3001';

export interface AppointmentRescheduleInfo {
  patientFirstName: string;
  doctorName: string;
  date: string;
  time: string;
  modality: string;
  officeName: string | null;
  currentScheduledAt: string;
  status: string;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  // Next 16: route params are async; reading them synchronously yields undefined.
  const { token } = await params;

  if (!token || token.trim() === '') {
    return NextResponse.json(
      { error: 'El token de reagendamiento es requerido.' },
      { status: 400 },
    );
  }

  let backendRes: Response;
  try {
    backendRes = await fetch(
      `${BACKEND_URL}/api/public/appointments/reschedule/${encodeURIComponent(token)}`,
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
    let errorMessage = 'Este enlace de reagendamiento no es válido o ya fue usado.';
    try {
      const errJson = (await backendRes.json()) as { message?: string; error?: string };
      errorMessage = errJson?.message ?? errJson?.error ?? errorMessage;
    } catch {
      // cuerpo vacío o no-JSON
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

  const envelope = json as { success: boolean; data: AppointmentRescheduleInfo };
  return NextResponse.json({ data: envelope.data }, { status: 200 });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  // Next 16: route params are async; reading them synchronously yields undefined.
  const { token } = await params;

  if (!token || token.trim() === '') {
    return NextResponse.json(
      { error: 'El token de reagendamiento es requerido.' },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'El cuerpo de la solicitud no es JSON válido.' },
      { status: 400 },
    );
  }

  const { scheduledAt } = body as { scheduledAt?: string };
  if (!scheduledAt || typeof scheduledAt !== 'string' || scheduledAt.trim() === '') {
    return NextResponse.json({ error: 'El campo scheduledAt es requerido.' }, { status: 400 });
  }

  let backendRes: Response;
  try {
    backendRes = await fetch(
      `${BACKEND_URL}/api/public/appointments/reschedule/${encodeURIComponent(token)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledAt }),
      },
    );
  } catch {
    return NextResponse.json(
      { error: 'No se pudo conectar con el servidor. Intenta de nuevo.' },
      { status: 502 },
    );
  }

  if (!backendRes.ok) {
    // Only surface the backend's specific error message for domain-level responses
    // (404 token-not-found, 409 conflict, 422 validation); all other errors
    // (500, 503, etc.) get a generic Spanish message to avoid leaking internals.
    const defaultMsg = 'No se pudo reagendar la cita. Intenta de nuevo.';
    let errorMessage = defaultMsg;
    if ([404, 409, 422].includes(backendRes.status)) {
      try {
        const errJson = (await backendRes.json()) as { message?: string; error?: string };
        errorMessage = errJson?.message ?? errJson?.error ?? defaultMsg;
      } catch {
        // cuerpo vacío o no-JSON — keep default
      }
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

  const envelope = json as { success: boolean; data: AppointmentRescheduleInfo };
  return NextResponse.json({ data: envelope.data }, { status: 200 });
}
