/**
 * POST /api/patient-requests/[token]/submit
 *
 * Thin-proxy PÚBLICO → NestJS POST /api/patient-requests/:token/submit
 *
 * Recibe:
 *   - Header: X-Session-Token: <sessionToken>  (OBLIGATORIO)
 *   - Body: { responseText?: string | null }
 *
 * Marca la solicitud como cumplida.
 * Respuesta exitosa: { success: true, data: { requestId } }
 */

import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:3001';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;

  // Session token en header (nunca en body)
  const sessionToken = req.headers.get('x-session-token') ?? '';
  if (!sessionToken) {
    return NextResponse.json({ error: 'Sesión no válida. Verifica tu acceso.' }, { status: 401 });
  }

  let body: { responseText?: string | null };
  try {
    const raw = await req.text();
    body = raw ? (JSON.parse(raw) as { responseText?: string | null }) : {};
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  let backendRes: Response;
  try {
    backendRes = await fetch(`${BACKEND_URL}/api/patient-requests/${token}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-token': sessionToken,
      },
      body: JSON.stringify({ responseText: body?.responseText ?? null }),
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
      { error: errBody?.message || errBody?.error || 'No se pudo enviar la respuesta.' },
      { status: backendRes.status },
    );
  }

  const envelope = json as { success: true; data: unknown };
  return NextResponse.json({ success: true, data: envelope.data ?? json });
}
