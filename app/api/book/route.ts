import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      doctorId,
      accessToken,
      patientName,
      patientPhone,
      patientEmail,
      patientCedula,
      scheduledAt,
      chiefComplaint,
      planName,
      planPrice,
      sessionsCount,
      paymentMethod,
      insuranceName,
      receiptUrl,
      appointmentMode,
    } = body

    if (!doctorId || !accessToken || !scheduledAt) {
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
    }

    // Verify the user's JWT with a throwaway client
    const userClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
        auth: { autoRefreshToken: false, persistSession: false },
      }
    )
    const { data: { user }, error: userErr } = await userClient.auth.getUser(accessToken)
    if (userErr || !user) {
      return NextResponse.json({ error: 'Sesion expirada. Inicia sesion de nuevo.' }, { status: 401 })
    }

    const admin = createAdminClient()

    // 1. Get or create patient (admin client bypasses RLS)
    const { data: existingPatient } = await admin
      .from('patients')
      .select('id')
      .eq('doctor_id', doctorId)
      .eq('auth_user_id', user.id)
      .maybeSingle()

    let patientId = existingPatient?.id

    if (!patientId) {
      const { data: newPatient, error: pErr } = await admin
        .from('patients')
        .insert({
          doctor_id: doctorId,
          auth_user_id: user.id,
          full_name: patientName || user.email?.split('@')[0] || 'Paciente',
          cedula: patientCedula || null,
          phone: patientPhone || null,
          email: patientEmail || user.email,
          source: 'booking',
        })
        .select('id')
        .single()

      if (pErr || !newPatient) {
        console.error('[API /book] createPatient error:', pErr)
        return NextResponse.json(
          { error: `Error al registrar paciente: ${pErr?.message || 'Unknown'}` },
          { status: 500 }
        )
      }
      patientId = newPatient.id
    }

    // 2. Create appointment
    const { data: appt, error: apptErr } = await admin
      .from('appointments')
      .insert({
        doctor_id: doctorId,
        patient_id: patientId,
        auth_user_id: user.id,
        patient_name: patientName || user.email?.split('@')[0] || 'Paciente',
        patient_phone: patientPhone || null,
        patient_email: patientEmail || user.email,
        patient_cedula: patientCedula || null,
        scheduled_at: scheduledAt,
        chief_complaint: chiefComplaint || null,
        plan_name: planName || 'Consulta General',
        plan_price: planPrice || 20,
        status: 'scheduled',
        source: 'booking',
        payment_method: paymentMethod || 'direct',
        insurance_name: insuranceName || null,
        payment_receipt_url: receiptUrl || null,
        appointment_mode: appointmentMode || 'presencial',
      })
      .select('id')
      .single()

    if (apptErr || !appt) {
      console.error('[API /book] createAppointment error:', apptErr)
      return NextResponse.json(
        { error: `Error al guardar cita: ${apptErr?.message || 'Unknown'}` },
        { status: 500 }
      )
    }

    // 3. Create package if multi-session plan
    if (sessionsCount && sessionsCount > 1) {
      const { data: pkg } = await admin
        .from('patient_packages')
        .insert({
          doctor_id: doctorId,
          patient_id: patientId,
          auth_user_id: user.id,
          plan_name: planName,
          total_sessions: sessionsCount,
          used_sessions: 1,
          price_usd: planPrice,
          status: 'active',
        })
        .select('id')
        .single()

      if (pkg) {
        await admin
          .from('appointments')
          .update({ package_id: pkg.id, session_number: 1 })
          .eq('id', appt.id)
      }
    }

    return NextResponse.json({ success: true, appointmentId: appt.id, patientId })
  } catch (err: any) {
    console.error('[API /book] unexpected error:', err)
    return NextResponse.json({ error: err?.message || 'Error interno' }, { status: 500 })
  }
}
