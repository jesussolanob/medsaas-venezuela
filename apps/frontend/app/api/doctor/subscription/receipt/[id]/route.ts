/**
 * GET /api/doctor/subscription/receipt/:id
 * Devuelve un comprobante de pago.
 * - Doctor solo puede ver los suyos.
 * - super_admin puede ver cualquiera.
 *
 * FASE 5/6: pendiente backend — Supabase Storage download and subscription_payments
 * lookup not yet implemented in NestJS. Using createAdminClient locally until the
 * billing/storage module is migrated.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = await requireRole(['doctor', 'super_admin']);
  if (!guard.ok) return guard.response;

  // FASE 5/6: pendiente backend — Supabase admin used for storage download + payment lookup
  const admin = createAdminClient();

  const { data: payment } = await admin
    .from('subscription_payments')
    .select('doctor_id, receipt_url')
    .eq('id', id)
    .single();

  if (!payment || !payment.receipt_url) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  }
  if (guard.profile.role !== 'super_admin' && payment.doctor_id !== guard.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: file, error } = await admin.storage
    .from('payment-receipts')
    .download(payment.receipt_url);
  if (error || !file) return NextResponse.json({ error: 'Error descargando' }, { status: 500 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = payment.receipt_url.split('.').pop()?.toLowerCase() || '';
  const mime =
    ext === 'pdf'
      ? 'application/pdf'
      : ext === 'png'
        ? 'image/png'
        : ext === 'webp'
          ? 'image/webp'
          : 'image/jpeg';

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': mime,
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, max-age=300',
    },
  });
}
