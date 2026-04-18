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
      packageId,
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
    const finalName = patientName || user.email?.split('@')[0] || 'Paciente'

    // 1. Get or create patient (admin client bypasses RLS)
    // First try to find by doctor_id + auth_user_id
    const { data: existingPatient, error: findErr } = await admin
      .from('patients')
      .select('id')
      .eq('doctor_id', doctorId)
      .eq('auth_user_id', user.id)
      .maybeSingle()

    let patientId = existingPatient?.id

    // If not found by auth_user_id, try by email
    if (!patientId && !findErr) {
      const { data: byEmail } = await admin
        .from('patients')
        .select('id')
        .eq('doctor_id', doctorId)
        .eq('email', patientEmail || user.email)
        .maybeSingle()

      if (byEmail?.id) {
        patientId = byEmail.id
        // Link auth_user_id to existing patient
        await admin
          .from('patients')
          .update({ auth_user_id: user.id })
          .eq('id', patientId)
      }
    }

    if (!patientId) {
      // Build insert object with only columns we know exist
      const patientInsert: Record<string, unknown> = {
        doctor_id: doctorId,
        full_name: finalName,
        phone: patientPhone || null,
        email: patientEmail || user.email,
        source: 'booking',
      }

      // Try adding optional columns (may not exist if migrations weren't run)
      // We add them to the insert and if they fail, we retry without them
      patientInsert.auth_user_id = user.id
      if (patientCedula) patientInsert.cedula = patientCedula

      const { data: newPatient, error: pErr } = await admin
        .from('patients')
        .insert(patientInsert)
        .select('id')
        .single()

      if (pErr || !newPatient) {
        // If the error is about auth_user_id column not existing, retry without it
        if (pErr?.message?.includes('auth_user_id')) {
          console.warn('[API /book] auth_user_id column missing, retrying without it')
          const { data: retryPatient, error: retryErr } = await admin
            .from('patients')
            .insert({
              doctor_id: doctorId,
              full_name: finalName,
              phone: patientPhone || null,
              email: patientEmail || user.email,
              source: 'booking',
            })
            .select('id')
            .single()

          if (retryErr || !retryPatient) {
            console.error('[API /book] createPatient retry error:', retryErr)
            return NextResponse.json(
              { error: `Error al registrar paciente: ${retryErr?.message || 'Unknown'}` },
              { status: 500 }
            )
          }
          patientId = retryPatient.id
        } else {
          console.error('[API /book] createPatient error:', pErr)
          return NextResponse.json(
            { error: `Error al registrar paciente: ${pErr?.message || 'Unknown'}` },
            { status: 500 }
          )
        }
      } else {
        patientId = newPatient.id
      }
    }

    // 2. Verify patient exists before creating appointment
    if (!patientId) {
      return NextResponse.json(
        { error: 'No se pudo obtener el ID del paciente' },
        { status: 500 }
      )
    }

    const { data: verifyPatient } = await admin
      .from('patients')
      .select('id')
      .eq('id', patientId)
      .single()

    if (!verifyPatient) {
      return NextResponse.json(
        { error: 'El paciente fue creado pero no se encontró en la base de datos. Intenta de nuevo.' },
        { status: 500 }
      )
    }

    // 3. Build appointment insert — only include columns that exist
    const appointmentData: Record<string, unknown> = {
      doctor_id: doctorId,
      patient_id: patientId,
      patient_name: finalName,
      patient_phone: patientPhone || null,
      patient_email: patientEmail || user.email,
      status: 'scheduled',
      source: 'booking',
    }

    // Add columns that may exist (from migrations v6, v11)
    appointmentData.auth_user_id = user.id
    appointmentData.scheduled_at = scheduledAt
    appointmentData.chief_complaint = chiefComplaint || null
    appointmentData.plan_name = planName || 'Consulta General'
    appointmentData.plan_price = planPrice || 20
    appointmentData.payment_method = paymentMethod || 'direct'
    appointmentData.insurance_name = insuranceName || null
    appointmentData.payment_receipt_url = receiptUrl || null
    appointmentData.appointment_mode = appointmentMode || 'presencial'
    if (patientCedula) appointmentData.patient_cedula = patientCedula

    const { data: appt, error: apptErr } = await admin
      .from('appointments')
      .insert(appointmentData)
      .select('id')
      .single()

    if (apptErr || !appt) {
      // If error is about missing columns, retry with minimal columns
      if (apptErr?.message?.includes('column') || apptErr?.message?.includes('does not exist')) {
        console.warn('[API /book] Some appointment columns missing, retrying with minimal set')
        const minimalAppt: Record<string, unknown> = {
          doctor_id: doctorId,
          patient_id: patientId,
          patient_name: finalName,
          patient_phone: patientPhone || null,
          patient_email: patientEmail || user.email,
          status: 'scheduled',
          source: 'booking',
        }
        // Try adding appointment_date instead of scheduled_at
        minimalAppt.appointment_date = scheduledAt
        minimalAppt.chief_complaint = chiefComplaint || null
        minimalAppt.plan_name = planName || 'Consulta General'
        minimalAppt.plan_price = planPrice || 20

        const { data: retryAppt, error: retryErr } = await admin
          .from('appointments')
          .insert(minimalAppt)
          .select('id')
          .single()

        if (retryErr || !retryAppt) {
          console.error('[API /book] createAppointment retry error:', retryErr)
          return NextResponse.json(
            { error: `Error al guardar cita: ${retryErr?.message || 'Unknown'}` },
            { status: 500 }
          )
        }

        return NextResponse.json({ success: true, appointmentId: retryAppt.id, patientId })
      }

      console.error('[API /book] createAppointment error:', apptErr)
      return NextResponse.json(
        { error: `Error al guardar cita: ${apptErr?.message || 'Unknown'}` },
        { status: 500 }
      )
    }

    // 4. Handle packages: use existing or create new
    // If booking from an existing package, increment used_sessions
    if (packageId) {
      try {
        const { data: pkg } = await admin
          .from('patient_packages')
          .select('id, used_sessions, total_sessions')
          .eq('id', packageId)
          .single()

        if (pkg) {
          const newUsed = pkg.used_sessions + 1
          const updateData: Record<string, unknown> = { used_sessions: newUsed }
          // Auto-complete package when all sessions are used
          if (newUsed >= pkg.total_sessions) {
            updateData.status = 'completed'
          }
          await admin
            .from('patient_packages')
            .update(updateData)
            .eq('id', packageId)

          // Link appointment to package
          await admin
            .from('appointments')
            .update({ package_id: packageId, session_number: newUsed })
            .eq('id', appt.id)
        }
      } catch (pkgErr) {
        console.warn('[API /book] package update skipped:', pkgErr)
      }
    } else if (sessionsCount && sessionsCount > 1) {
      try {
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
      } catch (pkgErr) {
        // Package creation is optional, don't fail the booking
        console.warn('[API /book] package creation skipped:', pkgErr)
      }
    }

    return NextResponse.json({ success: true, appointmentId: appt.id, patientId })
  } catch (err: any) {
    console.error('[API /book] unexpected error:', err)
    return NextResponse.json({ error: err?.message || 'Error interno' }, { status: 500 })
  }
}
