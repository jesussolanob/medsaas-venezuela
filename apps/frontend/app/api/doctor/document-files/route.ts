import 'server-only';

/**
 * app/api/doctor/document-files/route.ts
 *
 * Thin-proxy for the doctor's "Documentos frecuentes" library.
 *
 * GET  /api/doctor/document-files
 *   → NestJS GET /api/doctor/document-files
 *   Returns: { success: true, data: { files: DoctorDocumentFileListItem[] } }
 *
 * POST /api/doctor/document-files
 *   → NestJS POST /api/doctor/document-files
 *   Body: { name, filePath, mimeType, sizeBytes }
 *   Returns: { success: true, data: { id, name, mimeType, sizeBytes, createdAt } }
 */

import { type NextRequest, NextResponse } from 'next/server';
import { backendGet, backendPost } from '@/lib/api-client.server';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// GET — list doctor's document files
// ---------------------------------------------------------------------------

export async function GET(): Promise<NextResponse> {
  // Backend returns { success: true, data: DoctorDocumentFileListItem[] } —
  // the array is directly in `data`. We wrap it as `{ files: [...] }` so the
  // UI can read json.data.files consistently.
  const result = await backendGet<unknown[]>('/api/doctor/document-files');

  if (!result.ok) {
    log.error('[document-files GET] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }

  return NextResponse.json({ success: true, data: { files: result.value } });
}

// ---------------------------------------------------------------------------
// POST — register a new document file (after client uploads to storage)
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  const result = await backendPost<unknown>('/api/doctor/document-files', body);

  if (!result.ok) {
    log.error('[document-files POST] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }

  return NextResponse.json({ success: true, data: result.value }, { status: 201 });
}
