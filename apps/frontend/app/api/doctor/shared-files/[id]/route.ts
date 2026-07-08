import 'server-only';

/**
 * PATCH /api/doctor/shared-files/[id]
 *   → NestJS PATCH /api/doctor/shared-files/:id
 *   Actualiza título, descripción o estado de un item. Solo items del doctor.
 *   Body: { title?, description?, status?, filePath?, fileType?, fileSizeBytes? }
 *   Respuesta: { success: true, data: SharedFileItem }
 *
 * DELETE /api/doctor/shared-files/[id]
 *   → NestJS DELETE /api/doctor/shared-files/:id
 *   Elimina un item del doctor.
 *   Respuesta: { success: true, data: null }
 */

import { NextRequest, NextResponse } from 'next/server';
import { backendPatch, backendDelete } from '@/lib/api-client.server';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';

interface SharedFileItem {
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

interface PatchBody {
  title?: string;
  description?: string | null;
  status?: 'pending' | 'completed' | 'reviewed';
  filePath?: string | null;
  fileType?: string | null;
  fileSizeBytes?: number | null;
}

// ---------------------------------------------------------------------------
// PATCH — actualizar item
// ---------------------------------------------------------------------------

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  const result = await backendPatch<SharedFileItem>(`/api/doctor/shared-files/${id}`, body);

  if (!result.ok) {
    log.error('[shared-files PATCH] backend error', {
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
// DELETE — eliminar item
// ---------------------------------------------------------------------------

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  const result = await backendDelete<null>(`/api/doctor/shared-files/${id}`);

  if (!result.ok) {
    log.error('[shared-files DELETE] backend error', {
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
