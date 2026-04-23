import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  // Aceptamos ambas nomenclaturas por compat
  const body = await req.json()
  const appointmentId = body.appointmentId || body.appointment_id
  const newDate = body.newDate || body.new_scheduled_at
  const reason = body.reason || null

  if (!appointmentId || !newDate) {
    return NextResponse.json({ error: 'appointmentId y newDate requeridos' }, { status: 400 })
  }

  const admin = createAdminClient()

  // 1. RPC nuevo (Opción A): UPDATE old=rescheduled + INSERT new con mismo
  //    consultation_id y payment_id. Devuelve el id de la NUEVA cita.
  const { data: newAppointmentId, error: rpcErr } = await admin.rpc('reschedule_appointment', {
    p_appointment_id: appointmentId,
    p_new_datetime: newDate,
    p_actor_id: user.id,
    p_reason: reason,
  })

  if (rpcErr) {
    const msg = rpcErr.message || ''
    if (msg.includes('SLOT_CONFLICT')) {
      return NextResponse.json({ error: 'Ya hay otra cita en ese horario' }, { status: 409 })
    }
    if (msg.includes('APPOINTMENT_NOT_RESCHEDULABLE')) {
      return NextResponse.json({ error: 'Esta cita ya fue cancelada o atendida' }, { status: 409 })
    }
    if (msg.includes('APPOINTMENT_NOT_FOUND')) {
      return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  // Metadata para Google Calendar — leemos la NUEVA cita (que tiene los datos)
  const { data: appt } = await admin
    .from('appointments')
    .select('id, google_event_id, patient_name, plan_name, chief_complaint, appointment_mode, patient_email, reschedule_of')
    .eq('id', newAppointmentId)
    .single()

  // El google_event_id está en la cita VIEJA (la que se canceló). Lo recuperamos
  // de la fila reschedule_of para actualizar el evento existente en GCal.
  let googleEventId = appt?.google_event_id || null
  if (!googleEventId && appt?.reschedule_of) {
    const { data: oldAppt } = await admin
      .from('appointments')
      .select('google_event_id')
      .eq('id', appt.reschedule_of)
      .single()
    googleEventId = oldAppt?.google_event_id || null
  }
  // Inyectar el google_event_id en la nueva cita para futuras operaciones
  if (googleEventId && !appt?.google_event_id) {
    await admin.from('appointments').update({ google_event_id: googleEventId }).eq('id', newAppointmentId)
  }

  // Nota: la consultation_id es la misma (no cambia al reagendar).
  // No actualizamos consultations.consultation_date porque la consulta se mantiene
  // como entidad estable; la fecha real de atención se setea en started_at cuando ocurre.

  // 3. Update Google Calendar event (si existe — uso googleEventId que abarca ambos casos)
  if (googleEventId) {
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
            `https://www.googleapis.com/calendar/v3/calendars/primary/events/${googleEventId}?sendUpdates=all`,
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

  return NextResponse.json({ success: true, newAppointmentId, googleEventId })
}
