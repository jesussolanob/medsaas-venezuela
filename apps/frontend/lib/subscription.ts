/**
 * lib/subscription.ts
 * SINGLE SOURCE OF TRUTH for subscription logic across the entire app.
 * Every page/component that needs plan info should use these helpers.
 *
 * MIGRATION NOTE (Etapa 1 — no Supabase):
 *   - getSubscriptionByDoctorId(): migrated to backendGet('/api/admin/subscriptions')
 *     filtered by doctorId.
 *   - getAllSubscriptions():        migrated to backendGet('/api/admin/subscriptions').
 *   - extendSubscription():         migrated to backendPost('/api/admin/subscriptions/extend').
 *   - suspendSubscription():        migrated to backendPost('/api/admin/subscriptions/suspend').
 *   - reactivateSubscription():     migrated to backendPost('/api/admin/subscriptions/reactivate').
 *   - startBetaForNewDoctor():      stub/no-op — registration is a dev-stub in Etapa 1;
 *       real provisioning happens in Etapa 2 via Auth0 + backend.
 *   - logSubscriptionChange():      stub/no-op — backend performs its own audit logging;
 *       the frontend no longer writes to subscription_changes_log directly.
 *   - getAppSettings():             returns DEFAULT_SETTINGS (hardcoded). FASE futura:
 *       migrate to backendGet('/api/admin/settings') when all keys are covered.
 *   - setAppSetting():              no-op stub (FASE futura: backendPut('/api/admin/settings')).
 *   - computeDurationOptions():     returns static monthly option only (FASE futura: backend).
 */

import 'server-only';
import { backendGet, backendPost } from './api-client.server';

// ── Types ────────────────────────────────────────────────────────────────────
export type PlanKey = 'trial' | 'basic' | 'professional' | 'enterprise' | 'clinic'
export type SubStatus = 'active' | 'trial' | 'past_due' | 'suspended' | 'cancelled'

export interface Subscription {
  id: string
  doctor_id: string
  plan: PlanKey
  status: SubStatus
  price_usd: number
  current_period_end: string | null
  created_at: string
}

export interface SubscriptionInfo {
  plan: PlanKey
  status: SubStatus
  isActive: boolean
  daysRemaining: number
  currentPeriodEnd: string | null
  planLabel: string
  statusLabel: string
}

// ── Constants ────────────────────────────────────────────────────────────────
export const PLAN_LABELS: Record<string, string> = {
  trial: 'Período de prueba',
  basic: 'Plan profesional',
  professional: 'Plan profesional',
  enterprise: 'Plan profesional',
  clinic: 'Plan profesional',
  centro_salud: 'Plan profesional',
}

export const STATUS_LABELS: Record<string, string> = {
  active: 'Activo',
  trial: 'Activo (Trial)',
  past_due: 'Vencido',
  suspended: 'Suspendido',
  cancelled: 'Cancelado',
}

export const PLAN_COLORS: Record<string, string> = {
  trial: 'bg-slate-100 text-slate-600',
  basic: 'bg-blue-50 text-blue-600',
  professional: 'bg-teal-50 text-teal-600',
  enterprise: 'bg-violet-50 text-violet-600',
  clinic: 'bg-violet-50 text-violet-600',
}

export const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-600',
  trial: 'bg-amber-50 text-amber-600',
  past_due: 'bg-orange-50 text-orange-600',
  suspended: 'bg-red-50 text-red-600',
  cancelled: 'bg-slate-100 text-slate-400',
}

const ACTIVE_STATUSES: SubStatus[] = ['active', 'trial']

const MVP_FEATURES = ['dashboard', 'agenda', 'consultations', 'patients', 'finances', 'settings']

// ── Pure helpers ─────────────────────────────────────────────────────────────

export function getPlanLabel(plan?: string | null): string {
  return PLAN_LABELS[plan || 'trial'] || plan || 'Sin plan'
}

export function getStatusLabel(status?: string | null): string {
  return STATUS_LABELS[status || 'trial'] || status || 'Desconocido'
}

export function getPlanColor(plan?: string | null): string {
  return PLAN_COLORS[plan || 'trial'] || PLAN_COLORS.trial
}

export function getStatusColor(status?: string | null): string {
  return STATUS_COLORS[status || 'trial'] || STATUS_COLORS.trial
}

export function isSubscriptionActive(status?: string | null): boolean {
  return ACTIVE_STATUSES.includes((status || '') as SubStatus)
}

export function getDaysRemaining(periodEnd?: string | null): number {
  if (!periodEnd) return -1
  const diff = new Date(periodEnd).getTime() - Date.now()
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}

export function buildSubscriptionInfo(sub: unknown): SubscriptionInfo {
  const data = Array.isArray(sub) ? (sub as unknown[])[0] : sub
  const d = data as Record<string, unknown> | null | undefined

  const plan: PlanKey = (d?.plan as PlanKey) || 'trial'
  const status: SubStatus = (d?.status as SubStatus) || 'trial'

  return {
    plan,
    status,
    isActive: isSubscriptionActive(status),
    daysRemaining: getDaysRemaining(d?.current_period_end as string | null),
    currentPeriodEnd: (d?.current_period_end as string | null) || null,
    planLabel: getPlanLabel(plan),
    statusLabel: getStatusLabel(status),
  }
}

export function isMvpFeatureEnabled(featureKey: string, isActive: boolean): boolean {
  if (['dashboard', 'settings'].includes(featureKey)) return true
  if (!isActive) return false
  return MVP_FEATURES.includes(featureKey)
}

// ── Server-side queries ──────────────────────────────────────────────────────

/**
 * Get subscription info for a single doctor via the backend.
 * Backend endpoint: GET /api/admin/subscriptions?doctorId=<uuid>
 * Falls back to a default SubscriptionInfo on error.
 */
export async function getSubscriptionByDoctorId(doctorId: string): Promise<SubscriptionInfo> {
  const result = await backendGet<unknown[]>(
    `/api/admin/subscriptions?doctorId=${encodeURIComponent(doctorId)}`,
    { role: 'super_admin' },
  )
  if (result.ok) {
    const rows = result.value as Array<Record<string, unknown>>
    const row = Array.isArray(rows) ? rows[0] : null
    if (row) {
      return buildSubscriptionInfo({
        plan: row.plan,
        status: row.status,
        current_period_end: row.current_period_end,
      })
    }
  }
  // Fallback: treat as active trial so the UI doesn't block the doctor.
  return buildSubscriptionInfo(null)
}

/**
 * Get all subscriptions (admin view) via the backend.
 * Backend endpoint: GET /api/admin/subscriptions
 * Returns an array compatible with legacy consumers.
 */
export async function getAllSubscriptions(): Promise<Array<Record<string, unknown>>> {
  const result = await backendGet<Array<Record<string, unknown>>>(
    '/api/admin/subscriptions',
    { role: 'super_admin' },
  )
  if (!result.ok) {
    throw new Error(result.error.message)
  }
  const rows = result.value
  if (!Array.isArray(rows)) return []
  // Normalise to the legacy shape consumed by /admin/subscriptions page.
  return rows.map((r) => ({
    doctor_id: r.doctorId ?? r.doctor_id ?? null,
    plan: r.plan ?? 'trial',
    status: r.status ?? 'active',
    current_period_end: r.currentPeriodEnd ?? r.current_period_end ?? null,
    created_at: r.createdAt ?? r.created_at ?? null,
    profiles: {
      full_name: r.fullName ?? r.full_name ?? null,
      email: r.email ?? null,
      specialty: r.specialty ?? null,
    },
  }))
}

// ════════════════════════════════════════════════════════════════════════════
// App settings (Etapa 1: hardcoded defaults)
// ════════════════════════════════════════════════════════════════════════════

export type AppSettings = {
  subscription_base_price_usd: number
  subscription_currency: string
  beta_duration_days: number
  payment_methods_enabled: string[]
  payment_methods_config: {
    pago_movil?:    { phone?: string; cedula?: string; bank?: string }
    transferencia?: { bank?: string; account?: string; holder?: string }
    zelle?:         { email?: string; holder?: string }
  }
  stripe_enabled: boolean
  expiration_warning_days: number[]
  sales_whatsapp_number: string
  sales_whatsapp_message: string
}

export type DurationOption = {
  duration_months: number
  base_price_usd: number
  final_price_usd: number
  discount_pct: number
  promotion_id: string | null
  label: string | null
}

export type SubscriptionChangeAction =
  | 'created' | 'extended' | 'suspended' | 'reactivated' | 'cancelled'
  | 'plan_changed' | 'payment_approved' | 'payment_rejected'
  | 'price_adjusted' | 'manual_grant' | 'manual_revoke'

const DEFAULT_SETTINGS: AppSettings = {
  subscription_base_price_usd: 30,
  subscription_currency: 'USD',
  beta_duration_days: 365,
  payment_methods_enabled: ['pago_movil', 'transferencia', 'zelle'],
  payment_methods_config: {},
  stripe_enabled: false,
  expiration_warning_days: [7, 3, 1],
  sales_whatsapp_number: '',
  sales_whatsapp_message: 'Hola, vengo de la web de Delta Medical CRM y me interesa conocer más sobre el plan.',
}

/**
 * Returns global app settings.
 * ETAPA 1: returns DEFAULT_SETTINGS (hardcoded).
 * FASE futura: migrate to backendGet('/api/admin/settings').
 */
export async function getAppSettings(): Promise<AppSettings> {
  return { ...DEFAULT_SETTINGS }
}

/**
 * Updates a global setting.
 * ETAPA 1: no-op stub — changes are not persisted.
 * FASE futura: migrate to backendPut('/api/admin/settings', { key, value }).
 */
export async function setAppSetting(
  _key: keyof AppSettings,
  _value: unknown,
  _actorId: string | null,
): Promise<void> {
  // no-op — pending backend shared_settings migration
}

/**
 * Returns subscription duration options with discounts.
 * ETAPA 1: returns only the static monthly option.
 * FASE futura: migrate to backendGet('/api/admin/plan-promotions').
 */
export async function computeDurationOptions(): Promise<DurationOption[]> {
  const basePrice = DEFAULT_SETTINGS.subscription_base_price_usd
  return [
    {
      duration_months: 1,
      base_price_usd: basePrice,
      final_price_usd: basePrice,
      discount_pct: 0,
      promotion_id: null,
      label: 'Mensual',
    },
  ]
}

// ── Audit log stub ───────────────────────────────────────────────────────────

/**
 * Stub/no-op audit log. The backend performs its own audit logging internally.
 * The frontend no longer writes to subscription_changes_log directly.
 * ETAPA 2 TODO: remove callers or wire to a dedicated backend endpoint.
 */
export async function logSubscriptionChange(_args: {
  doctor_id: string
  action: SubscriptionChangeAction
  actor_id: string | null
  actor_role: string | null
  before_state?: Record<string, unknown> | null
  after_state?: Record<string, unknown> | null
  metadata?: Record<string, unknown>
  payment_id?: string | null
}): Promise<void> {
  // no-op — backend handles audit logging internally
}

// ── Subscription mutations — wired to backend ────────────────────────────────

/**
 * Extends a doctor's subscription by N months.
 * Backend: POST /api/admin/subscriptions/extend
 */
export async function extendSubscription(args: {
  doctor_id: string
  months: number
  actor_id: string | null
  actor_role: string | null
  reason: SubscriptionChangeAction
  metadata?: Record<string, unknown>
  payment_id?: string | null
}): Promise<{ success: true; new_expires_at: string } | { success: false; error: string }> {
  const result = await backendPost<{ newExpiresAt: string }>(
    '/api/admin/subscriptions/extend',
    {
      doctorId: args.doctor_id,
      months: args.months,
      reason: args.reason,
      paymentId: args.payment_id ?? null,
      metadata: args.metadata ?? {},
    },
    { role: 'super_admin' },
  )
  if (!result.ok) {
    return { success: false, error: result.error.message }
  }
  return { success: true, new_expires_at: result.value.newExpiresAt }
}

/**
 * Suspends a doctor's subscription.
 * Backend: POST /api/admin/subscriptions/suspend
 */
export async function suspendSubscription(args: {
  doctor_id: string
  actor_id: string | null
  actor_role: string | null
  reason?: string
}): Promise<{ success: boolean; error?: string }> {
  const result = await backendPost<unknown>(
    '/api/admin/subscriptions/suspend',
    { doctorId: args.doctor_id, reason: args.reason ?? null },
    { role: 'super_admin' },
  )
  if (!result.ok) {
    return { success: false, error: result.error.message }
  }
  return { success: true }
}

/**
 * Reactivates a suspended subscription.
 * Backend: POST /api/admin/subscriptions/reactivate
 */
export async function reactivateSubscription(args: {
  doctor_id: string
  actor_id: string | null
  actor_role: string | null
}): Promise<{ success: boolean; error?: string }> {
  const result = await backendPost<unknown>(
    '/api/admin/subscriptions/reactivate',
    { doctorId: args.doctor_id },
    { role: 'super_admin' },
  )
  if (!result.ok) {
    return { success: false, error: result.error.message }
  }
  return { success: true }
}

// ── Beta registration stub ───────────────────────────────────────────────────

/**
 * STUB/no-op — Etapa 1: doctor registration is a dev-stub; real provisioning
 * (plan=trial, subscription_status=trial, expires_at) happens in the backend
 * during registration flow in Etapa 2 (Auth0 + NestJS).
 *
 * ETAPA 2 TODO: replace with backendPost('/api/admin/doctors/start-beta', { doctorId }).
 */
export async function startBetaForNewDoctor(_doctorId: string): Promise<void> {
  // no-op — backend provisions beta subscription during registration in Etapa 2
}
