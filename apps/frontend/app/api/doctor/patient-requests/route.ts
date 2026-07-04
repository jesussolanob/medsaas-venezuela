import 'server-only';

/**
 * GET  /api/doctor/patient-requests
 *   → NestJS GET /api/doctor/patient-requests
 *   Devuelve la lista de solicitudes del médico autenticado.
 *   Respuesta: { success: true, data: { items: PatientRequestListItem[] } }
 *
 * POST /api/doctor/patient-requests
 *   → NestJS POST /api/doctor/patient-requests
 *   Crea una solicitud de documentos al paciente.
 *   Body: { patientId, title, description? }
 *   Respuesta: { success: true, data: { id, token, url, expiresAt } }
 */

import { NextRequest, NextResponse } from 'next/server';
import { backendGet, backendPost } from '@/lib/api-client.server';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Tipos de respuesta del backend
// ---------------------------------------------------------------------------

interface PatientRequestListItem {
  id: string;
  patientId: string;
  patientName: string;
  title: string;
  description: string | null;
  status: 'pending' | 'fulfilled' | 'revoked';
  attachmentCount: number;
  createdAt: string;
  fulfilledAt: string | null;
}

interface ListData {
  items: PatientRequestListItem[];
}

interface CreateData {
  id: string;
  token: string;
  url: string;
  expiresAt: string;
}

// ---------------------------------------------------------------------------
// GET — lista de solicitudes del médico
// ---------------------------------------------------------------------------

export async function GET(): Promise<NextResponse> {
  const result = await backendGet<ListData>('/api/doctor/patient-requests');

  if (!result.ok) {
    log.error('[patient-requests GET] backend error', {
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
// POST — crear solicitud de documentos
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { patientId?: string; title?: string; description?: string | null };
  try {
    body = (await req.json()) as {
      patientId?: string;
      title?: string;
      description?: string | null;
    };
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  const patientId = typeof body?.patientId === 'string' ? body.patientId.trim() : '';
  const title = typeof body?.title === 'string' ? body.title.trim() : '';

  if (!patientId) {
    return NextResponse.json({ error: 'El ID del paciente es requerido' }, { status: 400 });
  }
  if (!title) {
    return NextResponse.json({ error: 'El título es requerido' }, { status: 400 });
  }

  const result = await backendPost<CreateData>('/api/doctor/patient-requests', {
    patientId,
    title,
    description: body?.description ?? null,
  });

  if (!result.ok) {
    log.error('[patient-requests POST] backend error', {
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
