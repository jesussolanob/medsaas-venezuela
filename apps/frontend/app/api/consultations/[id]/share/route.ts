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

  let body: { sections?: ShareSections; doc_selection?: DocSelection };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  const sections = body?.sections ?? {};
  const hasAtLeastOne = sections.report || sections.prescriptions || sections.ehr;

  // También aceptar doc_selection sin sections (tipos que no mapean a las 3 secciones viejas)
  const hasDocSelection = (body?.doc_selection?.types?.length ?? 0) > 0;

  if (!hasAtLeastOne && !hasDocSelection) {
    return NextResponse.json(
      { error: 'Debes seleccionar al menos una sección para compartir' },
      { status: 400 },
    );
  }

  const backendBody: { sections: ShareSections; doc_selection?: DocSelection } = { sections };
  if (body?.doc_selection) backendBody.doc_selection = body.doc_selection;

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
