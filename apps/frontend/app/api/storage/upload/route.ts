/**
 * app/api/storage/upload/route.ts
 *
 * BFF multipart proxy — SERVER ONLY.
 *
 * Forwards file uploads from the frontend to the NestJS storage module
 * (POST /api/storage/upload). Injects dev-auth headers so the backend's
 * DevAuthGuard can identify the caller.
 *
 * Request (multipart/form-data):
 *   file  — the File blob
 *   kind  — 'avatar' | 'receipt' | 'document' | 'logo' | 'signature'
 *
 * Response (JSON):
 *   { success: true, data: { url: string, path: string } }
 *   { success: false, error: { message: string } }
 *
 * Identity is resolved via resolveIdentity() (dev cookies or Auth0 session).
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveIdentity } from '@/lib/identity.server';

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:3001';

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Parse the multipart form data from the incoming request.
  let incoming: FormData;
  try {
    incoming = await req.formData();
  } catch {
    return NextResponse.json(
      { success: false, error: { message: 'Cuerpo de la solicitud inválido (multipart esperado)' } },
      { status: 400 },
    );
  }

  const file = incoming.get('file');
  const kind = incoming.get('kind');

  if (!file || !(file instanceof Blob)) {
    return NextResponse.json(
      { success: false, error: { message: 'Campo "file" requerido' } },
      { status: 400 },
    );
  }

  if (!kind || typeof kind !== 'string') {
    return NextResponse.json(
      { success: false, error: { message: 'Campo "kind" requerido' } },
      { status: 400 },
    );
  }

  // Resolve identity per AUTH_MODE (dev cookies or Auth0 session).
  const devUser = await resolveIdentity();

  // Reconstruct a FormData to forward — keeps file name intact when available.
  const outgoing = new FormData();
  outgoing.append('file', file, file instanceof File ? file.name : 'upload');
  outgoing.append('kind', kind);

  let backendRes: Response;
  try {
    backendRes = await fetch(`${BACKEND_URL}/api/storage/upload`, {
      method: 'POST',
      headers: {
        'x-dev-user-id': devUser.id,
        'x-dev-user-role': devUser.role,
        // Do NOT set Content-Type here — fetch will add the correct
        // multipart/form-data boundary automatically when body is FormData.
      },
      body: outgoing,
    });
  } catch (networkErr: unknown) {
    const message = networkErr instanceof Error ? networkErr.message : 'Error de red al contactar el backend';
    return NextResponse.json(
      { success: false, error: { message } },
      { status: 502 },
    );
  }

  // Forward the backend response (success or error) with its status code.
  let json: unknown;
  try {
    json = await backendRes.json();
  } catch {
    return NextResponse.json(
      { success: false, error: { message: 'Respuesta del backend no válida' } },
      { status: 502 },
    );
  }

  return NextResponse.json(json, { status: backendRes.status });
}
