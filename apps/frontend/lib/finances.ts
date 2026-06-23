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

// ETAPA 1: la lectura/escritura de payments se movió al backend (BFF).
// Ver `app/doctor/finances/payments-actions.ts` (getPayments, updatePaymentStatus,
// getPaymentItems, addPaymentItem, removePaymentItem). Este archivo conserva solo
// los tipos compartidos y los formateadores de moneda (puros, sin Supabase).

export type PaymentRow = {
  id: string;
  payment_code: string | null;
  amount_usd: number | null;
  amount_bs: number | null;
  status: 'pending' | 'approved';
  paid_at: string | null;
  method_snapshot?: string | null;
  created_at: string;
  // Relacionados (joins opcionales)
  appointment?: {
    id: string;
    appointment_code: string | null;
    scheduled_at: string;
    patient_name: string | null;
    plan_name: string | null;
    payment_receipt_url: string | null;
    consultation_id: string | null;
    /** Texto plano. Viene del backend desde 7.10. NUNCA loguear (PII). */
    patient_phone?: string | null;
  } | null;
  consultation?: {
    consultation_code: string | null;
  } | null;
};

export type FinanceFilters = {
  doctorId: string;
  /** ISO date inclusive */
  fromDate?: string;
  /** ISO date inclusive */
  toDate?: string;
  status?: 'pending' | 'approved' | 'all';
};

// fetchPayments / fetchPaymentTotals (Supabase) ELIMINADOS en la migración Etapa 1.
// Usar las server actions de `app/doctor/finances/payments-actions.ts`:
//   getPayments(filters) · updatePaymentStatus · getPaymentItems · addPaymentItem · removePaymentItem
// El backend (`/api/finances/payments`) es la fuente de verdad.

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
});

const bsFmt = new Intl.NumberFormat('es-VE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatUsd(amount: number | null | undefined): string {
  return usdFmt.format(Number(amount || 0));
}

export function formatBs(amount: number | null | undefined): string {
  return `Bs ${bsFmt.format(Number(amount || 0))}`;
}
