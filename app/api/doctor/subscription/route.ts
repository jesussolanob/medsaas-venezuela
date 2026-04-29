/**
 * GET /api/doctor/subscription
 * Devuelve el estado completo de la suscripción del doctor + opciones de planes.
 */
import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-guards'
import { getAppSettings, computeDurationOptions } from '@/lib/subscription'

export async function GET() {
  const guard = await requireRole(['doctor', 'assistant', 'super_admin'])
  if (!guard.ok) return guard.response
  const { admin, user } = guard

  // Estado actual del doctor
  const { data: profile } = await admin
    .from('profiles')
    .select('id, plan, subscription_status, subscription_expires_at, role')
    .eq('id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'Profile no encontrado' }, { status: 404 })

  const now = new Date()
  const expiresAt = profile.subscription_expires_at ? new Date(profile.subscription_expires_at) : null
  const daysRemaining = expiresAt ? Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / 86400000)) : 0
  const isExpired = expiresAt ? expiresAt < now : true
  const isInTrial = profile.subscription_status === 'trial' || profile.plan === 'trial'

  // Settings públicos (precio, métodos disponibles)
  const settings = await getAppSettings()
  const durationOptions = await computeDurationOptions()

  // Historial de pagos del doctor
  const { data: payments } = await admin
    .from('subscription_payments')
    .select('id, amount_usd, duration_months, method, reference_number, status, created_at, rejection_reason')
    .eq('doctor_id', user.id)
    .order('created_at', { ascending: false })
    .limit(10)

  return NextResponse.json({
    state: {
      plan: profile.plan,
      status: profile.subscription_status,
      expires_at: profile.subscription_expires_at,
      days_remaining: daysRemaining,
      is_expired: isExpired,
      is_in_trial: isInTrial,
    },
    pricing: {
      base_price_usd: settings.subscription_base_price_usd,
      currency: settings.subscription_currency,
      duration_options: durationOptions,
    },
    payment_methods: {
      enabled: settings.payment_methods_enabled,
      config: settings.payment_methods_config,
    },
    stripe_enabled: settings.stripe_enabled,
    payments: payments || [],
  })
}
