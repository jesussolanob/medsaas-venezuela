/**
 * POST /api/patient-requests/[token]/upload
 *
 * Thin-proxy PÚBLICO con rate-limit → NestJS POST /api/patient-requests/:token/upload
 *
 * Recibe:
 *   - Header: X-Session-Token: <sessionToken>  (OBLIGATORIO; NO va en el body)
 *   - Body: multipart/form-data con campo 'file'
 *
 * Validaciones en BFF (antes de llegar al backend):
 *   - Rate-limit por IP: 5 uploads / 60 s por instancia (patrón public-upload)
 *   - MIME: solo image/jpeg, image/png, image/webp, application/pdf
 *   - Tamaño: máximo 10 MB
 *
 * El session token se reenvía al backend como header x-session-token.
 * Respuesta exitosa: { success: true, data: { id, fileName } }
 */

import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:3001';

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

function isMimeAllowed(mime: string): boolean {
  return ALLOWED_MIMES.includes(mime);
}

// ---------------------------------------------------------------------------
// Rate limiting por IP — mismo patrón que public-upload/route.ts
// ---------------------------------------------------------------------------
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;
const ipHits = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string, now: number): boolean {
  const entry = ipHits.get(ip);
  if (!entry || now >= entry.resetAt) {
    ipHits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    if (ipHits.size > 5000) {
      for (const [key, val] of ipHits) {
        if (now >= val.resetAt) ipHits.delete(key);
      }
    }
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX;
}

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;

  // Rate limit por IP
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';
  if (isRateLimited(ip, Date.now())) {
    return NextResponse.json(
      { error: 'Demasiadas solicitudes. Intenta de nuevo en un minuto.' },
      { status: 429 },
    );
  }

  // Leer session token del header (NO del body — nunca va en logs de cuerpo)
  const sessionToken = req.headers.get('x-session-token') ?? '';
  if (!sessionToken) {
    return NextResponse.json({ error: 'Sesión no válida. Verifica tu acceso.' }, { status: 401 });
  }

  // Parsear multipart
  let incoming: FormData;
  try {
    incoming = await req.formData();
  } catch {
    return NextResponse.json(
      { error: 'Cuerpo de la solicitud inválido (multipart esperado)' },
      { status: 400 },
    );
  }

  const file = incoming.get('file');
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'Campo "file" requerido' }, { status: 400 });
  }

  // Validar MIME
  const mimeType = file.type || '';
  if (!isMimeAllowed(mimeType)) {
    return NextResponse.json(
      {
        error: `Tipo de archivo no permitido (${mimeType || 'desconocido'}). Solo JPEG, PNG, WebP y PDF.`,
      },
      { status: 415 },
    );
  }

  // Validar tamaño
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json(
      { error: `El archivo supera el límite de ${MAX_SIZE_BYTES / (1024 * 1024)} MB` },
      { status: 413 },
    );
  }

  // Reenviar al backend como multipart con el session token en el header
  const outgoing = new FormData();
  outgoing.append('file', file, file instanceof File ? file.name : 'documento');

  let backendRes: Response;
  try {
    backendRes = await fetch(`${BACKEND_URL}/api/patient-requests/${token}/upload`, {
      method: 'POST',
      headers: {
        // Session token en header, no en body (evita que aparezca en access logs)
        'x-session-token': sessionToken,
        // NO configurar Content-Type — fetch lo establece con el boundary de multipart
      },
      body: outgoing,
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
      { error: errBody?.message || errBody?.error || 'Error al subir el archivo.' },
      { status: backendRes.status },
    );
  }

  const envelope = json as { success: true; data: unknown };
  return NextResponse.json({ success: true, data: envelope.data ?? json });
}
