/**
 * GET /api/admin/subscription-payments/:id/receipt-url
 *
 * Thin-proxy → NestJS GET /api/admin/subscription-payments/:id/receipt-url
 *
 * Returns a short-lived signed URL for the payment receipt stored in GCS.
 * The URL is NOT embedded in the payments list (to avoid leaking pre-signed
 * URLs in bulk). Admins fetch it on-demand before opening the file.
 *
 * Response: { url: string }
 * Requires: super_admin role.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import { backendGet } from '@/lib/api-client.server';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guard = await requireRole(['super_admin']);
  if (!guard.ok) return guard.response;

  const { id } = await params;
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'ID de pago requerido' }, { status: 400 });
  }

  const result = await backendGet<{ signedUrl: string }>(
    `/api/admin/subscription-payments/${encodeURIComponent(id)}/receipt-url`,
  );

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message, code: result.error.code },
      { status: result.error.status || 500 },
    );
  }

  // Backend returns { signedUrl } — expose it as { url } to the UI layer.
  return NextResponse.json({ url: result.value.signedUrl });
}
