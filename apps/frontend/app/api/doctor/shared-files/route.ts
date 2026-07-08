import 'server-only';

/**
 * GET  /api/doctor/shared-files?patientId=<id>
 *   → NestJS GET /api/doctor/shared-files?patientId=<id>
 *   Lista archivos/tareas compartidos con el paciente.
 *   Respuesta: { success: true, data: SharedFileItem[] }
 *
 * POST /api/doctor/shared-files
 *   → NestJS POST /api/doctor/shared-files
 *   Crea un item (tarea, archivo, comentario) con created_by=doctor.
 *   Body: { patientId, title, description?, category, filePath?, fileType?, fileSizeBytes?, parentTaskId? }
 *   Respuesta: { success: true, data: SharedFileItem }
 */

import { NextRequest, NextResponse } from 'next/server';
import { backendGet, backendPost } from '@/lib/api-client.server';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Tipos de respuesta del backend
// ---------------------------------------------------------------------------

export interface SharedFileItem {
  id: string;
  doctorId: string;
  patientId: string;
  title: string;
  description: string | null;
  fileUrl: string | null;
  fileType: string | null;
  fileSizeBytes: number | null;
  category: 'instruction' | 'file' | 'recipe' | 'lab_result' | 'image' | 'other' | 'comment';
  status: 'pending' | 'completed' | 'reviewed';
  createdBy: 'doctor' | 'patient';
  parentTaskId: string | null;
  readByDoctor: boolean;
  readByPatient: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CreateBody {
  patientId?: string;
  title?: string;
  description?: string | null;
  category?: string;
  filePath?: string | null;
  fileType?: string | null;
  fileSizeBytes?: number | null;
  parentTaskId?: string | null;
}

// ---------------------------------------------------------------------------
// GET — lista de archivos compartidos del paciente
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest): Promise<NextResponse> {
  const patientId = req.nextUrl.searchParams.get('patientId');

  if (!patientId) {
    return NextResponse.json({ error: 'El parámetro patientId es requerido' }, { status: 400 });
  }

  const result = await backendGet<SharedFileItem[]>(
    `/api/doctor/shared-files?patientId=${encodeURIComponent(patientId)}`,
  );

  if (!result.ok) {
    log.error('[shared-files GET] backend error', {
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
// POST — crear item compartido
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  const patientId = typeof body?.patientId === 'string' ? body.patientId.trim() : '';
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  const category = typeof body?.category === 'string' ? body.category.trim() : '';

  if (!patientId) {
    return NextResponse.json({ error: 'El ID del paciente es requerido' }, { status: 400 });
  }
  if (!title) {
    return NextResponse.json({ error: 'El título es requerido' }, { status: 400 });
  }
  if (!category) {
    return NextResponse.json({ error: 'La categoría es requerida' }, { status: 400 });
  }

  const result = await backendPost<SharedFileItem>('/api/doctor/shared-files', {
    patientId,
    title,
    description: body?.description ?? null,
    category,
    filePath: body?.filePath ?? null,
    fileType: body?.fileType ?? null,
    fileSizeBytes: body?.fileSizeBytes ?? null,
    parentTaskId: body?.parentTaskId ?? null,
  });

  if (!result.ok) {
    log.error('[shared-files POST] backend error', {
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
