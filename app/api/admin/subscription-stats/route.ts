// REINGENIERÍA 2026-04-22: lee de profiles directamente.
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/auth-guards'

export async function GET() {
  const guard = await requireSuperAdmin()
  if (!guard.ok) return guard.response

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('profiles')
    .select('plan, subscription_status')
    .eq('role', 'doctor')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const stats = (data || []).reduce(
    (acc: Record<string, number>, row: any) => {
      const key = `${row.plan || 'trial'}_${row.subscription_status || 'active'}`
      acc[key] = (acc[key] || 0) + 1
      acc.total = (acc.total || 0) + 1
      return acc
    },
    { total: 0 }
  )

  return NextResponse.json(stats)
}
