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

    if (!doctorId || !scheduledAt) {
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
    }

    // Guest mode: require patientName and patientEmail if no accessToken
    if (!accessToken && (!patientName || !patientEmail)) {
      return NextResponse.json(
        { error: 'Se requiere nombre y email del paciente para booking sin autenticación' },
        { status: 400 }
      )
    }

    const admin = createAdminClient()
    let user: any = null

    // ── Verify JWT (if authenticated) ────────────────────────────────────────
    if (accessToken) {
      const userClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          global: { headers: { Authorization: `Bearer ${accessToken}` } },
          auth: { autoRefreshToken: false, persistSession: false },
        }
      )
      const { data: { user: authUser }, error: userErr } = await userClient.auth.getUser(accessToken)
      if (userErr || !authUser) {
        return NextResponse.json({ error: 'Sesión expirada. Inicia sesión de nuevo.' }, { status: 401 })
      }
      user = authUser
    }

    const finalName = patientName || (user ? user.email?.split('@')[0] : 'Paciente') || 'Paciente'
    const finalEmail = patientEmail || user?.email

    // ── VALIDATION 1: Check for duplicate appointment (same doctor + time) ──
    const scheduledDate = new Date(scheduledAt)
    const bufferMs = 15 * 60 * 1000 // 15 min buffer for near-duplicate detection
    const windowStart = new Date(scheduledDate.getTime() - bufferMs).toISOString()
    const windowEnd = new Date(scheduledDate.getTime() + bufferMs).toISOString()

    const { data: existingAppts } = await admin
      .from('appointments')
      .select('id, patient_name, scheduled_at')
      .eq('doctor_id', doctorId)
      .in('status', ['scheduled', 'confirmed'])
      .gte('scheduled_at', windowStart)
      .lte('scheduled_at', windowEnd)

    // Check if THIS user already has an appointment in that window
    // For authenticated users: check by auth_user_id
    // For guests: check by email
    let userExistingQuery = admin
      .from('appointments')
      .select('id, scheduled_at')
      .eq('doctor_id', doctorId)
      .in('status', ['scheduled', 'confirmed'])
      .gte('scheduled_at', windowStart)
      .lte('scheduled_at', windowEnd)

    if (user) {
      userExistingQuery = userExistingQuery.eq('auth_user_id', user.id)
    } else {
      userExistingQuery = userExistingQuery.eq('patient_email', finalEmail)
    }

    const { data: userExistingAppts } = await userExistingQuery

    if (userExistingAppts && userExistingAppts.length > 0) {
      return NextResponse.json(
        { error: 'Ya tienes una cita agendada en este horario con este doctor.' },
        { status: 409 }
      )
    }

    // Check if the slot itself is taken by anyone
    if (existingAppts && existingAppts.length > 0) {
      return NextResponse.json(
        { error: 'Este horario ya fue tomado por otro paciente. Selecciona otro.' },
        { status: 409 }
      )
    }

    // ── VALIDATION 2: Package validation (only for authenticated users) ──────
    let validatedPackage: { id: string; used_sessions: number; total_sessions: number; auth_user_id: string } | null = null

    if (packageId) {
      // Guests cannot use packages
      if (!user) {
        return NextResponse.json(
          { error: 'Debes iniciar sesión para usar un paquete prepagado.' },
          { status: 403 }
        )
      }

      const { data: pkg, error: pkgErr } = await admin
        .from('patient_packages')
        .select('id, used_sessions, total_sessions, auth_user_id, status, doctor_id')
        .eq('id', packageId)
        .single()

      if (pkgErr || !pkg) {
        return NextResponse.json(
          { error: 'Paquete no encontrado.' },
          { status: 404 }
        )
      }

      // Verify ownership
      if (pkg.auth_user_id !== user.id) {
        return NextResponse.json(
          { error: 'Este paquete no te pertenece.' },
          { status: 403 }
        )
      }

      // Verify doctor matches
      if (pkg.doctor_id !== doctorId) {
        return NextResponse.json(
          { error: 'Este paquete es de otro médico.' },
          { status: 400 }
        )
      }

      // Verify package is still active
      if (pkg.status !== 'active') {
        return NextResponse.json(
          { error: 'Este paquete ya fue completado o está inactivo.' },
          { status: 400 }
        )
      }

      // Verify remaining sessions
      if (pkg.used_sessions >= pkg.total_sessions) {
        return NextResponse.json(
          { error: `Ya usaste todas las ${pkg.total_sessions} citas de tu paquete.` },
          { status: 400 }
        )
      }

      validatedPackage = pkg
    }

    // ── 1. Get or create patient ────────────────────────────────────────────
    let patientId: string | undefined

    // Authenticated users: look up by auth_user_id first
    if (user) {
      const { data: existingPatient, error: findErr } = await admin
        .from('patients')
        .select('id')
        .eq('doctor_id', doctorId)
        .eq('auth_user_id', user.id)
        .maybeSingle()

      patientId = existingPatient?.id

      if (!patientId && !findErr) {
        const { data: byEmail } = await admin
          .from('patients')
          .select('id')
          .eq('doctor_id', doctorId)
          .eq('email', finalEmail)
          .maybeSingle()

        if (byEmail?.id) {
          patientId = byEmail.id
          await admin
            .from('patients')
            .update({ auth_user_id: user.id })
            .eq('id', patientId)
        }
      }
    } else {
      // Guests: look up by email only
      const { data: byEmail } = await admin
        .from('patients')
        .select('id')
        .eq('doctor_id', doctorId)
        .eq('email', finalEmail)
        .maybeSingle()

      patientId = byEmail?.id
    }

    if (!patientId) {
      const patientInsert: Record<string, unknown> = {
        doctor_id: doctorId,
        full_name: finalName,
        phone: patientPhone || null,
        email: finalEmail,
        source: 'booking',
      }
      if (patientCedula) patientInsert.cedula = patientCedula
      if (user) patientInsert.auth_user_id = user.id

      const { data: newPatient, error: pErr } = await admin
        .from('patients')
        .insert(patientInsert)
        .select('id')
        .single()

      if (pErr || !newPatient) {
        if (pErr?.message?.includes('auth_user_id') && user) {
          // Retry without auth_user_id if there was a conflict
          const { data: retryPatient, error: retryErr } = await admin
            .from('patients')
            .insert({
              doctor_id: doctorId,
              full_name: finalName,
              phone: patientPhone || null,
              email: finalEmail,
              source: 'booking',
            })
            .select('id')
            .single()

          if (retryErr || !retryPatient) {
            return NextResponse.json(
              { error: `Error al registrar paciente: ${retryErr?.message || 'Unknown'}` },
              { status: 500 }
            )
          }
          patientId = retryPatient.id
        } else {
          return NextResponse.json(
            { error: `Error al registrar paciente: ${pErr?.message || 'Unknown'}` },
            { status: 500 }
          )
        }
      } else {
        patientId = newPatient.id
      }
    }

    if (!patientId) {
      return NextResponse.json({ error: 'No se pudo obtener el ID del paciente' }, { status: 500 })
    }

    // ── 2. Create appointment ───────────────────────────────────────────────
    const appointmentData: Record<string, unknown> = {
      doctor_id: doctorId,
      patient_id: patientId,
      patient_name: finalName,
      patient_phone: patientPhone || null,
      patient_email: finalEmail,
      status: 'scheduled',
      source: 'booking',
      scheduled_at: scheduledAt,
      chief_complaint: chiefComplaint || null,
      plan_name: planName || 'Consulta General',
      plan_price: validatedPackage ? 0 : (planPrice || 20), // Package sessions are $0
      payment_method: validatedPackage ? 'package' : (paymentMethod || 'direct'),
      insurance_name: insuranceName || null,
      payment_receipt_url: receiptUrl || null,
      appointment_mode: appointmentMode || 'presencial',
    }
    // Only set auth_user_id if user is authenticated
    if (user) {
      appointmentData.auth_user_id = user.id
    }
    if (patientCedula) appointmentData.patient_cedula = patientCedula

    // Pre-link to package if using one
    if (validatedPackage) {
      appointmentData.package_id = validatedPackage.id
      appointmentData.session_number = validatedPackage.used_sessions + 1
    }

    const { data: appt, error: apptErr } = await admin
      .from('appointments')
      .insert(appointmentData)
      .select('id')
      .single()

    if (apptErr || !appt) {
      // Retry with minimal columns if some don't exist
      if (apptErr?.message?.includes('column') || apptErr?.message?.includes('does not exist')) {
        const minimalAppt: Record<string, unknown> = {
          doctor_id: doctorId,
          patient_id: patientId,
          patient_name: finalName,
          patient_phone: patientPhone || null,
          patient_email: patientEmail || user.email,
          status: 'scheduled',
          source: 'booking',
          scheduled_at: scheduledAt,
          chief_complaint: chiefComplaint || null,
          plan_name: planName || 'Consulta General',
          plan_price: validatedPackage ? 0 : (planPrice || 20),
        }

        const { data: retryAppt, error: retryErr } = await admin
          .from('appointments')
          .insert(minimalAppt)
          .select('id')
          .single()

        if (retryErr || !retryAppt) {
          return NextResponse.json(
            { error: `Error al guardar cita: ${retryErr?.message || 'Unknown'}` },
            { status: 500 }
          )
        }

        // Still handle package even on retry
        if (validatedPackage) {
          await updatePackageUsage(admin, validatedPackage, retryAppt.id)
        }

        return NextResponse.json({
          success: true,
          appointmentId: retryAppt.id,
          patientId,
          packageUsed: !!validatedPackage,
          packageRemaining: validatedPackage
            ? validatedPackage.total_sessions - validatedPackage.used_sessions - 1
            : null,
        })
      }

      return NextResponse.json(
        { error: `Error al guardar cita: ${apptErr?.message || 'Unknown'}` },
        { status: 500 }
      )
    }

    // ── 3. Handle packages ──────────────────────────────────────────────────
    if (validatedPackage) {
      await updatePackageUsage(admin, validatedPackage, appt.id)
    } else if (sessionsCount && sessionsCount > 1 && user) {
      // Create new package for multi-session plan (only for authenticated users)
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
          try {
            await admin
              .from('appointments')
              .update({ package_id: pkg.id, session_number: 1 })
              .eq('id', appt.id)
          } catch { /* column may not exist */ }
        }
      } catch (pkgErr) {
        console.warn('[API /book] package creation skipped:', pkgErr)
      }
    }

    // NOTE: We no longer auto-create a consultation here.
    // The doctor reviews the pending appointment in the agenda and accepts it,
    // which creates the consultation. This prevents duplicate entries on the calendar.

    // Best-effort: sync appointment to Google Calendar if doctor has it connected
    // NOTE: We call Google Calendar API directly here instead of going through
    // /api/integrations/google/sync because that endpoint uses cookie-based auth
    // which would authenticate the PATIENT (the one booking), not the DOCTOR.
    try {
      const { data: doctorProfile } = await admin
        .from('profiles')
        .select('google_refresh_token')
        .eq('id', doctorId)
        .single()

      if (doctorProfile?.google_refresh_token) {
        // Exchange refresh token for access token
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: process.env.GOOGLE_CLIENT_ID || '',
            client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
            refresh_token: doctorProfile.google_refresh_token,
            grant_type: 'refresh_token',
          }),
        })

        if (tokenRes.ok) {
          const tokenData = await tokenRes.json()
          const gcalAccessToken = tokenData.access_token

          if (gcalAccessToken) {
            const startDt = new Date(scheduledAt)
            const endDt = new Date(startDt.getTime() + 30 * 60000) // 30 min default

            const isOnline = appointmentMode === 'online'

            const event: Record<string, unknown> = {
              summary: `Consulta - ${finalName}`,
              description: `Plan: ${planName || 'N/A'} | Motivo: ${chiefComplaint || 'Consulta médica'}${isOnline ? '\n\n📹 Consulta Online — el link de Google Meet está incluido en este evento.' : ''}`,
              start: { dateTime: startDt.toISOString(), timeZone: 'America/Caracas' },
              end: { dateTime: endDt.toISOString(), timeZone: 'America/Caracas' },
              reminders: {
                useDefault: false,
                overrides: [
                  { method: 'popup', minutes: 30 },
                  { method: 'popup', minutes: 10 },
                ],
              },
              // Send email invitations to the patient
              guestsCanModify: false,
              guestsCanSeeOtherGuests: false,
            }

            // Add patient as attendee so they receive the calendar invite
            if (finalEmail) {
              event.attendees = [
                { email: finalEmail, displayName: finalName, responseStatus: 'needsAction' },
              ]
            }

            // For online appointments, create a Google Meet conference
            if (isOnline) {
              event.conferenceData = {
                createRequest: {
                  requestId: `delta-${appt.id}-${Date.now()}`,
                  conferenceSolutionKey: { type: 'hangoutsMeet' },
                },
              }
            }

            // Use conferenceDataVersion=1 to enable Meet creation
            const calendarUrl = isOnline
              ? 'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all'
              : 'https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all'

            // Fire-and-forget: don't block the booking response
            fetch(calendarUrl, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${gcalAccessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(event),
            }).then(async (res) => {
              if (!res.ok) {
                const errText = await res.text()
                console.error('[Book] Google Calendar event creation failed:', errText)
              } else {
                const createdEvent = await res.json()
                console.log('[Book] Google Calendar event created successfully:', createdEvent.id)

                // If a Meet link was generated, save it to the appointment
                const meetLink = createdEvent.hangoutLink || createdEvent.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === 'video')?.uri
                if (meetLink && appt?.id) {
                  try {
                    await admin
                      .from('appointments')
                      .update({ meet_link: meetLink, google_event_id: createdEvent.id })
                      .eq('id', appt.id)
                  } catch {
                    // meet_link column may not exist yet
                    console.warn('[Book] Could not save meet_link — column may not exist')
                  }
                }

                // Also save google_event_id even without meet
                if (!meetLink && createdEvent.id && appt?.id) {
                  try {
                    await admin
                      .from('appointments')
                      .update({ google_event_id: createdEvent.id })
                      .eq('id', appt.id)
                  } catch { /* column may not exist */ }
                }
              }
            }).catch(err => console.warn('[Book] Google Calendar sync error:', err))
          }
        } else {
          console.warn('[Book] Could not refresh Google token:', await tokenRes.text())
        }
      }
    } catch (err) {
      console.warn('[Book] Google Calendar sync skipped:', err)
    }

    return NextResponse.json({
      success: true,
      appointmentId: appt.id,
      patientId,
      packageUsed: !!validatedPackage,
      packageRemaining: validatedPackage
        ? validatedPackage.total_sessions - validatedPackage.used_sessions - 1
        : null,
    })
  } catch (err: any) {
    console.error('[API /book] unexpected error:', err)
    return NextResponse.json({ error: err?.message || 'Error interno' }, { status: 500 })
  }
}

/** Atomically increment used_sessions and auto-complete if all sessions used */
async function updatePackageUsage(
  admin: ReturnType<typeof createAdminClient>,
  pkg: { id: string; used_sessions: number; total_sessions: number },
  appointmentId: string
) {
  const newUsed = pkg.used_sessions + 1
  const updateData: Record<string, unknown> = { used_sessions: newUsed }

  if (newUsed >= pkg.total_sessions) {
    updateData.status = 'completed'
  }

  await admin
    .from('patient_packages')
    .update(updateData)
    .eq('id', pkg.id)
    // Safety: only update if used_sessions hasn't changed (optimistic lock)
    .eq('used_sessions', pkg.used_sessions)

  // Verify the update took effect (race condition check)
  const { data: updated } = await admin
    .from('patient_packages')
    .select('used_sessions')
    .eq('id', pkg.id)
    .single()

  if (updated && updated.used_sessions !== newUsed) {
    console.warn(`[API /book] Package ${pkg.id} race condition detected. Expected ${newUsed}, got ${updated.used_sessions}`)
  }

  // Link appointment to package
  try {
    await admin
      .from('appointments')
      .update({ package_id: pkg.id, session_number: newUsed })
      .eq('id', appointmentId)
  } catch {
    // package_id or session_number columns may not exist
  }
}
