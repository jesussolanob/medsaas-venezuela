/**
 * POST /api/admin/doctor-verifications/[doctorId]/verify-mpps
 *
 * Thin-proxy al backend NestJS. Dispara la verificación automática de MPPS
 * contra el portal SACS para un médico específico.
 *
 * Auth: super_admin only.
 *
 * Query params:
 *   ?force=true → fuerza re-verificación incluso si ya existe un resultado.
 *
 * Backend response shape:
 *   { success: true, data: { doctorId, credentialType, status, attempts, checkedAt } }
 *
 * status ∈ 'pending' | 'verified' | 'not_found' | 'mismatch' | 'error'
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth-guards';
import { backendFetch } from '@/lib/api-client.server';

export interface MppsVerificationResult {
  doctorId: string;
  credentialType: 'mpps';
  status: 'pending' | 'verified' | 'not_found' | 'mismatch' | 'error';
  attempts: number;
  checkedAt: string | null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ doctorId: string }> },
): Promise<NextResponse> {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const { doctorId } = await params;

  if (!doctorId) {
    return NextResponse.json({ error: 'doctorId es requerido' }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const force = searchParams.get('force') === 'true';

  const backendPath = `/api/admin/doctor-verifications/${encodeURIComponent(doctorId)}/verify-mpps${force ? '?force=true' : ''}`;

  const result = await backendFetch<MppsVerificationResult>(backendPath, {
    method: 'POST',
    body: {},
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }

  return NextResponse.json({ success: true, data: result.value });
}
