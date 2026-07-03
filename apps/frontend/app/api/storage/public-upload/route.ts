/**
 * app/api/storage/public-upload/route.ts
 *
 * Multipart upload proxy for UNAUTHENTICATED callers (public booking flow).
 *
 * This endpoint is intentionally different from /api/storage/upload:
 *   - Does NOT call resolveIdentity() — public patients have no session.
 *   - Accepts only kind='receipt' to limit the surface area.
 *   - Validates MIME type (images + PDF) and file size (max 10 MB).
 *   - Proxies to the backend POST /api/storage/upload with a fixed guest
 *     identity so DevAuthGuard can identify the upload origin in Etapa 1.
 *
 * Etapa 2 TODO: replace the fixed guest identity with a short-lived signed
 * token issued by the booking flow so the upload is tied to a specific
 * doctor/appointment context without requiring a patient auth session.
 *
 * Request (multipart/form-data):
 *   file  — the File blob (image/* or application/pdf)
 *   kind  — must be exactly 'receipt'
 *
 * Response (JSON):
 *   { success: true, data: { url: string, path: string } }
 *   { success: false, error: { message: string } }
 */

import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:3001';

// Only images and PDF are accepted for payment receipts.
const ALLOWED_MIME_PREFIXES = ['image/', 'application/pdf'];

// 10 MB hard cap — large enough for a photo of a receipt, small enough
// to prevent abuse on a public endpoint.
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

function isMimeAllowed(mime: string): boolean {
  return ALLOWED_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix));
}

// ---------------------------------------------------------------------------
// Basic per-IP rate limiting for this UNAUTHENTICATED endpoint.
//
// Prevents storage-exhaustion / cost abuse from the public internet. This is an
// in-memory best-effort limiter (per Cloud Run instance) — the durable control
// is an edge rate limit (Cloud Armor). Etapa 2: move to Redis-backed limiting.
// ---------------------------------------------------------------------------
const RATE_LIMIT_MAX = 5; // uploads per window per IP
const RATE_LIMIT_WINDOW_MS = 60_000;
const ipHits = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string, now: number): boolean {
  const entry = ipHits.get(ip);
  if (!entry || now >= entry.resetAt) {
    ipHits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    // Opportunistic cleanup so the map does not grow unbounded.
    if (ipHits.size > 5000) {
      for (const [key, val] of ipHits) if (now >= val.resetAt) ipHits.delete(key);
    }
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Rate limit by client IP before doing any work.
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';
  if (isRateLimited(ip, Date.now())) {
    return NextResponse.json(
      {
        success: false,
        error: { message: 'Demasiadas solicitudes. Intenta de nuevo en un minuto.' },
      },
      { status: 429 },
    );
  }

  // Parse the incoming multipart form data.
  let incoming: FormData;
  try {
    incoming = await req.formData();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: { message: 'Cuerpo de la solicitud inválido (multipart esperado)' },
      },
      { status: 400 },
    );
  }

  const file = incoming.get('file');
  const kind = incoming.get('kind');

  // Validate presence of required fields.
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json(
      { success: false, error: { message: 'Campo "file" requerido' } },
      { status: 400 },
    );
  }

  if (kind !== 'receipt') {
    return NextResponse.json(
      {
        success: false,
        error: { message: 'Este endpoint solo acepta kind="receipt"' },
      },
      { status: 400 },
    );
  }

  // Validate MIME type.
  const mimeType = file.type || '';
  if (!isMimeAllowed(mimeType)) {
    return NextResponse.json(
      {
        success: false,
        error: {
          message: `Tipo de archivo no permitido (${mimeType || 'desconocido'}). Solo imágenes y PDF.`,
        },
      },
      { status: 415 },
    );
  }

  // Validate file size.
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json(
      {
        success: false,
        error: { message: `El archivo supera el límite de ${MAX_SIZE_BYTES / (1024 * 1024)} MB` },
      },
      { status: 413 },
    );
  }

  // Build the outgoing FormData to forward to the backend.
  // The backend PUBLIC endpoint hardcodes kind='receipt' and needs no auth.
  const outgoing = new FormData();
  outgoing.append('file', file, file instanceof File ? file.name : 'comprobante');

  let backendRes: Response;
  try {
    backendRes = await fetch(`${BACKEND_URL}/api/storage/public-upload`, {
      method: 'POST',
      // No auth headers — this backend route is intentionally public.
      // Do NOT set Content-Type — fetch sets the multipart boundary for FormData.
      body: outgoing,
    });
  } catch (networkErr: unknown) {
    const message =
      networkErr instanceof Error ? networkErr.message : 'Error de red al contactar el servidor';
    return NextResponse.json({ success: false, error: { message } }, { status: 502 });
  }

  // Forward the backend response as-is.
  let json: unknown;
  try {
    json = await backendRes.json();
  } catch {
    return NextResponse.json(
      { success: false, error: { message: 'Respuesta del servidor no válida' } },
      { status: 502 },
    );
  }

  return NextResponse.json(json, { status: backendRes.status });
}
