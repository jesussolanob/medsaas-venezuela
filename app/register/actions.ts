'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export type RegisterInput = {
  full_name: string
  cedula: string
  email: string
  password: string
  specialty: string
  phone: string
  plan: 'trial' | 'basic' | 'professional' | 'clinic'
  sex?: string
  professional_title?: string
  clinic_name?: string
  clinic_city?: string
}

export type RegisterResult =
  | { success: true; doctorId: string }
  | { success: false; error: string }

export async function registerDoctor(input: RegisterInput): Promise<RegisterResult> {
  const supabase = createAdminClient()

  // 1. Create auth user (email_confirm: true → Beta: auto-confirm so they can login immediately)
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.full_name, role: 'doctor' },
  })

  if (authError) {
    if (authError.message.includes('already registered')) {
      return { success: false, error: 'Este email ya está registrado. ¿Ya tienes cuenta? Inicia sesión.' }
    }
    return { success: false, error: authError.message }
  }

  const userId = authData.user.id

  // 2. Create profile
  const { error: profileError } = await supabase.from('profiles').upsert({
    id: userId,
    full_name: input.full_name,
    cedula: input.cedula || null,
    email: input.email,
    specialty: input.specialty || null,
    phone: input.phone || null,
    sex: input.sex || null,
    professional_title: input.professional_title || 'Dr.',
    role: 'doctor',
    is_active: true,
  })

  if (profileError) {
    await supabase.auth.admin.deleteUser(userId)
    return { success: false, error: profileError.message }
  }

  // 3. Set plan + status en profiles — Beta: 1 año gratis activo
  const expiresAt = new Date()
  expiresAt.setFullYear(expiresAt.getFullYear() + 1)

  const { error: planErr } = await supabase
    .from('profiles')
    .update({
      plan: 'trial',
      subscription_status: 'active',
      subscription_expires_at: expiresAt.toISOString(),
    })
    .eq('id', userId)

  if (planErr) {
    console.error('Error seteando plan:', planErr.message)
  }

  revalidatePath('/admin/doctors')

  return { success: true, doctorId: userId }
}

// ── Register Patient (Beta: auto-confirm email) ─────────────────────────────

export type RegisterPatientInput = {
  full_name: string
  email: string
  password: string
  phone?: string
}

export async function registerPatient(input: RegisterPatientInput): Promise<RegisterResult> {
  const supabase = createAdminClient()

  // Create auth user with auto-confirmed email (beta)
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.full_name, role: 'patient' },
  })

  if (authError) {
    if (authError.message.includes('already registered')) {
      return { success: false, error: 'Este email ya está registrado. Intenta iniciar sesión.' }
    }
    return { success: false, error: authError.message }
  }

  const userId = authData.user.id

  // Create profile
  const { error: profileError } = await supabase.from('profiles').upsert({
    id: userId,
    full_name: input.full_name,
    email: input.email,
    phone: input.phone || null,
    role: 'patient',
    is_active: true,
  })

  if (profileError) {
    await supabase.auth.admin.deleteUser(userId)
    return { success: false, error: profileError.message }
  }

  return { success: true, doctorId: userId }
}

// ── Confirm unconfirmed email (for existing stuck users) ─────────────────────

export async function confirmUserEmail(email: string): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient()

  // Find user by email
  const { data: { users }, error: listErr } = await supabase.auth.admin.listUsers()
  if (listErr) return { success: false, error: listErr.message }

  const user = users.find(u => u.email === email)
  if (!user) return { success: false, error: 'Usuario no encontrado' }

  // Confirm email using admin API
  const { error } = await supabase.auth.admin.updateUserById(user.id, {
    email_confirm: true,
  })

  if (error) return { success: false, error: error.message }
  return { success: true }
}

// ── Resend confirmation / auto-confirm for beta ──────────────────────────────

export async function resendConfirmation(email: string): Promise<{ success: boolean; error?: string }> {
  // In beta, we just auto-confirm the email
  return confirmUserEmail(email)
}

// ── Register Clinic (Centro de Salud) ──────────────────────────────────────────
// REMOVED 2026-04-22: registerClinic + tabla clinics eliminadas en reingeniería MVP.
// Beta privada solo soporta médicos individuales. Si el formulario /register
// usaba este flujo, debe migrarse a registerDoctor.

// ── Tasa BCV ──────────────────────────────────────────────────────────────────
export type BCVRateResult = { rate: number; updated: string } | null

export async function getBCVRate(): Promise<BCVRateResult> {
  // Source 1: fawazahmed0/currency-api CDN (fastest, no rate limits)
  try {
    const res = await fetch(
      'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json',
      { cache: 'no-store' }
    )
    if (res.ok) {
      const data = await res.json()
      // Response: { date: "2026-04-19", usd: { ves: 479.65 } }
      const vesRate = data?.usd?.ves ?? data?.ves
      if (vesRate && vesRate > 0) {
        return {
          rate: parseFloat(Number(vesRate).toFixed(2)),
          updated: data.date ?? new Date().toLocaleDateString('es-VE'),
        }
      }
    }
  } catch { /* try next source */ }

  // Source 1b: currency-api fallback CDN
  try {
    const res = await fetch(
      'https://latest.currency-api.pages.dev/v1/currencies/usd.min.json',
      { cache: 'no-store' }
    )
    if (res.ok) {
      const data = await res.json()
      const vesRate = data?.usd?.ves ?? data?.ves
      if (vesRate && vesRate > 0) {
        return {
          rate: parseFloat(Number(vesRate).toFixed(2)),
          updated: data.date ?? new Date().toLocaleDateString('es-VE'),
        }
      }
    }
  } catch { /* try next source */ }

  // Source 2: dolarapi.com
  try {
    const res = await fetch('https://ve.dolarapi.com/v1/dolares/oficial', {
      next: { revalidate: 3600 },
    })
    if (!res.ok) throw new Error('fetch failed')
    const data = await res.json()
    const rate = data.promedio ?? data.precio ?? data.price ?? null
    if (!rate) throw new Error('no rate')
    return {
      rate: parseFloat(rate),
      updated: data.fechaActualizacion ?? new Date().toLocaleDateString('es-VE'),
    }
  } catch { /* try next source */ }

  // Source 3: pydolarve.org
  try {
    const res2 = await fetch('https://pydolarve.org/api/v2/dollar?page=bcv', {
      next: { revalidate: 3600 },
    })
    if (!res2.ok) throw new Error('fetch2 failed')
    const d2 = await res2.json()
    const rate2 = d2.monitors?.usd?.price ?? d2.price ?? null
    if (!rate2) throw new Error('no rate2')
    return { rate: parseFloat(rate2), updated: new Date().toLocaleDateString('es-VE') }
  } catch {
    return null
  }
}

// uploadPaymentReceipt eliminada — el flujo de comprobantes de pago se removió
// junto con el módulo de aprobaciones. En beta privada las suscripciones son
// trial activo automático por 1 año.

// ── Obtener planes activos ────────────────────────────────────────────────────
export type PlanConfigPublic = {
  plan_key: string; name: string; price: number
  trial_days: number; description: string | null
}

export async function getActivePlans(): Promise<PlanConfigPublic[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('plan_configs')
    .select('plan_key, name, price, trial_days, description')
    .eq('is_active', true)
    .order('sort_order')
  if (error) { console.error('Error fetching plans:', error.message); return [] }
  return data ?? []
}

// ── Obtener promociones activas ──────────────────────────────────────────────
export type PromotionPublic = {
  id: string
  plan_key: string
  duration_months: number
  original_price_usd: number
  promo_price_usd: number
  label: string
}

export async function getActivePromotions(): Promise<PromotionPublic[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('plan_promotions')
    .select('id, plan_key, duration_months, original_price_usd, promo_price_usd, label')
    .eq('is_active', true)
    .or('ends_at.is.null,ends_at.gt.' + new Date().toISOString())
    .order('duration_months')
  if (error) { console.error('Error fetching promotions:', error.message); return [] }
  return data ?? []
}

// ── Cuentas de cobro del admin ────────────────────────────────────────────────
export type PaymentAccount = {
  id: string; type: string; bank_name: string | null
  account_holder: string | null; phone: string | null
  rif: string | null; notes: string | null
}

export async function getPaymentAccounts(): Promise<PaymentAccount[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('payment_accounts')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: true })

  if (error) { console.error('Error obteniendo cuentas:', error.message); return [] }
  return data ?? []
}
