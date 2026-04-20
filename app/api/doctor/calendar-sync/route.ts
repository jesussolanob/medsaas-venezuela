import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// ── Helper: exchange refresh token → access token ─────────────────────────
async function getAccessToken(refreshToken: string): Promise<string | null> {
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.access_token || null
  } catch {
    return null
  }
}

// ── Helper: create GCal event with optional Meet ─────────────────────────
async function createGCalEvent(
  accessToken: string,
  opts: {
    summary: string
    description: string
    startTime: string
    endTime: string
    patientEmail?: string | null
    patientName?: string | null
    withMeet: boolean
    appointmentId: string
  }
) {
  const event: Record<string, unknown> = {
    summary: opts.summary,
    description: opts.description,
    start: { dateTime: opts.startTime, timeZone: 'America/Caracas' },
    end: { dateTime: opts.endTime, timeZone: 'America/Caracas' },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 30 },
        { method: 'popup', minutes: 10 },
      ],
    },
    guestsCanModify: false,
    guestsCanSeeOtherGuests: false,
    // Tag with appointment ID so we can match later
    extendedProperties: {
      private: { deltaAppointmentId: opts.appointmentId },
    },
  }

  if (opts.patientEmail) {
    event.attendees = [
      { email: opts.patientEmail, displayName: opts.patientName || 'Paciente', responseStatus: 'needsAction' },
    ]
  }

  if (opts.withMeet) {
    event.conferenceData = {
      createRequest: {
        requestId: `delta-${opts.appointmentId}-${Date.now()}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    }
  }

  const url = opts.withMeet
    ? 'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all'
    : 'https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all'

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('[CalSync] GCal create failed:', err)
    return null
  }

  return await res.json()
}

// ── POST: Full bidirectional sync ────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const admin = createAdminClient()
    const doctorId = user.id

    // Get doctor profile with Google token
    const { data: profile } = await admin
      .from('profiles')
      .select('google_refresh_token, full_name, professional_title, specialty')
      .eq('id', doctorId)
      .single()

    if (!profile?.google_refresh_token) {
      return NextResponse.json(
        { error: 'Google Calendar no conectado. Ve a Configuración para conectarlo.' },
        { status: 400 }
      )
    }

    const accessToken = await getAccessToken(profile.google_refresh_token)
    if (!accessToken) {
      return NextResponse.json(
        { error: 'Token de Google expirado. Reconecta Google Calendar en Configuración.' },
        { status: 401 }
      )
    }

    const stats = { pushed: 0, pulled: 0, meetLinksCreated: 0, errors: 0 }

    // ════════════════════════════════════════════════════════════════════════
    // PHASE 1 — PUSH: Local appointments/consultations → Google Calendar
    // ════════════════════════════════════════════════════════════════════════

    // Get future confirmed appointments that DON'T have a google_event_id
    const now = new Date().toISOString()

    const { data: unsyncedAppts } = await admin
      .from('appointments')
      .select('id, scheduled_at, patient_name, patient_email, chief_complaint, plan_name, plan_price, appointment_mode, google_event_id, meet_link')
      .eq('doctor_id', doctorId)
      .in('status', ['scheduled', 'confirmed'])
      .gte('scheduled_at', now)
      .is('google_event_id', null)

    // Also get appointments WITH google_event_id but WITHOUT meet_link (to add Meet)
    const { data: noMeetAppts } = await admin
      .from('appointments')
      .select('id, scheduled_at, patient_name, patient_email, chief_complaint, plan_name, appointment_mode, google_event_id, meet_link')
      .eq('doctor_id', doctorId)
      .in('status', ['scheduled', 'confirmed'])
      .gte('scheduled_at', now)
      .not('google_event_id', 'is', null)
      .is('meet_link', null)

    // Push unsynced appointments
    for (const appt of unsyncedAppts || []) {
      try {
        const startDt = new Date(appt.scheduled_at)
        const endDt = new Date(startDt.getTime() + 30 * 60000)
        const isOnline = appt.appointment_mode === 'online'

        const created = await createGCalEvent(accessToken, {
          summary: `Consulta - ${appt.patient_name || 'Paciente'}`,
          description: [
            `Plan: ${appt.plan_name || 'Consulta General'}`,
            appt.chief_complaint ? `Motivo: ${appt.chief_complaint}` : null,
            isOnline ? '📹 Consulta Online' : '🏥 Presencial',
          ].filter(Boolean).join(' | '),
          startTime: startDt.toISOString(),
          endTime: endDt.toISOString(),
          patientEmail: appt.patient_email,
          patientName: appt.patient_name,
          withMeet: isOnline,
          appointmentId: appt.id,
        })

        if (created) {
          const meetLink = created.hangoutLink ||
            created.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === 'video')?.uri

          const updateData: Record<string, unknown> = { google_event_id: created.id }
          if (meetLink) updateData.meet_link = meetLink

          await admin.from('appointments').update(updateData).eq('id', appt.id)
          stats.pushed++
          if (meetLink) stats.meetLinksCreated++
        }
      } catch (err) {
        console.error('[CalSync] Push error for', appt.id, err)
        stats.errors++
      }
    }

    // Add Meet to events that don't have it yet (if online)
    for (const appt of noMeetAppts || []) {
      if (appt.appointment_mode !== 'online') continue
      try {
        // Patch existing event to add conference
        const patchRes = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${appt.google_event_id}?conferenceDataVersion=1`,
          {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              conferenceData: {
                createRequest: {
                  requestId: `delta-meet-${appt.id}-${Date.now()}`,
                  conferenceSolutionKey: { type: 'hangoutsMeet' },
                },
              },
            }),
          }
        )

        if (patchRes.ok) {
          const updated = await patchRes.json()
          const meetLink = updated.hangoutLink ||
            updated.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === 'video')?.uri
          if (meetLink) {
            await admin.from('appointments').update({ meet_link: meetLink }).eq('id', appt.id)
            stats.meetLinksCreated++
          }
        }
      } catch (err) {
        console.error('[CalSync] Meet patch error for', appt.id, err)
        stats.errors++
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // PHASE 2 — PULL: Google Calendar → Local appointments
    // ════════════════════════════════════════════════════════════════════════

    // Fetch future events from GCal (next 60 days)
    const timeMin = new Date().toISOString()
    const futureEnd = new Date()
    futureEnd.setDate(futureEnd.getDate() + 60)
    const timeMax = futureEnd.toISOString()

    const listUrl = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
    listUrl.searchParams.set('timeMin', timeMin)
    listUrl.searchParams.set('timeMax', timeMax)
    listUrl.searchParams.set('singleEvents', 'true')
    listUrl.searchParams.set('orderBy', 'startTime')
    listUrl.searchParams.set('maxResults', '250')

    const listRes = await fetch(listUrl.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (listRes.ok) {
      const listData = await listRes.json()
      const gcalEvents = listData.items || []

      // Get all existing google_event_ids to know what's already linked
      const { data: existingLinked } = await admin
        .from('appointments')
        .select('google_event_id')
        .eq('doctor_id', doctorId)
        .not('google_event_id', 'is', null)

      const linkedIds = new Set((existingLinked || []).map((a: any) => a.google_event_id))

      // Also get all existing appointments in the time range to match by time
      const { data: existingAppts } = await admin
        .from('appointments')
        .select('id, scheduled_at, patient_name, google_event_id')
        .eq('doctor_id', doctorId)
        .in('status', ['scheduled', 'confirmed'])
        .gte('scheduled_at', timeMin)
        .lte('scheduled_at', timeMax)

      const existingTimes = new Map(
        (existingAppts || []).map((a: any) => [new Date(a.scheduled_at).getTime(), a])
      )

      for (const ev of gcalEvents) {
        // Skip already-linked events
        if (linkedIds.has(ev.id)) continue

        // Skip events created by Delta (tagged with extendedProperties)
        if (ev.extendedProperties?.private?.deltaAppointmentId) continue

        // Skip all-day events
        if (!ev.start?.dateTime) continue

        // Skip cancelled events
        if (ev.status === 'cancelled') continue

        const eventStart = new Date(ev.start.dateTime)
        const eventStartMs = eventStart.getTime()

        // Check if we already have an appointment at this exact time
        if (existingTimes.has(eventStartMs)) {
          // Link the existing appointment to this GCal event
          const existing = existingTimes.get(eventStartMs)
          if (existing && !existing.google_event_id) {
            const meetLink = ev.hangoutLink ||
              ev.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === 'video')?.uri
            await admin.from('appointments').update({
              google_event_id: ev.id,
              ...(meetLink ? { meet_link: meetLink } : {}),
            }).eq('id', existing.id)
          }
          continue
        }

        // This is a NEW event from Google Calendar — import it as an appointment
        try {
          const endTime = ev.end?.dateTime ? new Date(ev.end.dateTime) : new Date(eventStart.getTime() + 30 * 60000)
          const meetLink = ev.hangoutLink ||
            ev.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === 'video')?.uri

          // Extract patient name from summary
          let patientName = 'Evento externo'
          const summary = ev.summary || ''
          if (summary.toLowerCase().startsWith('consulta -')) {
            patientName = summary.replace(/^consulta\s*-\s*/i, '').trim() || patientName
          } else {
            patientName = summary || patientName
          }

          // Get attendee email if available
          const attendeeEmail = ev.attendees?.find((a: any) => !a.self)?.email || null

          const { error: insertErr } = await admin
            .from('appointments')
            .insert({
              doctor_id: doctorId,
              patient_name: patientName,
              patient_email: attendeeEmail,
              scheduled_at: eventStart.toISOString(),
              status: 'confirmed',
              source: 'google_calendar',
              plan_name: 'Evento externo',
              plan_price: 0,
              appointment_mode: meetLink ? 'online' : 'presencial',
              google_event_id: ev.id,
              meet_link: meetLink || null,
              chief_complaint: ev.description?.substring(0, 500) || null,
            })

          if (!insertErr) {
            stats.pulled++
          } else {
            console.warn('[CalSync] Pull insert error:', insertErr.message)
            stats.errors++
          }
        } catch (err) {
          console.error('[CalSync] Pull error for event', ev.id, err)
          stats.errors++
        }
      }
    } else {
      console.error('[CalSync] GCal list failed:', await listRes.text())
      stats.errors++
    }

    return NextResponse.json({
      success: true,
      stats,
      message: `Sync completado: ${stats.pushed} subidas, ${stats.pulled} importadas, ${stats.meetLinksCreated} Meet links creados${stats.errors > 0 ? `, ${stats.errors} errores` : ''}`,
    })
  } catch (err: any) {
    console.error('[CalSync] Unexpected error:', err)
    return NextResponse.json({ error: err?.message || 'Error en sync' }, { status: 500 })
  }
}
