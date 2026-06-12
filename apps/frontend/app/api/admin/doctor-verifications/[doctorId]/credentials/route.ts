/**
 * GET /api/admin/doctor-verifications/[doctorId]/credentials
 *
 * Thin-proxy al backend NestJS. Obtiene los registros de verificación de
 * credenciales de un médico sin re-consultar el portal externo.
 *
 * Auth: super_admin only.
 *
 * Backend response shape:
 *   { success: true, data: CredentialRecord[] }
 *
 * CredentialRecord: {
 *   credentialType: string
 *   status: 'pending' | 'verified' | 'not_found' | 'mismatch' | 'error'
 *   declaredValue: string | null
 *   evidence: unknown | null
 *   checkedAt: string | null
 *   attempts: number
 *   lastError: string | null
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth-guards';
import { backendGet } from '@/lib/api-client.server';

export interface CredentialRecord {
  credentialType: string;
  status: 'pending' | 'verified' | 'not_found' | 'mismatch' | 'error';
  declaredValue: string | null;
  evidence: unknown | null;
  checkedAt: string | null;
  attempts: number;
  lastError: string | null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ doctorId: string }> },
): Promise<NextResponse> {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const { doctorId } = await params;

  if (!doctorId) {
    return NextResponse.json({ error: 'doctorId es requerido' }, { status: 400 });
  }

  const result = await backendGet<CredentialRecord[]>(
    `/api/admin/doctor-verifications/${encodeURIComponent(doctorId)}/credentials`,
  );

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }

  return NextResponse.json({ success: true, data: result.value });
}
