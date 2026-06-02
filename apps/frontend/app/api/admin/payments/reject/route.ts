/**
 * POST /api/admin/payments/reject
 * body: { payment_id: string; reason: string }
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth-guards'
import { logSubscriptionChange } from '@/lib/subscription'
import { sendPaymentRejectedEmail } from '@/lib/email'

export async function POST(req: NextRequest) {
  const guard = await requireSuperAdmin()
  if (!guard.ok) return guard.response
  const { admin } = guard

  const { payment_id, reason } = await req.json()
  if (!payment_id || !reason) {
    return NextResponse.json({ error: 'payment_id + reason requeridos' }, { status: 400 })
  }

  const { data: payment } = await admin
    .from('subscription_payments').select('doctor_id, status').eq('id', payment_id).single()
  if (!payment) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (payment.status !== 'pending') {
    return NextResponse.json({ error: 'Solo se pueden rechazar comprobantes pendientes' }, { status: 400 })
  }

  const { error } = await admin
    .from('subscription_payments')
    .update({
      status: 'rejected',
      rejection_reason: reason,
      reviewed_by: guard.user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', payment_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logSubscriptionChange({
    doctor_id: payment.doctor_id,
    action: 'payment_rejected',
    actor_id: guard.user.id,
    actor_role: 'super_admin',
    metadata: { reason },
    payment_id,
  })

  // Email al doctor (no-bloqueante)
  try {
    const { data: doctor } = await admin
      .from('profiles')
      .select('email, full_name')
      .eq('id', payment.doctor_id)
      .single()
    if (doctor?.email) {
      await sendPaymentRejectedEmail({
        to: doctor.email,
        doctor_name: doctor.full_name || 'Doctor/a',
        reason,
      })
    }
  } catch (e) {
    console.warn('[payments/reject] email failed:', e)
  }

  return NextResponse.json({ success: true })
}
