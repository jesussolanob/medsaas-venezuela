'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'

export type LoginResult =
  | { success: true; role: string; destination: string }
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
    .select('role')
    .eq('id', userId)
    .single()

  // If no profile exists, check auth user metadata for role (e.g. patients registered via /patient/register)
  const role = profile?.role ?? data.user.user_metadata?.role ?? 'doctor'

  // Determine destination based on clear role hierarchy
  let destination = '/doctor'
  if (role === 'super_admin' || role === 'admin') {
    destination = '/admin'
  } else if (role === 'patient') {
    destination = '/patient/dashboard'
  }

  return { success: true, role, destination }
}

export async function logoutUser() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
