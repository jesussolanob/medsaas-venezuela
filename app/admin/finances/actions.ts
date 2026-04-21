'use server'

import { createAdminClient } from '@/lib/supabase/admin'

export type DoctorRegistration = { date: string; count: number }
export type IncomeEntry = { date: string; amount: number; count: number }
export type SpecialtyCount = { specialty: string; count: number }

function formatDate(dateStr: string, period: 'day' | 'week' | 'month'): string {
  const d = new Date(dateStr)
  if (period === 'day') return d.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' })
  if (period === 'month') return d.toLocaleDateString('es-VE', { month: 'short', year: '2-digit' })
  // week: show start of week
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(d.setDate(diff))
  return monday.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' })
}

export async function getFinanceStats(period: 'day' | 'week' | 'month') {
  const supabase = createAdminClient()

  // Range: last 30 days / 12 weeks / 12 months
  const now = new Date()
  const since = new Date(now)
  if (period === 'day') since.setDate(since.getDate() - 30)
  else if (period === 'week') since.setDate(since.getDate() - 84)
  else since.setMonth(since.getMonth() - 12)

  // 1. Doctor registrations
  const { data: docData } = await supabase
    .from('profiles')
    .select('created_at')
    .eq('role', 'doctor')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: true })

  // 2. Verified payments — flujo eliminado, devolvemos array vacío en beta
  const payData: { created_at: string; amount: number }[] = []

  // 3. Specialties
  const { data: specData } = await supabase
    .from('profiles')
    .select('specialty')
    .eq('role', 'doctor')
    .not('specialty', 'is', null)

  // Aggregate doctors by period
  const docMap = new Map<string, number>()
  for (const row of docData ?? []) {
    const key = formatDate(row.created_at, period)
    docMap.set(key, (docMap.get(key) ?? 0) + 1)
  }
  const registrations: DoctorRegistration[] = Array.from(docMap.entries()).map(([date, count]) => ({ date, count }))

  // Aggregate payments by period
  const payMap = new Map<string, { amount: number; count: number }>()
  for (const row of payData ?? []) {
    const key = formatDate(row.created_at, period)
    const prev = payMap.get(key) ?? { amount: 0, count: 0 }
    payMap.set(key, { amount: prev.amount + (row.amount ?? 0), count: prev.count + 1 })
  }
  const income: IncomeEntry[] = Array.from(payMap.entries()).map(([date, v]) => ({ date, amount: v.amount, count: v.count }))

  // Aggregate by specialty
  const specMap = new Map<string, number>()
  for (const row of specData ?? []) {
    if (!row.specialty) continue
    specMap.set(row.specialty, (specMap.get(row.specialty) ?? 0) + 1)
  }
  const specialties: SpecialtyCount[] = Array.from(specMap.entries())
    .map(([specialty, count]) => ({ specialty: specialty.split(' ')[0], count })) // short name
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  // KPIs
  const totalDoctors = (docData?.length ?? 0)
  const totalIncome = (payData ?? []).reduce((s, r) => s + (r.amount ?? 0), 0)
  const totalPayments = payData?.length ?? 0

  return { registrations, income, specialties, totalDoctors, totalIncome, totalPayments }
}
