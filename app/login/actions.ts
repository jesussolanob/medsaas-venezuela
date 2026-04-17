'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'

export type LoginResult =
  | { success: true; role: string; clinicRole: string | null; hasClinic: boolean }
  | { success: false; error: string }

export async function loginUser(email: string, password: string): Promise<LoginResult> {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    if (error.message.includes('Invalid login credentials')) {
      return { success: false, error: 'Correo o contraseña incorrectos.' }
    }
    return { success: false, error: error.message }
  }

  const userId = data.user.id

  // Fetch role from profiles table
  const adminClient = createAdminClient()
  const { data: profile } = await adminClient
    .from('profiles')
    .select('role, clinic_id, clinic_role')
    .eq('id', userId)
    .single()

  const role = profile?.role ?? 'doctor'
  const clinicRole = profile?.clinic_role ?? null
  const hasClinic = !!profile?.clinic_id

  return { success: true, role, clinicRole, hasClinic }
}

export async function logoutUser() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
