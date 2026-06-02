/**
 * lib/finances.ts — fuente UNICA de verdad para todas las vistas financieras del doctor
 * (Dashboard, Cobros, Finanzas, Reportes).
 *
 * REGLA: el "saldo / ingresos / dinero real" SIEMPRE se calcula desde la tabla `payments`
 * con `status='approved'`. NUNCA desde `appointments.status='completed'` ni desde
 * `consultations.payment_status='approved'` — esas columnas pueden quedar desincronizadas.
 *
 * Razón: una cita puede estar "completed" pero el pago quedar pendiente (paciente prometio
 * pagar despues). Y un pago puede estar approved aun cuando la cita aun no se atendio
 * (paciente pago por adelantado). El dinero REAL es lo que esta en payments.approved.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type PaymentRow = {
  id: string
  payment_code: string | null
  amount_usd: number | null
  amount_bs: number | null
  status: 'pending' | 'approved'
  paid_at: string | null
  method_snapshot?: string | null
  created_at: string
  // Relacionados (joins opcionales)
  appointment?: {
    id: string
    appointment_code: string | null
    scheduled_at: string
    patient_name: string | null
    plan_name: string | null
    payment_receipt_url: string | null
    consultation_id: string | null
  } | null
  consultation?: {
    consultation_code: string | null
  } | null
}

export type FinanceFilters = {
  doctorId: string
  /** ISO date inclusive */
  fromDate?: string
  /** ISO date inclusive */
  toDate?: string
  status?: 'pending' | 'approved' | 'all'
}

/**
 * Lee TODOS los payments del doctor con sus relaciones (appointment + consultation).
 * Use esta funcion en cualquier vista financiera (Dashboard, Cobros, Finanzas).
 */
export async function fetchPayments(
  supabase: SupabaseClient,
  filters: FinanceFilters
): Promise<PaymentRow[]> {
  // FK real: appointments.payment_id → payments.id (FK appointments_payment_id_fkey)
  // El JOIN inverso desde payments se hace usando el nombre exacto de esa FK.
  // Para consultation: la traemos via appointment.consultation_id en lugar de directo.
  let q = supabase
    .from('payments')
    .select(`
      id, payment_code, amount_usd, amount_bs, status, paid_at, method_snapshot, created_at,
      appointment:appointments!appointments_payment_id_fkey (
        id, appointment_code, scheduled_at, patient_name, plan_name, payment_receipt_url, consultation_id,
        consultation:consultations!appointments_consultation_id_fkey (
          consultation_code
        )
      )
    `)
    .eq('doctor_id', filters.doctorId)
    .order('created_at', { ascending: false })

  if (filters.status && filters.status !== 'all') {
    q = q.eq('status', filters.status)
  }
  if (filters.fromDate) {
    q = q.gte('created_at', filters.fromDate)
  }
  if (filters.toDate) {
    q = q.lte('created_at', filters.toDate)
  }

  const { data, error } = await q
  if (error) {
    console.error('[fetchPayments] error', error)
    return []
  }
  // Supabase devuelve relaciones como array si la FK no es 1-1 — normalizar a objeto
  return (data || []).map((p: any) => {
    const appt = Array.isArray(p.appointment) ? p.appointment[0] : p.appointment
    const cons = appt && (Array.isArray(appt.consultation) ? appt.consultation[0] : appt.consultation)
    return {
      ...p,
      appointment: appt,
      consultation: cons,
    }
  }) as PaymentRow[]
}

/**
 * Variante simple para sumar totales sin traer relaciones (mas rapido).
 * Usar en Dashboard/widgets de KPI.
 */
export async function fetchPaymentTotals(
  supabase: SupabaseClient,
  filters: FinanceFilters
): Promise<{ approvedUsd: number; pendingUsd: number; approvedCount: number; pendingCount: number }> {
  let q = supabase
    .from('payments')
    .select('amount_usd, status', { count: 'exact' })
    .eq('doctor_id', filters.doctorId)

  if (filters.fromDate) q = q.gte('created_at', filters.fromDate)
  if (filters.toDate) q = q.lte('created_at', filters.toDate)

  const { data, error } = await q
  if (error) {
    console.error('[fetchPaymentTotals] error', error)
    return { approvedUsd: 0, pendingUsd: 0, approvedCount: 0, pendingCount: 0 }
  }

  let approvedUsd = 0, pendingUsd = 0, approvedCount = 0, pendingCount = 0
  for (const p of (data || []) as Array<{ amount_usd: number | null; status: string }>) {
    const amt = Number(p.amount_usd || 0)
    if (p.status === 'approved') { approvedUsd += amt; approvedCount++ }
    else if (p.status === 'pending') { pendingUsd += amt; pendingCount++ }
  }
  return { approvedUsd, pendingUsd, approvedCount, pendingCount }
}

/**
 * Formato unificado de moneda. Usar SIEMPRE este helper en lugar de toFixed/toLocaleString
 * sueltos para que TODAS las vistas se vean igual.
 *
 * USD: $1,234.56
 * Bs:  Bs 1.234,56
 */
const usdFmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const bsFmt = new Intl.NumberFormat('es-VE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatUsd(amount: number | null | undefined): string {
  return usdFmt.format(Number(amount || 0))
}

export function formatBs(amount: number | null | undefined): string {
  return `Bs ${bsFmt.format(Number(amount || 0))}`
}
