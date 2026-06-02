'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export type CreateDoctorInput = {
  full_name: string
  email: string
  password: string
  specialty: string
  phone: string
  plan: 'basic' | 'professional'
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

  // 3. Beta privada (2026-04-22): forzar plan='trial' + 1 año gratis para todos
  // El campo input.plan se ignora hasta que se reactive el modelo de pago.
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

  return { success: true }
}

// DEPRECATED 2026-04-22: tabla clinics eliminada en reingeniería MVP.
// Beta privada solo soporta médicos individuales. Este stub queda hasta borrar
// NewClinicModal.tsx + ClinicDetailDrawer.tsx (ya huérfanos, sin imports).
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

export async function createClinic(_input: CreateClinicInput): Promise<ActionResult> {
  return { success: false, error: 'Función deshabilitada: clínicas eliminadas en MVP. Usa createDoctor para registrar médicos individuales.' }
}

// Código legacy de createClinic eliminado en reingeniería 2026-04-22.
// Referencias previas a `from('clinics')` y `clinic_id` / `clinic_role` removidas.
