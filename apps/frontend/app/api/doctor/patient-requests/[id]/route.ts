import 'server-only';

/**
 * GET /api/doctor/patient-requests/[id]
 *
 * Thin-proxy autenticado → NestJS GET /api/doctor/patient-requests/:id
 *
 * Devuelve el detalle de una solicitud del médico, incluyendo adjuntos con
 * signed URLs de corta duración (TTL 1 hora).
 *
 * Respuesta: { success: true, data: GetPatientRequestOutput }
 */

import { NextRequest, NextResponse } from 'next/server';
import { backendGet } from '@/lib/api-client.server';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';

interface PatientRequestAttachmentDto {
  id: string;
  fileName: string;
  contentType: string | null;
  sizeBytes: number | null;
  signedUrl: string;
  uploadedAt: string;
}

interface GetPatientRequestData {
  id: string;
  patientId: string;
  patientName: string;
  title: string;
  description: string | null;
  responseText: string | null;
  status: 'pending' | 'fulfilled' | 'revoked';
  createdAt: string;
  fulfilledAt: string | null;
  attachments: PatientRequestAttachmentDto[];
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  const result = await backendGet<GetPatientRequestData>(`/api/doctor/patient-requests/${id}`);

  if (!result.ok) {
    log.error('[patient-requests detail GET] backend error', {
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
