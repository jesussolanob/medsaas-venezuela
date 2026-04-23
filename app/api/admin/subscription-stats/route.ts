// REINGENIERÍA 2026-04-22: lee de profiles directamente.
// Devuelve formato compatible con AdminSubscriptionChart: { chartData[], momGrowth, newThisMonth, totals }
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireSuperAdmin } from '@/lib/auth-guards'

export async function GET() {
  const guard = await requireSuperAdmin()
  if (!guard.ok) return guard.response

  const admin = createAdminClient()

  // Todos los doctores con sus fechas de creación
  const { data: doctors, error } = await admin
    .from('profiles')
    .select('id, plan, subscription_status, subscription_expires_at, created_at')
    .eq('role', 'doctor')
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Agrupar por mes (últimos 6 meses)
  const now = new Date()
  const monthCounts: Record<string, number> = {}
  const months: string[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = d.toISOString().slice(0, 7) // YYYY-MM
    monthCounts[key] = 0
    months.push(key)
  }

  ;(doctors || []).forEach((d: any) => {
    const key = new Date(d.created_at).toISOString().slice(0, 7)
    if (key in monthCounts) monthCounts[key]++
  })

  const chartData = months.map((m) => {
    const date = new Date(m + '-01')
    return {
      month: date.toLocaleDateString('es-VE', { month: 'short' }),
      count: monthCounts[m] || 0,
    }
  })

  // MoM growth
  const current = monthCounts[months[months.length - 1]] || 0
  const previous = monthCounts[months[months.length - 2]] || 0
  let momGrowth = 0
  if (previous > 0) momGrowth = parseFloat((((current - previous) / previous) * 100).toFixed(1))
  else if (current > 0) momGrowth = 100

  // Totales por status (desde profiles)
  const totals = (doctors || []).reduce(
    (acc: Record<string, number>, d: any) => {
      acc.total = (acc.total || 0) + 1
      const key = `${d.plan || 'trial'}_${d.subscription_status || 'active'}`
      acc[key] = (acc[key] || 0) + 1
      if (d.subscription_status === 'active') acc.active = (acc.active || 0) + 1
      if (d.plan === 'trial') acc.trial = (acc.trial || 0) + 1
      return acc
    },
    { total: 0, active: 0, trial: 0 }
  )

  return NextResponse.json({
    chartData,
    momGrowth,
    newThisMonth: current,
    totals,
  })
}
