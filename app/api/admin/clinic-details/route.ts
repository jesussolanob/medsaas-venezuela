import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  const clinicId = req.nextUrl.searchParams.get('id')
  if (!clinicId) return NextResponse.json({ error: 'Missing clinic id' }, { status: 400 })

  // Verify the caller is authenticated and is a super_admin or admin
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const admin = createAdminClient()
  const { data: callerProfile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!callerProfile || !['super_admin', 'admin'].includes(callerProfile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Use admin client to bypass RLS
  const { data: clinic, error: clinicError } = await admin
    .from('clinics')
    .select('*')
    .eq('id', clinicId)
    .single()

  if (clinicError) return NextResponse.json({ error: clinicError.message }, { status: 500 })
  if (!clinic) return NextResponse.json({ error: 'Clinic not found' }, { status: 404 })

  // Get owner profile
  let ownerProfile = null
  if (clinic.owner_id) {
    const { data: owner } = await admin
      .from('profiles')
      .select('id, full_name, email')
      .eq('id', clinic.owner_id)
      .single()
    ownerProfile = owner
  }

  // Get all doctors in this clinic
  const { data: doctors } = await admin
    .from('profiles')
    .select('id, full_name, specialty, is_active')
    .eq('clinic_id', clinicId)
    .order('created_at', { ascending: false })

  // Get subscription info for the clinic owner
  let subscription = null
  if (clinic.owner_id) {
    const { data: sub } = await admin
      .from('subscriptions')
      .select('*')
      .eq('doctor_id', clinic.owner_id)
      .single()
    subscription = sub
  }

  return NextResponse.json({
    clinic,
    ownerProfile,
    doctors: doctors || [],
    subscription,
    doctorCount: doctors?.length || 0,
  })
}
