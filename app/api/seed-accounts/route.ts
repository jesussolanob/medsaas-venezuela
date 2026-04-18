import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET+POST /api/seed-accounts — Create test patient and doctor accounts
// REMOVE THIS ROUTE IN PRODUCTION
export async function GET() { return handler() }
export async function POST() { return handler() }
async function handler() {
  const supabase = createAdminClient()

  try {
    // 1. Create patient account (ivana@gmail.com)
    let patientUserId: string | null = null

    const { data: patientAuth, error: patientAuthErr } = await supabase.auth.admin.createUser({
      email: 'ivana@gmail.com',
      password: '12345678',
      email_confirm: true,
      user_metadata: { full_name: 'Ivana Solano', role: 'patient' },
    })

    if (patientAuthErr) {
      if (!patientAuthErr.message.includes('already registered')) {
        return NextResponse.json({ error: patientAuthErr.message }, { status: 500 })
      }
      // If already exists, try to find the user
      const { data: { users } } = await supabase.auth.admin.listUsers()
      const existing = users?.find(u => u.email === 'ivana@gmail.com')
      if (existing) {
        patientUserId = existing.id
      } else {
        return NextResponse.json({ error: 'Patient user exists but cannot be found' }, { status: 500 })
      }
    } else {
      patientUserId = patientAuth.user.id
    }

    // 2. Create patient profile
    if (patientUserId) {
      await supabase.from('profiles').upsert({
        id: patientUserId,
        full_name: 'Ivana Solano',
        role: 'patient',
        email: 'ivana@gmail.com',
        is_active: true,
      })
    }

    // 3. Create doctor account (ivana2@gmail.com)
    let doctorUserId: string | null = null

    const { data: doctorAuth, error: doctorAuthErr } = await supabase.auth.admin.createUser({
      email: 'ivana2@gmail.com',
      password: '12345678',
      email_confirm: true,
      user_metadata: { full_name: 'Ivana Solano', role: 'doctor' },
    })

    if (doctorAuthErr) {
      if (!doctorAuthErr.message.includes('already registered')) {
        return NextResponse.json({ error: doctorAuthErr.message }, { status: 500 })
      }
      // If already exists, try to find the user
      const { data: { users } } = await supabase.auth.admin.listUsers()
      const existing = users?.find(u => u.email === 'ivana2@gmail.com')
      if (existing) {
        doctorUserId = existing.id
      } else {
        return NextResponse.json({ error: 'Doctor user exists but cannot be found' }, { status: 500 })
      }
    } else {
      doctorUserId = doctorAuth.user.id
    }

    // 4. Create doctor profile
    if (doctorUserId) {
      await supabase.from('profiles').upsert({
        id: doctorUserId,
        full_name: 'Ivana Solano',
        role: 'doctor',
        specialty: 'Psicología',
        professional_title: 'Psic.',
        email: 'ivana2@gmail.com',
        is_active: true,
      })
    }

    // 5. Create subscription for doctor (free plan for 30 days)
    if (doctorUserId) {
      const now = new Date()
      const expires = new Date(now)
      expires.setDate(expires.getDate() + 30)

      await supabase.from('subscriptions').insert({
        doctor_id: doctorUserId,
        plan: 'basic',
        status: 'trial',
        current_period_end: expires.toISOString(),
      }).select().single()
    }

    // 6. Create patient record linking ivana@gmail.com to ivana2@gmail.com doctor
    if (patientUserId && doctorUserId) {
      await supabase.from('patients').insert({
        doctor_id: doctorUserId,
        full_name: 'Ivana Solano',
        email: 'ivana@gmail.com',
        auth_user_id: patientUserId,
        source: 'manual',
      })
    }

    return NextResponse.json({
      success: true,
      patientAccount: {
        email: 'ivana@gmail.com',
        password: '12345678',
        userId: patientUserId,
      },
      doctorAccount: {
        email: 'ivana2@gmail.com',
        password: '12345678',
        userId: doctorUserId,
        specialty: 'Psicología',
        subscriptionPlan: 'basic',
        expiresIn: '30 days',
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error occurred' },
      { status: 500 }
    )
  }
}
