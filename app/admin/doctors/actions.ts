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
