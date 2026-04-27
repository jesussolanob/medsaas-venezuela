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
      paymentReference,
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

    // 🛡️  GUARD: si el usuario logueado ES el doctor mismo (o un admin), NO debe
    // tratarse como paciente — evita corromper la BD con un patient row que tenga
    // auth_user_id == doctor_id y email == email del doctor (bug Osmariel 2026-04-26).
    let userIsDoctorOrAdmin = false
    if (user) {
      if (user.id === doctorId) {
        userIsDoctorOrAdmin = true
      } else {
        // Verificar role en profiles
        const { data: prof } = await admin
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle()
        if (prof?.role && ['doctor', 'super_admin', 'admin'].includes(prof.role)) {
          userIsDoctorOrAdmin = true
        }
      }
    }
    // Si es doctor/admin: tratamos el booking como guest (sin auth_user_id)
    // y EXIGIMOS patientName + patientEmail explícitos del form (no fallback al email del doctor).
    if (userIsDoctorOrAdmin) {
      if (!patientName || !patientEmail) {
        return NextResponse.json(
          { error: 'Como médico/admin, debes ingresar el nombre y email del paciente — no se autocompletan con tus datos.' },
          { status: 400 }
        )
      }
      user = null  // forzar modo guest a partir de aquí
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
        .select('id, used_sessions, total_sessions, auth_user_id, patient_id, status, doctor_id')
        .eq('id', packageId)
        .single()

      if (pkgErr || !pkg) {
        return NextResponse.json(
          { error: 'Paquete no encontrado.' },
          { status: 404 }
        )
      }

      // Verify ownership (by auth_user_id or patient_id linked to this auth user)
      let ownershipValid = pkg.auth_user_id === user.id
      if (!ownershipValid && pkg.patient_id) {
        // Check if user is linked to this patient record
        const { data: patientRecord } = await admin
          .from('patients')
          .select('id')
          .eq('id', pkg.patient_id)
          .eq('auth_user_id', user.id)
          .maybeSingle()
        ownershipValid = !!patientRecord
      }
      if (!ownershipValid) {
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

    // Fetch BCV rate for Bs calculation
    let bcvRate: number | null = null
    try {
      const bcvRes = await fetch(new URL('/api/admin/bcv-rate', req.url).toString())
      if (bcvRes.ok) {
        const bcvData = await bcvRes.json()
        if (bcvData.rate && bcvData.rate > 0) bcvRate = bcvData.rate
      }
    } catch { /* best-effort */ }

    // ── 2. Create appointment ───────────────────────────────────────────────
    // CR-006: Si hay paquete, usamos la RPC transaccional book_with_package
    // que serializa (FOR UPDATE) sobre el paquete. Imposible la doble-reserva.
    let appt: { id: string } | null = null
    let apptErr: any = null

    if (validatedPackage) {
      const { data: rpcData, error: rpcErr } = await admin.rpc('book_with_package', {
        p_package_id: validatedPackage.id,
        p_doctor_id: doctorId,
        p_patient_id: patientId,
        p_auth_user_id: user?.id ?? null,
        p_scheduled_at: scheduledAt,
        p_patient_name: finalName,
        p_patient_phone: patientPhone || null,
        p_patient_email: finalEmail,
        p_plan_name: planName || 'Consulta General',
        p_chief_complaint: chiefComplaint || null,
        p_appointment_mode: appointmentMode || 'presencial',
        p_bcv_rate: bcvRate,
        p_patient_cedula: patientCedula || null,
      })

      if (rpcErr) {
        const msg = rpcErr.message || ''
        const code = (rpcErr as any).code
        // RONDA 23: double-booking detectado por unique index uniq_doctor_slot_active
        if (code === '23505' || msg.includes('uniq_doctor_slot_active') || msg.includes('duplicate key')) {
          return NextResponse.json(
            { error: 'Este horario ya no está disponible, por favor elige otro.', code: 'slot_taken' },
            { status: 409 }
          )
        }
        // Errores tipificados por la RPC — devolver 409/400 apropiados
        if (msg.includes('PACKAGE_EXHAUSTED')) {
          return NextResponse.json({ error: 'Ya usaste todas las sesiones de tu paquete.' }, { status: 409 })
        }
        if (msg.includes('PACKAGE_NOT_FOUND') || msg.includes('PACKAGE_DOCTOR_MISMATCH')) {
          return NextResponse.json({ error: 'Paquete inválido.' }, { status: 400 })
        }
        if (msg.includes('PACKAGE_NOT_ACTIVE')) {
          return NextResponse.json({ error: 'El paquete ya no está activo.' }, { status: 409 })
        }
        return NextResponse.json({ error: `Error en book_with_package: ${msg}` }, { status: 500 })
      }

      const row = Array.isArray(rpcData) ? rpcData[0] : rpcData
      appt = row ? { id: row.appointment_id } : null
    } else {
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
        plan_price: planPrice || 20,
        payment_method: paymentMethod || 'direct',
        payment_reference: paymentReference || null,
        insurance_name: insuranceName || null,
        payment_receipt_url: receiptUrl || null,
        appointment_mode: appointmentMode || 'presencial',
        bcv_rate: bcvRate,
        amount_bs: bcvRate ? parseFloat(((planPrice || 20) * bcvRate).toFixed(2)) : null,
      }
      if (user) appointmentData.auth_user_id = user.id
      if (patientCedula) appointmentData.patient_cedula = patientCedula

      const inserted = await admin
        .from('appointments')
        .insert(appointmentData)
        .select('id')
        .single()
      appt = inserted.data
      apptErr = inserted.error
    }

    if (apptErr || !appt) {
      // RONDA 23: detectar conflicto de slot (double-booking) por unique index
      // uniq_doctor_slot_active. Postgres devuelve code 23505.
      const code = (apptErr as any)?.code
      if (code === '23505') {
        return NextResponse.json(
          { error: 'Este horario ya no está disponible, por favor elige otro.', code: 'slot_taken' },
          { status: 409 }
        )
      }
      // AL-113 fix: ya NO hacemos "retry silencioso con columnas mínimas" —
      // eso tragaba columnas importantes (BCV, payment_method, package_id).
      return NextResponse.json(
        { error: `Error al guardar cita: ${apptErr?.message || 'Unknown'}` },
        { status: 500 }
      )
    }

    // ── 2.5 Crear payment + consultation y conectar vía FKs (reingeniería 2026-04-22)
    // Doble escritura: columnas viejas siguen pobladas para retrocompatibilidad.
    // ⚠️ LOGGING RUIDOSO: errores aquí dejan citas huérfanas. Mejor saberlo en prod.
    const isFromPackage = !!validatedPackage
    const paymentAmount = isFromPackage ? 0 : (planPrice || 20)

    let paymentId: string | null = null
    let consultationId: string | null = null

    // Crear payment
    try {
      const { data: paymentRow, error: payErr } = await admin
        .from('payments')
        .insert({
          doctor_id: doctorId,
          patient_id: patientId,
          amount_usd: paymentAmount,
          amount_bs: bcvRate ? parseFloat((paymentAmount * bcvRate).toFixed(2)) : null,
          bcv_rate: bcvRate,
          currency: 'USD',
          method_snapshot: paymentMethod || (isFromPackage ? 'package' : 'direct'),
          payment_reference: paymentReference || null,
          payment_receipt_url: receiptUrl || null,
          status: 'pending',
          package_id: validatedPackage?.id ?? null,
        })
        .select('id')
        .single()

      if (payErr) {
        console.error('[Book] ❌ payment INSERT FAILED:', payErr.message, payErr.details, payErr.hint)
      } else {
        paymentId = paymentRow?.id ?? null
      }
    } catch (e: any) {
      console.error('[Book] ❌ payment INSERT THREW:', e?.message)
    }

    // Crear consultation (status pending hasta que el doctor atienda)
    try {
      const { data: consRow, error: consErr } = await admin
        .from('consultations')
        .insert({
          doctor_id: doctorId,
          patient_id: patientId,
          appointment_id: appt!.id,
          status: 'pending',
          chief_complaint: chiefComplaint || null,
          consultation_date: scheduledAt,
          blocks_data: '[]',
        })
        .select('id')
        .single()

      if (consErr) {
        console.error('[Book] ❌ consultation INSERT FAILED:', consErr.message, consErr.details, consErr.hint)
      } else {
        consultationId = consRow?.id ?? null
      }
    } catch (e: any) {
      console.error('[Book] ❌ consultation INSERT THREW:', e?.message)
    }

    // Conectar appointment con payment + consultation
    if (paymentId || consultationId) {
      try {
        const updates: Record<string, unknown> = {
          service_snapshot: {
            name: planName || 'Consulta General',
            price_usd: planPrice || 20,
            mode: appointmentMode || 'presencial',
            sessions_count: sessionsCount || 1,
          },
        }
        if (paymentId) updates.payment_id = paymentId
        if (consultationId) updates.consultation_id = consultationId
        const { error: linkErr } = await admin.from('appointments').update(updates).eq('id', appt!.id)
        if (linkErr) {
          console.error('[Book] ❌ appointment link UPDATE FAILED:', linkErr.message)
        }
      } catch (e: any) {
        console.error('[Book] ❌ appointment link THREW:', e?.message)
      }
    }

    // ── 3. Handle packages ──────────────────────────────────────────────────
    // Nota: si validatedPackage !== null, la RPC book_with_package YA incrementó
    //       el paquete atómicamente. Aquí solo manejamos el caso de creación
    //       de un nuevo paquete para planes multi-sesión.
    if (!validatedPackage && sessionsCount && sessionsCount > 1 && user) {
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
          await admin
            .from('appointments')
            .update({ package_id: pkg.id, session_number: 1 })
            .eq('id', appt!.id)
        }
      } catch (pkgErr) {
        console.warn('[API /book] package creation skipped:', pkgErr)
      }
    }

    // NOTE: We no longer auto-create a consultation here.
    // The doctor reviews the pending appointment in the agenda and accepts it,
    // which creates the consultation. This prevents duplicate entries on the calendar.

    // ── Sync to Google Calendar + auto-create Meet link ───────────────────
    // Awaited (not fire-and-forget) so the meet_link is available in the response.
    let meetLink: string | null = null
    try {
      const { data: doctorProfile } = await admin
        .from('profiles')
        .select('google_refresh_token')
        .eq('id', doctorId)
        .single()

      if (doctorProfile?.google_refresh_token) {
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
          const { access_token: gcalAccessToken } = await tokenRes.json()

          if (gcalAccessToken) {
            const startDt = new Date(scheduledAt)
            const endDt = new Date(startDt.getTime() + 30 * 60000)
            const isOnline = appointmentMode === 'online'

            const event: Record<string, unknown> = {
              summary: `Consulta - ${finalName}`,
              description: [
                `Plan: ${planName || 'Consulta General'}`,
                chiefComplaint ? `Motivo: ${chiefComplaint}` : null,
                isOnline ? '📹 Consulta Online — el link de Google Meet está incluido en este evento.' : null,
              ].filter(Boolean).join(' | '),
              start: { dateTime: startDt.toISOString(), timeZone: 'America/Caracas' },
              end: { dateTime: endDt.toISOString(), timeZone: 'America/Caracas' },
              reminders: {
                useDefault: false,
                overrides: [
                  { method: 'popup', minutes: 30 },
                  { method: 'popup', minutes: 10 },
                ],
              },
              guestsCanModify: false,
              guestsCanSeeOtherGuests: false,
              extendedProperties: {
                private: { deltaAppointmentId: appt.id },
              },
            }

            if (finalEmail) {
              event.attendees = [
                { email: finalEmail, displayName: finalName, responseStatus: 'needsAction' },
              ]
            }

            // ALWAYS create Meet link for online appointments
            if (isOnline) {
              event.conferenceData = {
                createRequest: {
                  requestId: `delta-${appt.id}-${Date.now()}`,
                  conferenceSolutionKey: { type: 'hangoutsMeet' },
                },
              }
            }

            const calendarUrl = isOnline
              ? 'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all'
              : 'https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all'

            const gcalRes = await fetch(calendarUrl, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${gcalAccessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(event),
            })

            if (gcalRes.ok) {
              const createdEvent = await gcalRes.json()
              console.log('[Book] GCal event created:', createdEvent.id)

              meetLink = createdEvent.hangoutLink ||
                createdEvent.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === 'video')?.uri ||
                null

              const updateData: Record<string, unknown> = { google_event_id: createdEvent.id }
              if (meetLink) updateData.meet_link = meetLink

              try {
                await admin.from('appointments').update(updateData).eq('id', appt.id)
              } catch {
                console.warn('[Book] Could not save google_event_id/meet_link')
              }
            } else {
              console.error('[Book] GCal create failed:', await gcalRes.text())
            }
          }
        } else {
          console.warn('[Book] Could not refresh Google token')
        }
      }
    } catch (err) {
      console.warn('[Book] Google Calendar sync skipped:', err)
    }

    // Leer el appointment_code generado por el trigger SEQ para devolverlo al cliente
    const { data: createdAppt } = await admin
      .from('appointments')
      .select('appointment_code')
      .eq('id', appt.id)
      .single()

    return NextResponse.json({
      success: true,
      appointmentId: appt.id,
      appointmentCode: createdAppt?.appointment_code || null,
      patientId,
      meetLink,
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

// CR-006 fix: updatePackageUsage() removido.
// La atomicidad ahora la provee la RPC public.book_with_package() vía FOR UPDATE lock.
// Ver queries/archive/005_rpc_book_with_package.sql para la definición.
