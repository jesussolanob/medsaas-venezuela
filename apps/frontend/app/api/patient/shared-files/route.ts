import 'server-only';

/**
 * GET  /api/patient/shared-files
 *   → NestJS GET /api/patient/shared-files
 *   Lista todos los archivos/tareas del paciente logueado.
 *   El backend resuelve el scope del paciente desde auth_user_id (anti-IDOR).
 *   Respuesta: { success: true, data: PatientSharedFileItem[] }
 *
 * POST /api/patient/shared-files
 *   → NestJS POST /api/patient/shared-files
 *   Crea un item con created_by=patient (respuesta, comentario, archivo subido).
 *   El backend resuelve patient_id y doctor_id desde auth_user_id.
 *   Body: { title, description?, category, filePath?, fileType?, fileSizeBytes?, parentTaskId? }
 *   Respuesta: { success: true, data: PatientSharedFileItem }
 */

import { NextRequest, NextResponse } from 'next/server';
import { backendGet, backendPost } from '@/lib/api-client.server';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Tipos de respuesta del backend
// ---------------------------------------------------------------------------

export interface PatientSharedFileItem {
  id: string;
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
}

interface CreateBody {
  title?: string;
  description?: string | null;
  category?: string;
  filePath?: string | null;
  fileType?: string | null;
  fileSizeBytes?: number | null;
  parentTaskId?: string | null;
}

// ---------------------------------------------------------------------------
// GET — lista de items del paciente logueado
// ---------------------------------------------------------------------------

export async function GET(): Promise<NextResponse> {
  const result = await backendGet<PatientSharedFileItem[]>('/api/patient/shared-files');

  if (!result.ok) {
    log.error('[patient/shared-files GET] backend error', {
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
// POST — crear respuesta del paciente
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  const category = typeof body?.category === 'string' ? body.category.trim() : '';

  if (!title) {
    return NextResponse.json({ error: 'El título es requerido' }, { status: 400 });
  }
  if (!category) {
    return NextResponse.json({ error: 'La categoría es requerida' }, { status: 400 });
  }

  const result = await backendPost<PatientSharedFileItem>('/api/patient/shared-files', {
    title,
    description: body?.description ?? null,
    category,
    filePath: body?.filePath ?? null,
    fileType: body?.fileType ?? null,
    fileSizeBytes: body?.fileSizeBytes ?? null,
    parentTaskId: body?.parentTaskId ?? null,
  });

  if (!result.ok) {
    log.error('[patient/shared-files POST] backend error', {
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
