'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'

export type LoginResult =
  | { success: true; role: string; clinicRole: string | null; hasClinic: boolean; destination: string }
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

  // Determine destination based on clear role hierarchy
  let destination = '/doctor'
  if (role === 'super_admin' || role === 'admin') {
    destination = '/admin'
  } else if (hasClinic && clinicRole === 'admin') {
    destination = '/clinic/admin'
  } else if (role === 'patient') {
    destination = '/patient/dashboard'
  }

  return { success: true, role, clinicRole, hasClinic, destination }
}

export async function logoutUser() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
