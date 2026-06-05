/**
 * GET /api/doctor/view-doc
 *
 * ETAPA 2 — NOT IMPLEMENTED.
 * Document serving (download from Supabase Storage "shared-docs" bucket) requires
 * the NestJS storage module. Deferred to Etapa 2 together with /share-pdf.
 *
 * Returns a plain HTML error page so existing share links degrade gracefully
 * instead of throwing a Next.js error boundary.
 */
import { NextResponse } from 'next/server';

const NOT_AVAILABLE_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Documento no disponible</title>
  <style>
    body { font-family: system-ui, sans-serif; text-align: center; padding: 60px 24px;
           background: #f8fafc; color: #334155; }
    h2 { color: #0891b2; margin-bottom: 8px; }
    p  { color: #64748b; max-width: 420px; margin: 0 auto; }
  </style>
</head>
<body>
  <h2>Documento no disponible</h2>
  <p>La visualización de documentos médicos estará disponible próximamente.</p>
</body>
</html>`;

export async function GET(): Promise<NextResponse> {
  return new NextResponse(NOT_AVAILABLE_HTML, {
    status: 503,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
