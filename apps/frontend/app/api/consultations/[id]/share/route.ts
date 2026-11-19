import 'server-only';

/**
 * POST /api/consultations/[id]/share
 *
 * Thin-proxy (autenticado) → NestJS POST /api/consultations/:id/share
 *
 * Body: { sections: { report?: boolean, prescriptions?: boolean, ehr?: boolean } }
 * Respuesta exitosa: { url, code, expiresAt }
 */

import { NextRequest, NextResponse } from 'next/server';
import { backendPost } from '@/lib/api-client.server';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';

interface ShareSections {
  report?: boolean;
  prescriptions?: boolean;
  ehr?: boolean;
}

interface DocSelection {
  types: string[];
  informeBlockKeys: string[];
  restContent?: string | null;
}

interface ShareAttachmentUpload {
  name: string;
  filePath: string;
  mimeType: string;
  sizeBytes: number;
}

interface ShareAttachmentsInput {
  libraryFileIds?: string[];
  uploads?: ShareAttachmentUpload[];
}

interface ShareResult {
  url: string;
  code: string;
  expiresAt: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  let body: {
    sections?: ShareSections;
    doc_selection?: DocSelection;
    attachments?: ShareAttachmentsInput;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  const sections = body?.sections ?? {};
  const hasAtLeastOne = sections.report || sections.prescriptions || sections.ehr;

  // Accept doc_selection without sections (new types that don't map to legacy sections)
  const hasDocSelection = (body?.doc_selection?.types?.length ?? 0) > 0;

  // Accept attachments without doc types
  const hasAttachments =
    (body?.attachments?.libraryFileIds?.length ?? 0) > 0 ||
    (body?.attachments?.uploads?.length ?? 0) > 0;

  if (!hasAtLeastOne && !hasDocSelection && !hasAttachments) {
    return NextResponse.json(
      { error: 'Debes seleccionar al menos una sección o archivo adjunto para compartir' },
      { status: 400 },
    );
  }

  const backendBody: {
    sections: ShareSections;
    doc_selection?: DocSelection;
    attachments?: ShareAttachmentsInput;
  } = { sections };
  if (body?.doc_selection) backendBody.doc_selection = body.doc_selection;
  if (body?.attachments) backendBody.attachments = body.attachments;

  const result = await backendPost<ShareResult>(`/api/consultations/${id}/share`, backendBody);

  if (!result.ok) {
    log.error('[share POST] backend error', {
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
