import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/doctor/schedule — Get availability + config for doctor
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const doctorIdParam = searchParams.get('doctor_id') // public access for booking

  const admin = createAdminClient()
  let doctorId = doctorIdParam

  if (!doctorId) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    doctorId = user.id
  }

  // Fetch config
  const { data: config } = await admin
    .from('doctor_schedule_config')
    .select('*')
    .eq('doctor_id', doctorId)
    .maybeSingle()

  // Fetch availability slots
  const { data: slots } = await admin
    .from('doctor_availability')
    .select('*')
    .eq('doctor_id', doctorId)
    .order('day_of_week', { ascending: true })
    .order('start_time', { ascending: true })

  // Fetch blocked dates (next 60 days)
  const today = new Date().toISOString().split('T')[0]
  const future = new Date(Date.now() + 60 * 86400000).toISOString().split('T')[0]
  const { data: blocked } = await admin
    .from('doctor_blocked_slots')
    .select('*')
    .eq('doctor_id', doctorId)
    .gte('blocked_date', today)
    .lte('blocked_date', future)

  return NextResponse.json({
    config: config || { slot_duration: 30, buffer_minutes: 0, advance_booking_days: 30, auto_approve: false },
    slots: slots || [],
    blocked: blocked || [],
  })
}

// POST /api/doctor/schedule — Save availability + config
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json()
  const { config, slots } = body
  const admin = createAdminClient()

  // Upsert config
  if (config) {
    const { error: configErr } = await admin
      .from('doctor_schedule_config')
      .upsert({
        doctor_id: user.id,
        slot_duration: config.slot_duration || 30,
        buffer_minutes: config.buffer_minutes || 0,
        advance_booking_days: config.advance_booking_days || 30,
        auto_approve: config.auto_approve || false,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'doctor_id' })

    if (configErr) return NextResponse.json({ error: configErr.message }, { status: 500 })
  }

  // Replace all availability slots
  if (slots && Array.isArray(slots)) {
    // Delete existing
    await admin.from('doctor_availability').delete().eq('doctor_id', user.id)

    // Insert new (filter enabled only)
    const enabledSlots = slots
      .filter((s: any) => s.is_enabled !== false)
      .map((s: any) => ({
        doctor_id: user.id,
        day_of_week: s.day_of_week,
        start_time: s.start_time,
        end_time: s.end_time,
        is_enabled: true,
      }))

    if (enabledSlots.length > 0) {
      const { error: slotsErr } = await admin.from('doctor_availability').insert(enabledSlots)
      if (slotsErr) return NextResponse.json({ error: slotsErr.message }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true })
}
