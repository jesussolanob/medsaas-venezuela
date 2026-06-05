/**
 * POST /api/doctor/share-pdf
 *
 * ETAPA 2 — NOT IMPLEMENTED.
 * Document storage (HTML → Supabase Storage "shared-docs" bucket) requires
 * the NestJS storage module. The viewer URL pattern (HMAC-signed /view-doc)
 * also needs to migrate together. Both are deferred to Etapa 2.
 *
 * Callers receive a clear 501 so the UI can show a "próximamente" message.
 */
import { NextResponse } from 'next/server';

export async function POST(): Promise<NextResponse> {
  return NextResponse.json(
    {
      error: 'Compartir documentos disponible próximamente',
      code: 'NOT_IMPLEMENTED',
    },
    { status: 501 },
  );
}
