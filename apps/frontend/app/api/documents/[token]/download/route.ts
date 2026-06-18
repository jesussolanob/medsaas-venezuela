/**
 * GET /api/documents/[token]/download?sessionToken=...
 *
 * Thin-proxy PÚBLICO → NestJS GET /api/documents/:token/download?sessionToken=...
 * SIN headers de auth — endpoint público (validado por sessionToken en QS).
 *
 * Stream-ea el binario PDF tal como lo devuelve el backend, preservando
 * Content-Type (application/pdf) y Content-Disposition (attachment).
 */

import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:3001';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;

  const { searchParams } = new URL(req.url);
  const sessionToken = searchParams.get('sessionToken');

  if (!sessionToken) {
    return NextResponse.json({ error: 'sessionToken requerido' }, { status: 400 });
  }

  const backendUrl = `${BACKEND_URL}/api/documents/${token}/download?sessionToken=${encodeURIComponent(sessionToken)}`;

  let backendRes: Response;
  try {
    backendRes = await fetch(backendUrl, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return NextResponse.json(
      { error: 'No se pudo conectar con el servidor. Intenta de nuevo.' },
      { status: 502 },
    );
  }

  if (!backendRes.ok) {
    // Try parsing as JSON for error message; fallback to generic
    let errorMsg = 'No se pudo descargar el documento.';
    try {
      const errJson = (await backendRes.json()) as { message?: string; error?: string };
      errorMsg = errJson?.message || errJson?.error || errorMsg;
    } catch {
      /* ignore parse error */
    }
    return NextResponse.json({ error: errorMsg }, { status: backendRes.status });
  }

  // Stream the binary through preserving content-type and content-disposition
  const contentType = backendRes.headers.get('Content-Type') ?? 'application/pdf';
  const contentDisposition =
    backendRes.headers.get('Content-Disposition') ?? 'attachment; filename="documento.pdf"';

  return new NextResponse(backendRes.body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': contentDisposition,
    },
  });
}
