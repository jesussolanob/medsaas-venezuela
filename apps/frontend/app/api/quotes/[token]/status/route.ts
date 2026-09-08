/**
 * POST /api/quotes/[token]/status
 *
 * Server-side proxy for the recipient's accept/reject action on the public
 * quote view. No auth — the token is the sole credential, same pattern as
 * the GET .../pdf route next to this one.
 *
 * Backend endpoint: POST /api/quotes/:token/status (public controller).
 */

import { NextRequest, NextResponse } from 'next/server';
import { log } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BACKEND_URL =
  process.env.BACKEND_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  'http://localhost:3001';

interface StatusRequestBody {
  status: 'accepted' | 'rejected';
}

/**
 * Shape emitted by GlobalExceptionFilter (global-exception.filter.ts:68) —
 * `message` is the ONLY field the backend ever puts the error text in.
 * No `error` fallback here on purpose: a fallback to a key the backend never
 * sends is dead code that quietly degrades to a blank message if the
 * contract ever changes, instead of breaking loudly where it's visible.
 */
interface BackendErrorBody {
  success: false;
  code?: string;
  message?: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;

  let body: StatusRequestBody;
  try {
    body = (await req.json()) as StatusRequestBody;
  } catch {
    return NextResponse.json({ error: 'Solicitud inválida.' }, { status: 400 });
  }

  if (body.status !== 'accepted' && body.status !== 'rejected') {
    return NextResponse.json({ error: 'Solicitud inválida.' }, { status: 400 });
  }

  try {
    const backendRes = await fetch(
      `${BACKEND_URL}/api/quotes/${encodeURIComponent(token)}/status`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: body.status }),
      },
    );

    if (!backendRes.ok) {
      const errJson = (await backendRes.json().catch(() => null)) as BackendErrorBody | null;
      const message = errJson?.message ?? 'No se pudo registrar tu respuesta. Intentá de nuevo.';
      return NextResponse.json({ error: message }, { status: backendRes.status });
    }

    const envelope = (await backendRes.json()) as {
      success: boolean;
      data: { status: 'accepted' | 'rejected' };
    };
    return NextResponse.json({ success: true, data: envelope.data }, { status: 200 });
  } catch (err: unknown) {
    log.error('[quotes/status] proxy failed', {
      message: err instanceof Error ? err.message : 'unknown',
    });
    // 503 y NO 502: Cloudflare DESCARTA el cuerpo de los 502/504 del origen y
    // sirve su propia página de error. Con un 502, este mensaje en español nunca
    // llegaría al paciente — vería una pantalla genérica de Cloudflare y no
    // sabría que puede reintentar. Ya nos pasó antes en este proyecto.
    return NextResponse.json(
      { error: 'No se pudo conectar con el servidor. Intentá de nuevo.' },
      { status: 503 },
    );
  }
}
