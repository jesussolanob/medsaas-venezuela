import 'server-only';

/**
 * app/api/doctor/document-files/[id]/route.ts
 *
 * PATCH /api/doctor/document-files/:id
 *   → NestJS PATCH /api/doctor/document-files/:id
 *   Body: { name }  (rename)
 *   Returns: { success: true, data: { id, name, mimeType, sizeBytes, createdAt } }
 *
 * DELETE /api/doctor/document-files/:id
 *   → NestJS DELETE /api/doctor/document-files/:id
 *   Soft-deletes the file from the library.
 *   Returns: { success: true, data: null }
 */

import { NextRequest, NextResponse } from 'next/server';
import { backendPatch, backendDelete } from '@/lib/api-client.server';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// PATCH — rename a document file
// ---------------------------------------------------------------------------

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: 'ID requerido' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  const result = await backendPatch<unknown>(`/api/doctor/document-files/${id}`, body);

  if (!result.ok) {
    log.error('[document-files PATCH] backend error', {
      id,
      code: result.error.code,
      status: result.error.status,
    });
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }

  return NextResponse.json({ success: true, data: result.value });
}

// ---------------------------------------------------------------------------
// DELETE — soft-delete a document file from the library
// ---------------------------------------------------------------------------

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: 'ID requerido' }, { status: 400 });
  }

  const result = await backendDelete<null>(`/api/doctor/document-files/${id}`);

  if (!result.ok) {
    log.error('[document-files DELETE] backend error', {
      id,
      code: result.error.code,
      status: result.error.status,
    });
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }

  return NextResponse.json({ success: true, data: null });
}
