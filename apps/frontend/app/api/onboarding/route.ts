/**
 * /api/onboarding — POST
 *
 * Completes the doctor/patient profile after initial registration.
 *
 * ETAPA 1: DB upsert via Supabase admin client (profiles table).
 *   The `supabase.auth.admin.updateUserById` call has been removed — in Etapa 1
 *   there is no auth provider to update user metadata in.
 *
 * ETAPA 2 (Auth0): replace supabase.from('profiles') calls with a backend
 *   NestJS endpoint (PUT /api/doctor/profile) and update Auth0 app_metadata
 *   via Auth0 Management API instead of the removed line below.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { userId, role, phone, full_name, email, specialty, professional_title, sex } = body

    if (!userId || !phone) {
      return NextResponse.json({ error: 'userId y phone son requeridos' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Check if profile already exists
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle()

    const profileRole = role === 'patient' ? 'patient' : 'doctor'

    if (existingProfile) {
      // Update existing profile with phone + details
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          phone,
          full_name: full_name || undefined,
          email: email || undefined,
          specialty: specialty || undefined,
          professional_title: professional_title || undefined,
          sex: sex || undefined,
          role: profileRole,
        })
        .eq('id', userId)

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }
    } else {
      // Create new profile
      const { error: insertError } = await supabase
        .from('profiles')
        .insert({
          id: userId,
          full_name: full_name || 'Usuario',
          email: email || null,
          phone,
          role: profileRole,
          specialty: specialty || null,
          professional_title: professional_title || 'Dr.',
          sex: sex || null,
          is_active: true,
        })

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 })
      }
    }

    // For doctors: set plan/status/expires_at in profiles (beta: trial 1 year free)
    if (profileRole === 'doctor') {
      const expiresAt = new Date()
      expiresAt.setFullYear(expiresAt.getFullYear() + 1)

      await supabase
        .from('profiles')
        .update({
          plan: 'trial',
          subscription_status: 'active',
          subscription_expires_at: expiresAt.toISOString(),
        })
        .eq('id', userId)
    }

    // NOTE: supabase.auth.admin.updateUserById() was here — removed in Etapa 1
    // migration (no auth provider in dev-stub). ETAPA 2: update Auth0 app_metadata
    // via Auth0 Management API to persist the role.

    return NextResponse.json({ success: true, role: profileRole })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno del servidor'
    console.error('Onboarding error:', message)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
