'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export type CreateDoctorInput = {
  full_name: string
  email: string
  password: string
  specialty: string
  phone: string
  plan: 'free' | 'pro'
}

export type ActionResult =
  | { success: true }
  | { success: false; error: string }

export async function createDoctor(input: CreateDoctorInput): Promise<ActionResult> {
  const supabase = createAdminClient()

  // 1. Crear usuario en Supabase Auth con la contraseña definida por el admin
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: {
      full_name: input.full_name,
      role: 'doctor',
    },
  })

  if (authError) {
    return { success: false, error: authError.message }
  }

  const userId = authData.user.id

  // 2. Insertar perfil en la tabla profiles
  const { error: profileError } = await supabase.from('profiles').upsert({
    id: userId,
    full_name: input.full_name,
    email: input.email,
    specialty: input.specialty || null,
    phone: input.phone || null,
    role: 'doctor',
    is_active: true,
  })

  if (profileError) {
    // Revertir: eliminar el usuario auth si el perfil falla
    await supabase.auth.admin.deleteUser(userId)
    return { success: false, error: profileError.message }
  }

  // 3. Crear suscripción según el plan
  // Free: trial de 30 días  |  Pro: activo por 30 días desde hoy
  const now = new Date()
  const expiresAt = new Date(now)
  expiresAt.setDate(expiresAt.getDate() + 30)

  const { error: subError } = await supabase.from('subscriptions').insert({
    doctor_id: userId,
    plan: input.plan,
    status: input.plan === 'free' ? 'trial' : 'active',
    started_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
  })

  if (subError) {
    // No revertimos la cuenta, solo logueamos el error de suscripción
    console.error('Error creando suscripción:', subError.message)
  }

  revalidatePath('/admin/doctors')

  return { success: true }
}

export type CreateClinicInput = {
  name: string
  email: string
  password: string
  address: string
  city: string
  state: string
  phone: string
  specialty: string
  max_doctors: number
  admin_name: string
}

export async function createClinic(input: CreateClinicInput): Promise<ActionResult> {
  const supabase = createAdminClient()

  // 1. Create clinic admin user in Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: {
      full_name: input.admin_name,
      role: 'doctor',
    },
  })

  if (authError) {
    return { success: false, error: authError.message }
  }

  const userId = authData.user.id

  // 2. Create clinic record
  const slug = input.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

  const { data: clinicData, error: clinicError } = await supabase
    .from('clinics')
    .insert({
      name: input.name,
      slug,
      owner_id: userId,
      address: input.address || null,
      city: input.city || null,
      state: input.state || null,
      phone: input.phone || null,
      email: input.email,
      specialty: input.specialty || null,
      subscription_plan: 'centro_salud',
      subscription_status: 'trial',
      max_doctors: input.max_doctors,
      is_active: true,
    })
    .select()

  if (clinicError) {
    // Revert: delete auth user if clinic creation fails
    await supabase.auth.admin.deleteUser(userId)
    return { success: false, error: clinicError.message }
  }

  const clinicId = clinicData?.[0]?.id

  // 3. Insert admin profile in profiles table linked to clinic
  const { error: profileError } = await supabase.from('profiles').insert({
    id: userId,
    full_name: input.admin_name,
    email: input.email,
    role: 'doctor',
    clinic_id: clinicId,
    clinic_role: 'admin',
    is_active: true,
  })

  if (profileError) {
    // Revert: delete clinic and auth user
    if (clinicId) {
      await supabase.from('clinics').delete().eq('id', clinicId)
    }
    await supabase.auth.admin.deleteUser(userId)
    return { success: false, error: profileError.message }
  }

  // 4. Create subscription for clinic (30-day trial)
  const now = new Date()
  const expiresAt = new Date(now)
  expiresAt.setDate(expiresAt.getDate() + 30)

  const { error: subError } = await supabase.from('subscriptions').insert({
    doctor_id: userId,
    plan: 'centro_salud',
    status: 'trial',
    started_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
  })

  if (subError) {
    console.error('Error creating clinic subscription:', subError.message)
  }

  // Create pending approval for clinic subscription
  await supabase.from('subscription_payments').insert({
    doctor_id: userId,
    amount: 100, // Centro de Salud plan costs $100/month
    currency: 'USD',
    payment_method: 'admin_creation',
    reference_number: `CLINIC-${Date.now()}`,
    status: 'pending',
    notes: `Nueva clínica creada: ${input.name}. Pendiente de verificación de pago.`,
  })

  revalidatePath('/admin/doctors')

  return { success: true }
}
