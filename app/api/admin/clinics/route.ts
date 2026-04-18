import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
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

  // Fetch all clinics
  const { data: clinics, error } = await admin
    .from('clinics')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Get doctor counts per clinic
  const clinicIds = (clinics || []).map(c => c.id)
  let doctorCounts: Record<string, number> = {}

  if (clinicIds.length > 0) {
    const { data: doctors } = await admin
      .from('profiles')
      .select('clinic_id')
      .in('clinic_id', clinicIds)

    for (const doc of (doctors || [])) {
      if (doc.clinic_id) {
        doctorCounts[doc.clinic_id] = (doctorCounts[doc.clinic_id] || 0) + 1
      }
    }
  }

  // Get owner names
  const ownerIds = (clinics || []).map(c => c.owner_id).filter(Boolean)
  let ownerNames: Record<string, string> = {}

  if (ownerIds.length > 0) {
    const { data: owners } = await admin
      .from('profiles')
      .select('id, full_name')
      .in('id', ownerIds)

    for (const owner of (owners || [])) {
      ownerNames[owner.id] = owner.full_name
    }
  }

  const result = (clinics || []).map(clinic => ({
    ...clinic,
    doctor_count: doctorCounts[clinic.id] || 0,
    owner_name: ownerNames[clinic.owner_id] || 'Sin asignar',
  }))

  return NextResponse.json(result)
}
