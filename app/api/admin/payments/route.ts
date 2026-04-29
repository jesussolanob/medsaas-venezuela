/**
 * GET /api/admin/payments
 * Lista de comprobantes de pago de suscripción.
 * Query: ?status=pending|approved|rejected (default: pending)
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth-guards'

export async function GET(req: NextRequest) {
  const guard = await requireSuperAdmin()
  if (!guard.ok) return guard.response
  const { admin } = guard

  const status = new URL(req.url).searchParams.get('status') || 'pending'

  const { data, error } = await admin
    .from('subscription_payments')
    .select(`
      id, doctor_id, amount_usd, duration_months, method, reference_number,
      receipt_url, status, notes, rejection_reason, created_at, reviewed_at,
      profiles!subscription_payments_doctor_id_fkey ( full_name, email, specialty )
    `)
    .eq('status', status)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ payments: data || [] })
}
