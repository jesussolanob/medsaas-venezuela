import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  // Verify the caller is authenticated and is a super_admin
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const admin = createAdminClient()
  const { data: callerProfile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!callerProfile || callerProfile.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    // Count doctors (profiles where role='doctor' and is_active=true)
    const { count: doctorCount } = await admin
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'doctor')
      .eq('is_active', true)

    // Count patients (profiles where role='patient')
    const { count: patientCount } = await admin
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'patient')

    // Count appointments
    const { count: appointmentCount } = await admin
      .from('appointments')
      .select('*', { count: 'exact', head: true })

    // Get Supabase project URL to extract region
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    const region = supabaseUrl.includes('azsismbgfanszkygzwaz') ? 'US East (Supabase)' : 'Unknown'

    return NextResponse.json({
      doctors: doctorCount || 0,
      patients: patientCount || 0,
      appointments: appointmentCount || 0,
      region,
      supabaseUrl,
    })
  } catch (error) {
    console.error('Settings data fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch settings data' },
      { status: 500 }
    )
  }
}
