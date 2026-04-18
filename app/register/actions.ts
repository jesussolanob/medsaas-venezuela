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

  // 1. Create auth user (email_confirm: false → Supabase sends verification email)
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: false,
    user_metadata: { full_name: input.full_name, role: 'doctor' },
  })

  if (authError) {
    if (authError.message.includes('already registered')) {
      return { success: false, error: 'Este email ya está registrado. ¿Ya tienes cuenta? Inicia sesión.' }
    }
    return { success: false, error: authError.message }
  }

  const userId = authData.user.id

  // 2. Create profile (NO clinic for basic/professional plans)
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
    clinic_id: null,
    clinic_role: null,
  })

  if (profileError) {
    await supabase.auth.admin.deleteUser(userId)
    return { success: false, error: profileError.message }
  }

  // 3. Create subscription
  const now = new Date()
  const expiresAt = new Date(now)
  const isTrial = input.plan === 'trial'
  expiresAt.setDate(expiresAt.getDate() + (isTrial ? 15 : 30))

  const { error: subError } = await supabase.from('subscriptions').insert({
    doctor_id: userId,
    plan: input.plan,
    status: isTrial ? 'trial' : 'past_due',
    current_period_end: isTrial ? expiresAt.toISOString() : null,
  })

  if (subError) {
    console.error('Error creando suscripción:', subError.message)
  }

  // 4. Send verification email via Supabase magic link
  try {
    await supabase.auth.admin.generateLink({
      type: 'signup',
      email: input.email,
    })
  } catch (e) {
    console.error('Error sending verification email:', e)
  }

  revalidatePath('/admin/doctors')
  revalidatePath('/admin/subscriptions')

  return { success: true, doctorId: userId }
}

// ── Register Clinic (Centro de Salud) ──────────────────────────────────────────
export type RegisterClinicInput = {
  full_name: string
  cedula: string
  email: string
  password: string
  specialty: string
  phone: string
  sex?: string
  professional_title?: string
  clinic_name: string
  clinic_address: string
  clinic_city: string
  clinic_state: string
  clinic_phone: string
  clinic_email: string
  clinic_specialty: string
}

export async function registerClinic(input: RegisterClinicInput): Promise<RegisterResult> {
  const supabase = createAdminClient()

  // 1. Create auth user
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

  // 2. Create clinic
  const slug = input.clinic_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

  const { data: clinic, error: clinicError } = await supabase
    .from('clinics')
    .insert({
      name: input.clinic_name.trim(),
      slug,
      owner_id: userId,
      address: input.clinic_address || null,
      city: input.clinic_city || null,
      state: input.clinic_state || null,
      phone: input.clinic_phone || null,
      email: input.clinic_email || input.email,
      specialty: input.clinic_specialty || null,
      subscription_plan: 'centro_salud',
      subscription_status: 'trial',
    })
    .select('id')
    .single()

  if (clinicError || !clinic) {
    await supabase.auth.admin.deleteUser(userId)
    return { success: false, error: clinicError?.message || 'Error al crear la clínica' }
  }

  // 3. Create profile linked to clinic as admin
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
    clinic_id: clinic.id,
    clinic_role: 'admin',
  })

  if (profileError) {
    await supabase.auth.admin.deleteUser(userId)
    return { success: false, error: profileError.message }
  }

  // 4. Create subscription
  const now = new Date()
  const expiresAt = new Date(now)
  expiresAt.setDate(expiresAt.getDate() + 30)

  await supabase.from('subscriptions').insert({
    doctor_id: userId,
    plan: 'enterprise',
    status: 'trial',
    current_period_end: expiresAt.toISOString(),
  })

  revalidatePath('/admin/doctors')
  revalidatePath('/admin/subscriptions')

  return { success: true, doctorId: userId }
}

// ── Tasa BCV ──────────────────────────────────────────────────────────────────
export type BCVRateResult = { rate: number; updated: string } | null

export async function getBCVRate(): Promise<BCVRateResult> {
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
  } catch {
    try {
      const res2 = await fetch('https://pydolarve.org/api/v1/dollar?page=bcv&monitor=usd', {
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
}

// ── Subir comprobante de pago ─────────────────────────────────────────────────
export type UploadReceiptResult =
  | { success: true; receiptUrl: string }
  | { success: false; error: string }

export async function uploadPaymentReceipt(
  doctorId: string,
  base64Data: string,
  fileName: string,
  mimeType: string,
  amount: number = 30
): Promise<UploadReceiptResult> {
  const supabase = createAdminClient()

  const buffer = Buffer.from(base64Data, 'base64')
  const ext = fileName.split('.').pop() ?? 'jpg'
  const storagePath = `receipts/${doctorId}/${Date.now()}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('payment-receipts')
    .upload(storagePath, buffer, { contentType: mimeType, upsert: true })

  if (uploadError) {
    return { success: false, error: 'No se pudo subir el comprobante: ' + uploadError.message }
  }

  const { data: urlData } = supabase.storage.from('payment-receipts').getPublicUrl(storagePath)
  const receiptUrl = urlData.publicUrl

  // Get the doctor's subscription ID
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('doctor_id', doctorId)
    .single()

  const { error: paymentError } = await supabase.from('subscription_payments').insert({
    doctor_id: doctorId,
    subscription_id: subscription?.id,
    amount: amount,
    method: 'pago_movil',
    receipt_url: receiptUrl,
    status: 'pending',
  })

  if (paymentError) console.error('Error guardando pago:', paymentError.message)

  return { success: true, receiptUrl }
}

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
