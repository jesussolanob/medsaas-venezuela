/**
 * GET /api/doctor/subscription/receipt/:id
 * Devuelve un comprobante de pago.
 * - Doctor solo puede ver los suyos.
 * - super_admin puede ver cualquiera.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-guards'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const guard = await requireRole(['doctor', 'super_admin'])
  if (!guard.ok) return guard.response
  const { admin, user, profile } = guard

  const { data: payment } = await admin
    .from('subscription_payments')
    .select('doctor_id, receipt_url')
    .eq('id', id)
    .single()
  if (!payment || !payment.receipt_url) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }
  if (profile.role !== 'super_admin' && payment.doctor_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: file, error } = await admin.storage
    .from('payment-receipts')
    .download(payment.receipt_url)
  if (error || !file) return NextResponse.json({ error: 'Error descargando' }, { status: 500 })

  const buffer = Buffer.from(await file.arrayBuffer())
  // Detectar mime por extensión simple
  const ext = payment.receipt_url.split('.').pop()?.toLowerCase() || ''
  const mime = ext === 'pdf' ? 'application/pdf'
    : ext === 'png' ? 'image/png'
    : ext === 'webp' ? 'image/webp'
    : 'image/jpeg'

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': mime,
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, max-age=300',
    },
  })
}
