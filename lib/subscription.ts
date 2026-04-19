/**
 * lib/subscription.ts
 * SINGLE SOURCE OF TRUTH for subscription logic across the entire app.
 * Every page/component that needs plan info should use these helpers.
 */

import { createAdminClient } from '@/lib/supabase/admin'

// ── Types ────────────────────────────────────────────────────────────────────
export type PlanKey = 'trial' | 'basic' | 'professional' | 'enterprise' | 'clinic'
export type SubStatus = 'active' | 'trial' | 'trialing' | 'past_due' | 'suspended' | 'cancelled'

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
  trial: 'Trial',
  basic: 'Basic',
  professional: 'Professional',
  enterprise: 'Centro de Salud',
  clinic: 'Centro de Salud',
  centro_salud: 'Centro de Salud',
}

export const STATUS_LABELS: Record<string, string> = {
  active: 'Activo',
  trial: 'Trial',
  trialing: 'Trial',
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
  trialing: 'bg-amber-50 text-amber-600',
  past_due: 'bg-orange-50 text-orange-600',
  suspended: 'bg-red-50 text-red-600',
  cancelled: 'bg-slate-100 text-slate-400',
}

// Statuses that allow the doctor to use the app
const ACTIVE_STATUSES: SubStatus[] = ['active', 'trial', 'trialing']

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
 * Get subscription for a doctor using admin client (bypasses RLS).
 */
export async function getSubscriptionByDoctorId(doctorId: string): Promise<SubscriptionInfo> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('subscriptions')
    .select('*')
    .eq('doctor_id', doctorId)
    .maybeSingle()

  return buildSubscriptionInfo(data)
}

/**
 * Get all subscriptions with doctor profiles (for admin pages).
 */
export async function getAllSubscriptions() {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('subscriptions')
    .select('*, profiles:doctor_id(full_name, email, specialty)')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}
