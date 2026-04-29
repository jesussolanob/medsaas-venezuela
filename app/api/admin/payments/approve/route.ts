/**
 * POST /api/admin/payments/approve
 * body: { payment_id: string }
 *
 * Aprueba un comprobante. Atómicamente:
 *  1. Marca el payment como approved + reviewed_by + reviewed_at.
 *  2. Extiende la suscripción del doctor por payment.duration_months.
 *  3. Inserta un cambio en subscription_changes_log con action='payment_approved'.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth-guards'
import { extendSubscription } from '@/lib/subscription'

export async function POST(req: NextRequest) {
  const guard = await requireSuperAdmin()
  if (!guard.ok) return guard.response
  const { admin } = guard

  const { payment_id } = await req.json()
  if (!payment_id) return NextResponse.json({ error: 'payment_id requerido' }, { status: 400 })

  const { data: payment, error: pErr } = await admin
    .from('subscription_payments')
    .select('*')
    .eq('id', payment_id)
    .single()

  if (pErr || !payment) return NextResponse.json({ error: 'Comprobante no encontrado' }, { status: 404 })
  if (payment.status === 'approved') return NextResponse.json({ error: 'Ya estaba aprobado' }, { status: 400 })

  // 1) Marcar payment como approved
  const { error: updErr } = await admin
    .from('subscription_payments')
    .update({
      status: 'approved',
      reviewed_by: guard.user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', payment_id)
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  // 2) Extender suscripción
  const result = await extendSubscription({
    doctor_id: payment.doctor_id,
    months: Number(payment.duration_months) || 1,
    actor_id: guard.user.id,
    actor_role: 'super_admin',
    reason: 'payment_approved',
    metadata: {
      amount_usd: payment.amount_usd,
      method: payment.method,
      reference: payment.reference_number,
    },
    payment_id,
  })

  if (!result.success) {
    // rollback del estado del payment
    await admin
      .from('subscription_payments')
      .update({ status: 'pending', reviewed_by: null, reviewed_at: null })
      .eq('id', payment_id)
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json({ success: true, new_expires_at: result.new_expires_at })
}
