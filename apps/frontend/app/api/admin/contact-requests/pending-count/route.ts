/**
 * GET /api/admin/contact-requests/pending-count
 *
 * Thin-proxy → NestJS GET /api/admin/contact-requests/pending-count
 * Returns: { count: number }
 */
import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth-guards';
import { backendGet } from '@/lib/api-client.server';

export const dynamic = 'force-dynamic';

interface PendingCountResponse {
  count: number;
}

export async function GET() {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const result = await backendGet<PendingCountResponse>(
    '/api/admin/contact-requests/pending-count',
  );
  if (!result.ok) {
    // Best-effort: return 0 count on error to avoid breaking the bell
    return NextResponse.json({ success: true, data: { count: 0 } });
  }
  return NextResponse.json({ success: true, data: result.value });
}
