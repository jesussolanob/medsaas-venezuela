/**
 * GET /api/documents/[token]/attachments?sessionToken=...
 *
 * PUBLIC BFF — no doctor auth headers. Called from the patient-facing
 * document download page after a successful verify-code.
 *
 * Fetches the backend render-data and returns only the data the patient
 * download page needs to show attachments and decide whether to show the
 * PDF download button:
 *
 *   {
 *     success: true,
 *     data: {
 *       attachments: RenderDataAttachmentDto[],
 *       hasDocumentTypes: boolean
 *     }
 *   }
 *
 * hasDocumentTypes is true when the share includes ≥1 document type (informe,
 * recipe, paraclinical, rest, history). When false, the PDF download button
 * should be hidden — there is no PDF to generate.
 *
 * Security: the sessionToken grants access to the render-data for 15 minutes
 * (backend-enforced). The token is kept only in the query string — same
 * pattern as /api/documents/[token]/pdf.
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL ?? 'http://localhost:3001';

interface RenderDataAttachment {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
}

interface RenderDataEnvelope {
  success: boolean;
  data: {
    sections?: { report?: boolean; prescriptions?: boolean; ehr?: boolean };
    docSelection?: { types?: string[] } | null;
    attachments?: RenderDataAttachment[];
  };
}

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

  let backendRes: Response;
  try {
    backendRes = await fetch(
      `${BACKEND_URL}/api/documents/${token}/render-data?sessionToken=${encodeURIComponent(sessionToken)}`,
      { method: 'GET', headers: { 'Content-Type': 'application/json' } },
    );
  } catch {
    return NextResponse.json({ error: 'No se pudo conectar con el servidor.' }, { status: 502 });
  }

  if (!backendRes.ok) {
    let errMsg = 'No se pudo obtener los datos del documento.';
    try {
      const errJson = (await backendRes.json()) as { message?: string; error?: string };
      errMsg = errJson?.message ?? errJson?.error ?? errMsg;
    } catch {
      /* ignore */
    }
    return NextResponse.json({ error: errMsg }, { status: backendRes.status });
  }

  let envelope: RenderDataEnvelope;
  try {
    envelope = (await backendRes.json()) as RenderDataEnvelope;
  } catch {
    return NextResponse.json({ error: 'Respuesta inesperada del servidor.' }, { status: 502 });
  }

  const rd = envelope.data;

  // Determine if the share includes ≥1 document type.
  // Priority: docSelection.types (new flow) > legacy sections (backward-compat).
  const docSelectionTypes = rd.docSelection?.types ?? [];
  const legacySections = rd.sections ?? {};
  const hasDocumentTypes =
    docSelectionTypes.length > 0 ||
    !!legacySections.report ||
    !!legacySections.prescriptions ||
    !!legacySections.ehr;

  const attachments: RenderDataAttachment[] = Array.isArray(rd.attachments) ? rd.attachments : [];

  return NextResponse.json({
    success: true,
    data: { attachments, hasDocumentTypes },
  });
}
