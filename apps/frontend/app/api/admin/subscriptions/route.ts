/**
 * GET /api/admin/subscriptions
 * Lista de doctores con su estado de suscripción.
 *
 * Query params (todos opcionales):
 *   ?filter=expiring | expired | trial | active | suspended
 *   ?search=<email o nombre>
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth-guards'

export async function GET(req: NextRequest) {
  const guard = await requireSuperAdmin()
  if (!guard.ok) return guard.response
  const { admin } = guard

  const { searchParams } = new URL(req.url)
  const filter = searchParams.get('filter')
  const search = searchParams.get('search')?.trim()

  let q = admin.from('subscription_status_view').select('*').order('current_period_end', { ascending: true })

  if (filter === 'expired') q = q.eq('is_expired', true)
  else if (filter === 'expiring') q = q.eq('expiring_soon', true)
  else if (filter === 'trial') q = q.eq('is_in_trial', true)
  else if (filter === 'active') q = q.eq('status', 'active')
  else if (filter === 'suspended') q = q.eq('status', 'suspended')

  if (search) q = q.or(`doctor_name.ilike.%${search}%,doctor_email.ilike.%${search}%`)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ doctors: data || [] })
}
