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

  // Get all citas this month from consultations table (single source of truth)
  // Includes both doctor-created and booking-created consultations
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()

  const { data: allConsultations } = await admin
    .from('consultations')
    .select('id, plan_price, consultation_date, created_at')
    .eq('doctor_id', doctorId)
    .or(`consultation_date.gte.${monthStart},created_at.gte.${monthStart}`)

  // Also count appointments that might not have a consultation yet
  const { data: appointments } = await admin
    .from('appointments')
    .select('id, plan_price, consultation_id')
    .eq('doctor_id', doctorId)
    .gte('created_at', monthStart)

  // Appointments without a linked consultation (not yet converted)
  const orphanAppointments = (appointments || []).filter(a => !a.consultation_id)

  // Plan + status + expires_at ya vienen en profile (columnas en profiles)
  const subscription = profile
    ? {
        plan: profile.plan || 'trial',
        status: profile.subscription_status || 'active',
        current_period_end: profile.subscription_expires_at || null,
      }
    : null

  const consRevenue = (allConsultations || []).reduce((sum, c) => sum + (c.plan_price || 0), 0)
  const orphanRevenue = orphanAppointments.reduce((sum, a) => sum + (a.plan_price || 0), 0)
  const totalCitas = (allConsultations?.length || 0) + orphanAppointments.length

  return NextResponse.json({
    profile,
    patientCount: patientCount || 0,
    consultationCount: totalCitas,
    monthlyRevenue: consRevenue + orphanRevenue,
    subscription,
  })
}
