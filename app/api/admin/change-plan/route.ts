// REINGENIERÍA 2026-04-22: ahora actualiza profiles.plan directamente.
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/auth-guards'

export async function POST(req: NextRequest) {
  const guard = await requireSuperAdmin()
  if (!guard.ok) return guard.response

  const body = await req.json()
  const { doctorId, plan } = body
  if (!doctorId || !plan) {
    return NextResponse.json({ error: 'doctorId y plan requeridos' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('profiles')
    .update({ plan })
    .eq('id', doctorId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
