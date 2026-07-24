import 'server-only';

/**
 * POST /api/public/pending-consultations/[token]/schedule
 *
 * Thin public proxy — sin auth, sin sesión requerida.
 *
 * El paciente agenda su consulta pendiente usando el token recibido por email.
 *
 * Body esperado: { scheduled_at: string (ISO 8601), office_id?: string | null, appointment_mode?: string | null }
 * Respuesta del backend: { success: true, data: { appointment_id, scheduled_at, appointment_code } }
 *
 * NO se adjuntan headers x-dev-user-* porque el endpoint de backend
 * es completamente público (sin DevAuthGuard / Auth0).
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:3001';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;

  if (!token || typeof token !== 'string' || token.trim() === '') {
    return NextResponse.json({ error: 'Token inválido.' }, { status: 400 });
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

  const { scheduled_at, office_id, appointment_mode } = body as {
    scheduled_at?: string;
    office_id?: string | null;
    appointment_mode?: string | null;
  };

  if (!scheduled_at || typeof scheduled_at !== 'string' || scheduled_at.trim() === '') {
    return NextResponse.json({ error: 'El campo scheduled_at es requerido.' }, { status: 400 });
  }

  let backendRes: Response;
  try {
    backendRes = await fetch(
      `${BACKEND_URL}/api/public/pending-consultations/${encodeURIComponent(token)}/schedule`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduled_at,
          ...(office_id !== undefined ? { office_id } : {}),
          ...(appointment_mode !== undefined ? { appointment_mode } : {}),
        }),
      },
    );
  } catch {
    return NextResponse.json(
      { error: 'No se pudo conectar con el servidor. Intenta de nuevo.' },
      { status: 502 },
    );
  }

  if (!backendRes.ok) {
    let errorMessage = 'No se pudo agendar la consulta. Intenta de nuevo.';
    let code: string | undefined;
    try {
      const errJson = (await backendRes.json()) as {
        message?: string;
        error?: string;
        code?: string;
      };
      errorMessage = errJson?.message ?? errJson?.error ?? errorMessage;
      code = errJson?.code;
    } catch {
      // cuerpo vacío o no-JSON; usar el mensaje por defecto
    }

    if (backendRes.status === 409) {
      return NextResponse.json(
        {
          error: errorMessage || 'Este horario ya no está disponible, por favor elige otro.',
          code: code ?? 'slot_taken',
        },
        { status: 409 },
      );
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

  const envelope = json as {
    success: boolean;
    data: { appointment_id: string; scheduled_at: string; appointment_code?: string };
  };
  return NextResponse.json({ data: envelope.data }, { status: 200 });
}
