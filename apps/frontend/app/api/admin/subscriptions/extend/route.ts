/**
 * POST /api/admin/subscriptions/extend
 * Extiende la suscripción de un doctor por N meses (manual grant).
 * body: { doctor_id: string; months: number; reason?: string }
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth-guards'
import { extendSubscription } from '@/lib/subscription'

export async function POST(req: NextRequest) {
  const guard = await requireSuperAdmin()
  if (!guard.ok) return guard.response

  const body = await req.json()
  const { doctor_id, months, reason } = body
  if (!doctor_id || !months || months < 1) {
    return NextResponse.json({ error: 'doctor_id + months>=1 requerido' }, { status: 400 })
  }

  const result = await extendSubscription({
    doctor_id,
    months: Number(months),
    actor_id: guard.user.id,
    actor_role: 'super_admin',
    reason: 'manual_grant',
    metadata: reason ? { reason } : undefined,
  })

  if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 })
  return NextResponse.json(result)
}
