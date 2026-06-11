/**
 * PUT /api/admin/doctor-verifications/[doctorId] — thin-proxy al backend NestJS.
 *
 * Updates the verification status of a doctor.
 * Auth: super_admin only.
 *
 * Request body: { status: 'verified' | 'rejected' }
 *
 * Backend response:
 *   { success: true, data: { doctorId, verificationStatus, verifiedAt, verifiedBy } }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth-guards';
import { backendPut } from '@/lib/api-client.server';

interface UpdateVerificationBody {
  status: 'verified' | 'rejected';
}

interface BackendUpdateResponse {
  doctorId: string;
  verificationStatus: string;
  verifiedAt: string | null;
  verifiedBy: string | null;
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ doctorId: string }> },
): Promise<NextResponse> {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const { doctorId } = await params;

  if (!doctorId) {
    return NextResponse.json({ error: 'doctorId requerido' }, { status: 400 });
  }

  let body: UpdateVerificationBody;
  try {
    body = (await req.json()) as UpdateVerificationBody;
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la solicitud inválido' }, { status: 400 });
  }

  if (body.status !== 'verified' && body.status !== 'rejected') {
    return NextResponse.json(
      { error: 'El estado debe ser "verified" o "rejected"' },
      { status: 400 },
    );
  }

  const result = await backendPut<BackendUpdateResponse>(
    `/api/admin/doctor-verifications/${doctorId}`,
    { status: body.status },
  );

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }

  return NextResponse.json({ success: true, data: result.value });
}
