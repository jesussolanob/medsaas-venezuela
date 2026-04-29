/**
 * POST /api/admin/subscriptions/suspend
 * body: { doctor_id: string; reason?: string }
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth-guards'
import { suspendSubscription } from '@/lib/subscription'

export async function POST(req: NextRequest) {
  const guard = await requireSuperAdmin()
  if (!guard.ok) return guard.response
  const { doctor_id, reason } = await req.json()
  if (!doctor_id) return NextResponse.json({ error: 'doctor_id requerido' }, { status: 400 })

  const r = await suspendSubscription({
    doctor_id,
    actor_id: guard.user.id,
    actor_role: 'super_admin',
    reason,
  })
  if (!r.success) return NextResponse.json({ error: r.error }, { status: 500 })
  return NextResponse.json(r)
}
