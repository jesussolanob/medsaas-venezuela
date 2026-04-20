import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  const doctorId = req.nextUrl.searchParams.get('id')
  if (!doctorId) return NextResponse.json({ error: 'Missing doctor id' }, { status: 400 })

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

  if (!callerProfile || !['super_admin', 'admin'].includes(callerProfile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Use admin client to bypass RLS
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('*')
    .eq('id', doctorId)
    .single()

  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 })

  // Get patient count from patients table
  const { count: patientCount } = await admin
    .from('patients')
    .select('*', { count: 'exact', head: true })
    .eq('doctor_id', doctorId)

  // Get all citas this month — from both appointments AND doctor-created consultations
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()

  // Appointments (booked by patients)
  const { data: appointments } = await admin
    .from('appointments')
    .select('id, plan_price')
    .eq('doctor_id', doctorId)
    .gte('created_at', monthStart)

  // Consultations created directly by doctor (no linked appointment)
  const { data: doctorConsultations } = await admin
    .from('consultations')
    .select('id, plan_price')
    .eq('doctor_id', doctorId)
    .is('appointment_id', null)
    .gte('consultation_date', monthStart)

  // Get subscription
  const { data: subscription } = await admin
    .from('subscriptions')
    .select('*')
    .eq('doctor_id', doctorId)
    .single()

  const apptRevenue = (appointments || []).reduce((sum, a) => sum + (a.plan_price || 0), 0)
  const consRevenue = (doctorConsultations || []).reduce((sum, c) => sum + (c.plan_price || 0), 0)
  const totalCitas = (appointments?.length || 0) + (doctorConsultations?.length || 0)

  return NextResponse.json({
    profile,
    patientCount: patientCount || 0,
    consultationCount: totalCitas,
    monthlyRevenue: apptRevenue + consRevenue,
    subscription: subscription || null,
  })
}
