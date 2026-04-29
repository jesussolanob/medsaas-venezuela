/**
 * lib/subscription.ts
 * SINGLE SOURCE OF TRUTH for subscription logic across the entire app.
 * Every page/component that needs plan info should use these helpers.
 */

import { createAdminClient } from '@/lib/supabase/admin'

// ── Types ────────────────────────────────────────────────────────────────────
// Reflejan los valores reales del enum subscription_plan y subscription_status en BD.
// enum subscription_plan     = {trial, basic, professional, enterprise, clinic}
// enum subscription_status   = {active, suspended, cancelled, trial, past_due}
// Nota: 'enterprise' existe en enum por legado pero CLAUDE.md dice usar 'clinic'.
//        Mantenemos 'enterprise' como type-compat hasta migrar el enum completo.
// Nota: 'trialing' NO existe en el enum — era dead code, se elimina del type.
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
  isActive: boolean        // Can the doctor use the app?
  daysRemaining: number    // Days until expiration (-1 if no end date)
  currentPeriodEnd: string | null
  planLabel: string        // Human-readable plan name
  statusLabel: string      // Human-readable status
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
  trial: 'Activo (Trial)',  // beta privada: trial = activo, no requiere aprobación
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

// Statuses that allow the doctor to use the app
const ACTIVE_STATUSES: SubStatus[] = ['active', 'trial']

// MVP features — every plan gets these
const MVP_FEATURES = ['dashboard', 'agenda', 'consultations', 'patients', 'finances', 'settings']

// ── Helpers ──────────────────────────────────────────────────────────────────

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

/**
 * Build a complete SubscriptionInfo from raw subscription data.
 * Works with any shape — Supabase object, array element, or null.
 */
export function buildSubscriptionInfo(sub: any): SubscriptionInfo {
  // Handle array (Supabase returns array for has-many)
  const data = Array.isArray(sub) ? sub[0] : sub

  const plan: PlanKey = data?.plan || 'trial'
  const status: SubStatus = data?.status || 'trial'

  return {
    plan,
    status,
    isActive: isSubscriptionActive(status),
    daysRemaining: getDaysRemaining(data?.current_period_end),
    currentPeriodEnd: data?.current_period_end || null,
    planLabel: getPlanLabel(plan),
    statusLabel: getStatusLabel(status),
  }
}

/**
 * Check if a feature is enabled for the MVP.
 * In the MVP, all features in MVP_FEATURES are enabled for active subscriptions.
 * No need to query plan_features table.
 */
export function isMvpFeatureEnabled(featureKey: string, isActive: boolean): boolean {
  // Settings and dashboard are always available
  if (['dashboard', 'settings'].includes(featureKey)) return true
  // Everything else requires active subscription
  if (!isActive) return false
  return MVP_FEATURES.includes(featureKey)
}

// ── Server-side queries (use in Server Components or API routes) ─────────────

/**
 * Get subscription for a doctor — ahora lee desde profiles directamente
 * (tabla subscriptions eliminada en reingeniería 2026-04-22)
 */
export async function getSubscriptionByDoctorId(doctorId: string): Promise<SubscriptionInfo> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('plan, subscription_status, subscription_expires_at')
    .eq('id', doctorId)
    .maybeSingle()

  return buildSubscriptionInfo({
    plan: data?.plan,
    status: data?.subscription_status,
    current_period_end: data?.subscription_expires_at,
  })
}

/**
 * Get all subscriptions — ahora lee desde profiles directamente.
 */
export async function getAllSubscriptions() {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('profiles')
    .select('id, full_name, email, specialty, plan, subscription_status, subscription_expires_at, created_at')
    .eq('role', 'doctor')
    .order('created_at', { ascending: false })

  if (error) throw error
  // Forma de salida compatible con consumidores legacy
  return (data || []).map((d: any) => ({
    doctor_id: d.id,
    plan: d.plan || 'trial',
    status: d.subscription_status || 'active',
    current_period_end: d.subscription_expires_at,
    created_at: d.created_at,
    profiles: { full_name: d.full_name, email: d.email, specialty: d.specialty },
  }))
}

// ════════════════════════════════════════════════════════════════════════════
// FASE 1 (2026-04-29): Sistema de suscripciones configurable
// Inspirado en Stripe Subscriptions + Shopify Admin Settings.
// ════════════════════════════════════════════════════════════════════════════

// ── Types ───────────────────────────────────────────────────────────────────
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
  base_price_usd: number       // sin descuento (price * months)
  final_price_usd: number      // con descuento aplicado
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

// ── App settings (key/value singleton) ──────────────────────────────────────
export async function getAppSettings(): Promise<AppSettings> {
  const admin = createAdminClient()
  const { data } = await admin.from('app_settings').select('key, value')
  const map: Record<string, unknown> = {}
  for (const row of data || []) map[row.key] = row.value
  return {
    subscription_base_price_usd: Number(map.subscription_base_price_usd ?? DEFAULT_SETTINGS.subscription_base_price_usd),
    subscription_currency: String(map.subscription_currency ?? DEFAULT_SETTINGS.subscription_currency),
    beta_duration_days: Number(map.beta_duration_days ?? DEFAULT_SETTINGS.beta_duration_days),
    payment_methods_enabled: (map.payment_methods_enabled as string[]) ?? DEFAULT_SETTINGS.payment_methods_enabled,
    payment_methods_config: (map.payment_methods_config as AppSettings['payment_methods_config']) ?? {},
    stripe_enabled: Boolean(map.stripe_enabled ?? false),
    expiration_warning_days: (map.expiration_warning_days as number[]) ?? DEFAULT_SETTINGS.expiration_warning_days,
    sales_whatsapp_number: String(map.sales_whatsapp_number ?? DEFAULT_SETTINGS.sales_whatsapp_number),
    sales_whatsapp_message: String(map.sales_whatsapp_message ?? DEFAULT_SETTINGS.sales_whatsapp_message),
  }
}

export async function setAppSetting(
  key: keyof AppSettings,
  value: unknown,
  actorId: string | null,
): Promise<void> {
  const admin = createAdminClient()
  await admin
    .from('app_settings')
    .upsert(
      { key, value, updated_by: actorId, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    )
}

// ── Duration options (multi-mes con promos) ────────────────────────────────
export async function computeDurationOptions(): Promise<DurationOption[]> {
  const settings = await getAppSettings()
  const basePrice = settings.subscription_base_price_usd
  const admin = createAdminClient()

  const { data: promos } = await admin
    .from('plan_promotions')
    .select('*')
    .eq('is_active', true)
    .or('ends_at.is.null,ends_at.gt.now()')

  const options: DurationOption[] = [
    {
      duration_months: 1,
      base_price_usd: basePrice,
      final_price_usd: basePrice,
      discount_pct: 0,
      promotion_id: null,
      label: 'Mensual',
    },
  ]

  for (const promo of promos || []) {
    const months = Number(promo.duration_months) || 1
    const original = Number(promo.original_price_usd) || basePrice * months
    const final = Number(promo.promo_price_usd) || original
    const discount = original > 0 ? Math.round(((original - final) / original) * 100) : 0
    options.push({
      duration_months: months,
      base_price_usd: basePrice * months,
      final_price_usd: final,
      discount_pct: discount,
      promotion_id: promo.id,
      label: promo.label || `${months} meses`,
    })
  }

  return options.sort((a, b) => a.duration_months - b.duration_months)
}

// ── Audit log ───────────────────────────────────────────────────────────────
export async function logSubscriptionChange(args: {
  doctor_id: string
  action: SubscriptionChangeAction
  actor_id: string | null
  actor_role: string | null
  before_state?: Record<string, unknown> | null
  after_state?: Record<string, unknown> | null
  metadata?: Record<string, unknown>
  payment_id?: string | null
}): Promise<void> {
  const admin = createAdminClient()
  await admin.from('subscription_changes_log').insert({
    doctor_id: args.doctor_id,
    action: args.action,
    actor_id: args.actor_id,
    actor_role: args.actor_role,
    before_state: args.before_state ?? null,
    after_state: args.after_state ?? null,
    metadata: args.metadata ?? {},
    payment_id: args.payment_id ?? null,
  })
}

// ── Extender suscripción (idempotente, no resetea días) ────────────────────
/**
 * Reglas (Stripe-style):
 *  - Si subscription_expires_at es futuro → suma N meses A PARTIR de esa fecha.
 *  - Si está vencida o nula → suma N meses A PARTIR de ahora.
 *  - Cambia status a 'active'.
 *  - Si el plan era 'trial' lo migra a 'basic' (plan único pago).
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
  const admin = createAdminClient()
  const { data: profile, error: profErr } = await admin
    .from('profiles')
    .select('id, plan, subscription_status, subscription_expires_at')
    .eq('id', args.doctor_id)
    .single()
  if (profErr || !profile) return { success: false, error: 'Doctor no encontrado' }

  const before = {
    plan: profile.plan,
    subscription_status: profile.subscription_status,
    subscription_expires_at: profile.subscription_expires_at,
  }

  const now = new Date()
  const currentEnd = profile.subscription_expires_at ? new Date(profile.subscription_expires_at) : null
  const anchor = currentEnd && currentEnd > now ? currentEnd : now
  const newEnd = new Date(anchor)
  newEnd.setMonth(newEnd.getMonth() + args.months)

  const newPlan = profile.plan === 'trial' ? 'basic' : (profile.plan || 'basic')

  const { error: updErr } = await admin
    .from('profiles')
    .update({
      subscription_status: 'active',
      subscription_expires_at: newEnd.toISOString(),
      plan: newPlan,
    })
    .eq('id', args.doctor_id)
  if (updErr) return { success: false, error: updErr.message }

  await logSubscriptionChange({
    doctor_id: args.doctor_id,
    action: args.reason,
    actor_id: args.actor_id,
    actor_role: args.actor_role,
    before_state: before,
    after_state: {
      plan: newPlan,
      subscription_status: 'active',
      subscription_expires_at: newEnd.toISOString(),
    },
    metadata: { months_added: args.months, ...(args.metadata || {}) },
    payment_id: args.payment_id ?? null,
  })

  return { success: true, new_expires_at: newEnd.toISOString() }
}

// ── Suspender / Reactivar ──────────────────────────────────────────────────
export async function suspendSubscription(args: {
  doctor_id: string
  actor_id: string | null
  actor_role: string | null
  reason?: string
}) {
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles').select('plan, subscription_status, subscription_expires_at')
    .eq('id', args.doctor_id).single()
  if (!profile) return { success: false, error: 'Doctor no encontrado' }
  await admin.from('profiles').update({ subscription_status: 'suspended' }).eq('id', args.doctor_id)
  await logSubscriptionChange({
    doctor_id: args.doctor_id, action: 'suspended',
    actor_id: args.actor_id, actor_role: args.actor_role,
    before_state: { subscription_status: profile.subscription_status },
    after_state: { subscription_status: 'suspended' },
    metadata: args.reason ? { reason: args.reason } : {},
  })
  return { success: true }
}

export async function reactivateSubscription(args: {
  doctor_id: string
  actor_id: string | null
  actor_role: string | null
}) {
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles').select('plan, subscription_status, subscription_expires_at')
    .eq('id', args.doctor_id).single()
  if (!profile) return { success: false, error: 'Doctor no encontrado' }
  const isExpired = profile.subscription_expires_at && new Date(profile.subscription_expires_at) < new Date()
  const updates: Record<string, unknown> = { subscription_status: 'active' }
  if (isExpired) {
    const newEnd = new Date(); newEnd.setMonth(newEnd.getMonth() + 1)
    updates.subscription_expires_at = newEnd.toISOString()
  }
  await admin.from('profiles').update(updates).eq('id', args.doctor_id)
  await logSubscriptionChange({
    doctor_id: args.doctor_id, action: 'reactivated',
    actor_id: args.actor_id, actor_role: args.actor_role,
    before_state: { subscription_status: profile.subscription_status },
    after_state: updates,
  })
  return { success: true }
}

// ── Beta inicial al registrar nuevo doctor ─────────────────────────────────
export async function startBetaForNewDoctor(doctorId: string): Promise<void> {
  const settings = await getAppSettings()
  const admin = createAdminClient()
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + settings.beta_duration_days)
  await admin
    .from('profiles')
    .update({
      plan: 'trial',
      subscription_status: 'trial',
      subscription_expires_at: expiresAt.toISOString(),
    })
    .eq('id', doctorId)
  await logSubscriptionChange({
    doctor_id: doctorId,
    action: 'created',
    actor_id: doctorId,
    actor_role: 'doctor',
    after_state: {
      plan: 'trial',
      subscription_status: 'trial',
      subscription_expires_at: expiresAt.toISOString(),
    },
    metadata: { beta_days: settings.beta_duration_days, source: 'self_registration' },
  })
}
