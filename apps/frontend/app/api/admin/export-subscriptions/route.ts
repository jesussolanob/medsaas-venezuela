// REINGENIERÍA 2026-04-22: exporta desde profiles.
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/auth-guards'

export async function GET() {
  const guard = await requireSuperAdmin()
  if (!guard.ok) return guard.response

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('profiles')
    .select('id, full_name, email, specialty, plan, subscription_status, subscription_expires_at, created_at')
    .eq('role', 'doctor')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const csv = [
    ['id', 'full_name', 'email', 'specialty', 'plan', 'status', 'expires_at', 'created_at'].join(','),
    ...(data || []).map((d: any) =>
      [d.id, d.full_name, d.email, d.specialty || '', d.plan || 'trial', d.subscription_status || 'active', d.subscription_expires_at || '', d.created_at]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',')
    ),
  ].join('\n')

  return new NextResponse(csv, {
    headers: { 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename=doctors-${Date.now()}.csv` },
  })
}
