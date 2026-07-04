/**
 * POST /api/patient-requests/[token]/verify-code
 *
 * Thin-proxy PÚBLICO → NestJS POST /api/patient-requests/:token/verify-code
 * SIN headers de auth — el endpoint del backend es público.
 *
 * Body: { code: string (6 dígitos), cedula: string }
 * Respuesta exitosa: { success: true, data: { sessionToken, expiresAt } }
 *
 * Errores relevantes:
 *   422 — código incorrecto, cédula incorrecta, código expirado, bloqueado
 *   429 — rate limit (cubierto por Cloud Armor en prod; reenvío del status)
 */

import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:3001';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;

  let body: { code?: string; cedula?: string };
  try {
    body = (await req.json()) as { code?: string; cedula?: string };
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  const code = typeof body?.code === 'string' ? body.code.trim() : '';
  const cedula = typeof body?.cedula === 'string' ? body.cedula.trim() : '';

  if (!code) {
    return NextResponse.json({ error: 'El código es requerido' }, { status: 400 });
  }
  if (!cedula) {
    return NextResponse.json({ error: 'La cédula es requerida' }, { status: 400 });
  }

  let backendRes: Response;
  try {
    backendRes = await fetch(`${BACKEND_URL}/api/patient-requests/${token}/verify-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, cedula }),
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
      {
        error:
          errBody?.message ||
          errBody?.error ||
          'Código o cédula incorrectos. Verifica e intenta de nuevo.',
      },
      { status: backendRes.status },
    );
  }

  const envelope = json as { success: true; data: unknown };
  return NextResponse.json({ success: true, data: envelope.data ?? json });
}
