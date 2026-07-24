import 'server-only';

/**
 * GET /api/public/pending-consultations/[token]
 *
 * Thin public proxy — sin auth, sin sesión requerida.
 *
 * El paciente recibe un email con un link que incluye su token único.
 * Este handler consulta el backend para obtener información de la consulta pendiente.
 *
 * Respuesta del backend:
 *   { success: true, data: { doctor_id, plan_name, session_number, expires_at, is_schedulable, doctor_name } }
 *
 * NO se adjuntan headers x-dev-user-* porque el endpoint de backend
 * es completamente público (sin DevAuthGuard / Auth0).
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:3001';

export interface PendingConsultationTokenInfo {
  doctor_id: string;
  doctor_name: string;
  plan_name: string;
  session_number: number;
  expires_at: string | null;
  is_schedulable: boolean;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;

  if (!token || typeof token !== 'string' || token.trim() === '') {
    return NextResponse.json({ error: 'Token inválido.' }, { status: 400 });
  }

  let backendRes: Response;
  try {
    backendRes = await fetch(
      `${BACKEND_URL}/api/public/pending-consultations/${encodeURIComponent(token)}`,
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
    let errorMessage = 'El enlace no es válido o ha expirado.';
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

  const envelope = json as { success: boolean; data: PendingConsultationTokenInfo };
  return NextResponse.json({ data: envelope.data }, { status: 200 });
}
