/**
 * POST /api/patient-requests/[token]/request-code
 *
 * Thin-proxy PÚBLICO → NestJS POST /api/patient-requests/:token/request-code
 * SIN headers de auth — endpoint público.
 *
 * Genera y reenvía un nuevo código al email del paciente.
 * Respuesta exitosa: { success: true, data: { expiresAt } }
 *
 * El backend impone un cooldown de 60 segundos entre solicitudes.
 * Un 429 del backend se reenvía tal cual.
 */

import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:3001';

export const dynamic = 'force-dynamic';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;

  let backendRes: Response;
  try {
    backendRes = await fetch(`${BACKEND_URL}/api/patient-requests/${token}/request-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return NextResponse.json(
      { error: 'No se pudo conectar con el servidor. Intenta de nuevo.' },
      { status: 502 },
    );
  }

  let json: unknown;
  try {
    json = await backendRes.json();
  } catch {
    return NextResponse.json({ error: 'Respuesta inesperada del servidor' }, { status: 502 });
  }

  if (!backendRes.ok) {
    const errBody = json as { message?: string; error?: string } | null;
    return NextResponse.json(
      { error: errBody?.message || errBody?.error || 'No se pudo enviar el código.' },
      { status: backendRes.status },
    );
  }

  const envelope = json as { success: true; data: unknown };
  return NextResponse.json({ success: true, data: envelope.data ?? json });
}
