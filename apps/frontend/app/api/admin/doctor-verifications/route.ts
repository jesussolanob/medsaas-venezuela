/**
 * GET /api/admin/doctor-verifications — thin-proxy al backend NestJS.
 *
 * Query params forwarded:
 *   ?status=pending|verified|rejected
 *   ?limit=<number>
 *   ?offset=<number>
 *
 * Auth: super_admin only.
 *
 * Response shape (from backend, camelCase):
 *   { success: true, data: VerificationListItemDto[] }
 *
 * VerificationListItemDto:
 *   { doctorId, fullName, email, cedula, mppsNumber, colegiadoNumber, verificationStatus, createdAt }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth-guards';
import { backendGet } from '@/lib/api-client.server';

export interface VerificationItem {
  doctorId: string;
  fullName: string;
  email: string;
  cedula: string | null;
  mppsNumber: string | null;
  colegiadoNumber: string | null;
  verificationStatus: string;
  createdAt: string;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(req.url);

  const params = new URLSearchParams();
  const status = searchParams.get('status');
  if (status) params.set('status', status);

  const limit = searchParams.get('limit');
  if (limit) params.set('limit', limit);

  const offset = searchParams.get('offset');
  if (offset) params.set('offset', offset);

  const result = await backendGet<VerificationItem[]>(
    `/api/admin/doctor-verifications?${params.toString()}`,
  );

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }

  return NextResponse.json({ success: true, data: result.value });
}
