import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { appointmentId, newDate } = await req.json()
  if (!appointmentId || !newDate) {
    return NextResponse.json({ error: 'appointmentId y newDate requeridos' }, { status: 400 })
  }

  const admin = createAdminClient()

  // 1. Update appointment
  const { data: appt, error: apptErr } = await admin
    .from('appointments')
    .update({ scheduled_at: newDate })
    .eq('id', appointmentId)
    .eq('doctor_id', user.id)
    .select('id, google_event_id, patient_name, plan_name, chief_complaint, appointment_mode, patient_email')
    .single()

  if (apptErr) {
    return NextResponse.json({ error: apptErr.message }, { status: 500 })
  }

  // 2. Update linked consultation date
  try {
    await admin
      .from('consultations')
      .update({ consultation_date: newDate, updated_at: new Date().toISOString() })
      .eq('appointment_id', appointmentId)
      .eq('doctor_id', user.id)
  } catch {
    // appointment_id column may not exist on consultations
  }

  // 3. Update Google Calendar event (if exists)
  if (appt?.google_event_id) {
    try {
      const { data: profile } = await admin
        .from('profiles')
        .select('google_refresh_token')
        .eq('id', user.id)
        .single()

      if (profile?.google_refresh_token) {
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: process.env.GOOGLE_CLIENT_ID || '',
            client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
            refresh_token: profile.google_refresh_token,
            grant_type: 'refresh_token',
          }),
        })

        if (tokenRes.ok) {
          const { access_token } = await tokenRes.json()
          const startDt = new Date(newDate)
          const endDt = new Date(startDt.getTime() + 30 * 60000)

          // Update the existing event — sendUpdates=all notifies both doctor and patient
          const updateRes = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events/${appt.google_event_id}?sendUpdates=all`,
            {
              method: 'PATCH',
              headers: {
                'Authorization': `Bearer ${access_token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                start: { dateTime: startDt.toISOString(), timeZone: 'America/Caracas' },
                end: { dateTime: endDt.toISOString(), timeZone: 'America/Caracas' },
              }),
            }
          )

          if (!updateRes.ok) {
            console.error('[Reschedule] Google Calendar update failed:', await updateRes.text())
          } else {
            console.log('[Reschedule] Google Calendar event updated successfully')
          }
        }
      }
    } catch (err) {
      console.warn('[Reschedule] Google Calendar update skipped:', err)
    }
  }

  return NextResponse.json({ success: true })
}
