/**
 * GET /api/admin/contact-requests
 *
 * Thin-proxy → NestJS GET /api/admin/contact-requests
 * Query params: status?, from? (ISO), to? (ISO), limit?, offset?
 * Returns: { data: ContactRequest[], meta: { total, limit, offset } }
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth-guards';
import { backendGetPaged } from '@/lib/api-client.server';

export const dynamic = 'force-dynamic';

export interface AdminContactRequest {
  id: string;
  doctorId: string;
  doctorName: string;
  doctorEmail: string;
  doctorPhone: string | null;
  doctorPlan: string;
  doctorSpecialty: string | null;
  channel: string;
  message: string | null;
  status: string;
  handledBy: string | null;
  handledAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function GET(req: NextRequest) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const sp = req.nextUrl.searchParams;
  const params = new URLSearchParams();
  if (sp.get('status')) params.set('status', sp.get('status')!);
  if (sp.get('from')) params.set('from', sp.get('from')!);
  if (sp.get('to')) params.set('to', sp.get('to')!);
  if (sp.get('limit')) params.set('limit', sp.get('limit')!);
  if (sp.get('offset')) params.set('offset', sp.get('offset')!);

  const qs = params.toString();
  const result = await backendGetPaged<AdminContactRequest>(
    `/api/admin/contact-requests${qs ? `?${qs}` : ''}`,
  );
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }
  return NextResponse.json({
    success: true,
    data: result.value.items,
    meta: { total: result.value.total },
  });
}
