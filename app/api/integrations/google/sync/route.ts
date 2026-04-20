import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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

// POST: Sync a new appointment to Google Calendar
// Supports two modes:
// 1. Cookie-based auth (doctor calling from frontend)
// 2. Server-to-server with doctorId in body (called from /api/book or other internal routes)
export async function POST(req: NextRequest) {
  const admin = createAdminClient()
  const body = await req.json()
  const { summary, description, startTime, endTime, patientName, doctorId: bodyDoctorId } = body

  let targetDoctorId: string | null = null

  if (bodyDoctorId) {
    // Server-to-server mode: trust the doctorId from internal API calls
    targetDoctorId = bodyDoctorId
  } else {
    // Cookie-based auth: doctor calling from frontend
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    targetDoctorId = user.id
  }

  // Get doctor's Google refresh token
  const { data: profile } = await admin
    .from('profiles')
    .select('google_refresh_token, full_name, professional_title')
    .eq('id', targetDoctorId)
    .single()

  if (!profile?.google_refresh_token) {
    return NextResponse.json({ error: 'Google Calendar no conectado' }, { status: 400 })
  }

  const accessToken = await getAccessToken(profile.google_refresh_token)
  if (!accessToken) {
    return NextResponse.json({ error: 'Token de Google expirado. Reconecta Google Calendar en Configuración.' }, { status: 401 })
  }

  if (!startTime || !summary) {
    return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 })
  }

  try {
    const event = {
      summary: summary || `Consulta - ${patientName || 'Paciente'}`,
      description: description || `Consulta médica con ${patientName || 'paciente'}`,
      start: {
        dateTime: startTime,
        timeZone: 'America/Caracas',
      },
      end: {
        dateTime: endTime || new Date(new Date(startTime).getTime() + 30 * 60000).toISOString(),
        timeZone: 'America/Caracas',
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 30 },
          { method: 'popup', minutes: 10 },
        ],
      },
    }

    const gcalRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    })

    if (!gcalRes.ok) {
      const errText = await gcalRes.text()
      console.error('Google Calendar create event error:', errText)
      return NextResponse.json({ error: 'Error al crear evento en Google Calendar' }, { status: 500 })
    }

    const createdEvent = await gcalRes.json()
    return NextResponse.json({ success: true, eventId: createdEvent.id })
  } catch (err: any) {
    console.error('Google Calendar sync error:', err)
    return NextResponse.json({ error: err?.message || 'Error al sincronizar' }, { status: 500 })
  }
}
