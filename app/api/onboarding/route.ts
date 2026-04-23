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

    // For doctors: set plan/status/expires_at en profiles (beta: trial 1 año gratis)
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

    // Update auth user metadata with role
    await supabase.auth.admin.updateUserById(userId, {
      user_metadata: { role: profileRole },
    })

    return NextResponse.json({ success: true, role: profileRole })
  } catch (err: any) {
    console.error('Onboarding error:', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
