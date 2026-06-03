/**
 * app/api/doctor/appointments/route.ts
 *
 * FASE 5 — NOT MIGRATED (complex integrations block thin-proxy pattern).
 *
 * This DELETE handler depends on:
 *   1. Google Calendar event deletion (OAuth2 refresh token flow)
 *   2. Package session restore RPC (restore_package_session)
 *   3. Cascade delete of consultations + EHR + prescriptions
 *
 * None of these are available as a single backend endpoint in Etapa 1.
 * The backend's DELETE /api/appointments/:id only soft-deletes the row.
 * A coordinating endpoint that handles the full cascade + Google Calendar
 * + package restore is a Fase 5 task (integrations module).
 *
 * Until Fase 5 this route stays on Supabase.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';

// DELETE /api/doctor/appointments?id=xxx
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const appointmentId = searchParams.get('id');

  if (!appointmentId) {
    return NextResponse.json({ error: 'id requerido' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: appt, error: apptErr } = await admin
    .from('appointments')
    .select('id, doctor_id, google_event_id, package_id, session_number')
    .eq('id', appointmentId)
    .single();

  if (apptErr || !appt) {
    return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 });
  }

  if (appt.doctor_id !== user.id) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  try {
    const { data: linkedConsultations } = await admin
      .from('consultations')
      .select('id')
      .eq('appointment_id', appointmentId);

    if (linkedConsultations && linkedConsultations.length > 0) {
      const consultIds = linkedConsultations.map((c) => c.id);
      await admin.from('ehr_records').delete().in('consultation_id', consultIds);
      await admin.from('prescriptions').delete().in('consultation_id', consultIds);
      await admin.from('consultations').delete().eq('appointment_id', appointmentId);
    }

    // FASE 5: restore_package_session — keep on Supabase until integrations module
    if (appt.package_id) {
      const { error: rpcErr } = await admin.rpc('restore_package_session', {
        p_appointment_id: appointmentId,
        p_reason: 'appointment_deleted',
      });
      if (rpcErr)
        log.warn('[appointments DELETE] restore_package_session failed', { code: rpcErr.code });
    }

    // FASE 5: Google Calendar deletion — keep on Supabase until integrations module
    if (appt.google_event_id) {
      try {
        const { data: profile } = await admin
          .from('profiles')
          .select('google_refresh_token')
          .eq('id', user.id)
          .single();

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
          });

          if (tokenRes.ok) {
            const { access_token } = await tokenRes.json();
            if (access_token) {
              await fetch(
                `https://www.googleapis.com/calendar/v3/calendars/primary/events/${appt.google_event_id}?sendUpdates=all`,
                {
                  method: 'DELETE',
                  headers: { Authorization: `Bearer ${access_token}` },
                },
              );
            }
          }
        }
      } catch (err) {
        log.warn('[DELETE appt] Google Calendar event delete skipped', { err: String(err) });
      }
    }

    const { error: deleteErr } = await admin.from('appointments').delete().eq('id', appointmentId);

    if (deleteErr) {
      return NextResponse.json(
        { error: `Error al eliminar: ${deleteErr.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      deleted: {
        appointment: appointmentId,
        consultations: linkedConsultations?.length || 0,
        googleEvent: !!appt.google_event_id,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al eliminar';
    log.error('[DELETE appt]', { msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
