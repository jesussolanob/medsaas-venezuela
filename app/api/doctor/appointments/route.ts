import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// DELETE /api/doctor/appointments?id=xxx
// Deletes an appointment AND its linked consultation, cleaning up everywhere.
export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const appointmentId = searchParams.get('id')

  if (!appointmentId) {
    return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  }

  const admin = createAdminClient()

  // 1. Verify the appointment belongs to this doctor
  const { data: appt, error: apptErr } = await admin
    .from('appointments')
    .select('id, doctor_id, google_event_id, package_id, session_number')
    .eq('id', appointmentId)
    .single()

  if (apptErr || !appt) {
    return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 })
  }

  if (appt.doctor_id !== user.id) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  try {
    // 2. Delete linked consultations
    const { data: linkedConsultations } = await admin
      .from('consultations')
      .select('id')
      .eq('appointment_id', appointmentId)

    if (linkedConsultations && linkedConsultations.length > 0) {
      const consultIds = linkedConsultations.map(c => c.id)

      // Delete linked EHR records
      await admin.from('ehr_records').delete().in('consultation_id', consultIds)

      // Delete linked prescriptions
      await admin.from('prescriptions').delete().in('consultation_id', consultIds)

      // Delete the consultations themselves
      await admin.from('consultations').delete().eq('appointment_id', appointmentId)
    }

    // 3. If using a package, decrement used_sessions
    if (appt.package_id) {
      const { data: pkg } = await admin
        .from('patient_packages')
        .select('id, used_sessions, total_sessions, status')
        .eq('id', appt.package_id)
        .single()

      if (pkg) {
        const newUsed = Math.max(0, pkg.used_sessions - 1)
        const updateData: Record<string, unknown> = { used_sessions: newUsed }
        // Reactivate if was completed
        if (pkg.status === 'completed' && newUsed < pkg.total_sessions) {
          updateData.status = 'active'
        }
        await admin.from('patient_packages').update(updateData).eq('id', appt.package_id)
      }
    }

    // 4. Delete the Google Calendar event (best-effort)
    if (appt.google_event_id) {
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
            if (access_token) {
              await fetch(
                `https://www.googleapis.com/calendar/v3/calendars/primary/events/${appt.google_event_id}?sendUpdates=all`,
                {
                  method: 'DELETE',
                  headers: { Authorization: `Bearer ${access_token}` },
                }
              )
            }
          }
        }
      } catch (err) {
        console.warn('[DELETE appt] Google Calendar event delete skipped:', err)
      }
    }

    // 5. Delete the appointment itself
    const { error: deleteErr } = await admin
      .from('appointments')
      .delete()
      .eq('id', appointmentId)

    if (deleteErr) {
      return NextResponse.json({ error: `Error al eliminar: ${deleteErr.message}` }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      deleted: {
        appointment: appointmentId,
        consultations: linkedConsultations?.length || 0,
        googleEvent: !!appt.google_event_id,
      },
    })
  } catch (err: any) {
    console.error('[DELETE appt] Error:', err)
    return NextResponse.json({ error: err?.message || 'Error al eliminar' }, { status: 500 })
  }
}
