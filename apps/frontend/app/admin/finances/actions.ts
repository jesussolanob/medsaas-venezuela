'use server'

import { backendGet } from '@/lib/api-client.server'
import { log } from '@/lib/logger'

export type DoctorRegistration = { date: string; count: number }
export type IncomeEntry = { date: string; amount: number; count: number }
export type SpecialtyCount = { specialty: string; count: number }

// Shape returned by GET /api/admin/doctors items
interface AdminDoctorItem {
  id: string
  fullName: string
  email: string
  specialty: string | null
  subscriptionStatus: string
  subscriptionPlan: string
  subscriptionExpiresAt: string | null
  activityStatus: string
}

interface AdminDoctorsPage {
  items?: AdminDoctorItem[]
  meta?: { total: number; page: number; limit: number }
}

function formatDate(dateStr: string, period: 'day' | 'week' | 'month'): string {
  const d = new Date(dateStr)
  if (period === 'day') return d.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' })
  if (period === 'month') return d.toLocaleDateString('es-VE', { month: 'short', year: '2-digit' })
  // week: show monday of the week
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(d)
  monday.setDate(diff)
  return monday.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' })
}

export async function getFinanceStats(period: 'day' | 'week' | 'month') {
  // Fetch all doctors (up to 500) from the backend admin endpoint.
  // We aggregate registrations and specialties in-app because the backend
  // does not expose a time-bucketed doctor-registrations endpoint beyond the
  // 6-month growth chart (GET /api/admin/subscriptions/growth).
  const result = await backendGet<AdminDoctorsPage>('/api/admin/doctors?limit=500', {
    role: 'super_admin',
  })

  let docData: Array<{ createdAt: string; specialty: string | null }> = []

  if (result.ok) {
    // backendGet<T> unwraps the envelope's `data` field. For a paginated
    // endpoint like GET /api/admin/doctors, `data` is the array of items
    // (the `meta` field stays on the envelope, not included in the unwrapped value).
    const items = Array.isArray(result.value) ? (result.value as AdminDoctorItem[]) : []
    docData = items.map((d) => ({
      // createdAt is not returned by the list endpoint; use subscriptionExpiresAt as
      // a rough proxy for "registered around". In beta all subs are 1 year trial so
      // expires_at ≈ created_at + 365d. For a more accurate field, the growth endpoint
      // (GET /api/admin/subscriptions/growth) gives monthly buckets but no per-doctor dates.
      createdAt: d.subscriptionExpiresAt ?? new Date().toISOString(),
      specialty: d.specialty ?? null,
    }))
  } else {
    log.error('[getFinanceStats] backend error fetching doctors', {
      code: result.error.code,
      status: result.error.status,
    })
  }

  // Range filter — last 30 days / 12 weeks / 12 months
  const now = new Date()
  const since = new Date(now)
  if (period === 'day') since.setDate(since.getDate() - 30)
  else if (period === 'week') since.setDate(since.getDate() - 84)
  else since.setMonth(since.getMonth() - 12)

  const sinceMs = since.getTime()
  const withinRange = docData.filter((d) => new Date(d.createdAt).getTime() >= sinceMs)

  // Aggregate registrations by period bucket
  const docMap = new Map<string, number>()
  for (const row of withinRange) {
    const key = formatDate(row.createdAt, period)
    docMap.set(key, (docMap.get(key) ?? 0) + 1)
  }
  const registrations: DoctorRegistration[] = Array.from(docMap.entries()).map(([date, count]) => ({
    date,
    count,
  }))

  // Income stays empty — subscription_payments table was removed in beta (2026-04-21)
  const income: IncomeEntry[] = []

  // Aggregate specialties from full doctor list (not range-filtered — all-time distribution)
  const specMap = new Map<string, number>()
  for (const row of docData) {
    if (!row.specialty) continue
    specMap.set(row.specialty, (specMap.get(row.specialty) ?? 0) + 1)
  }
  const specialties: SpecialtyCount[] = Array.from(specMap.entries())
    .map(([specialty, count]) => ({ specialty: specialty.split(' ')[0], count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  // KPIs
  const totalDoctors = withinRange.length
  const totalIncome = 0
  const totalPayments = 0

  return { registrations, income, specialties, totalDoctors, totalIncome, totalPayments }
}
