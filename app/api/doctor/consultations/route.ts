import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

function genCode(prefix: string): string {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `${prefix}-${d}-${rand}`
}

// GET /api/doctor/consultations — List consultations for logged-in doctor
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const admin = createAdminClient()
  const { searchParams } = new URL(req.url)
  const patientId = searchParams.get('patient_id')
  const status = searchParams.get('status')
  const limit = parseInt(searchParams.get('limit') || '50')
  const offset = parseInt(searchParams.get('offset') || '0')

  let query = admin
    .from('consultations')
    .select(`
      *,
      patients(id, full_name, phone, email),
      appointments(id, appointment_code, scheduled_at, plan_name, plan_price)
    `, { count: 'exact' })
    .eq('doctor_id', user.id)
    .order('consultation_date', { ascending: false })
    .range(offset, offset + limit - 1)

  if (patientId) query = query.eq('patient_id', patientId)
  if (status) query = query.eq('payment_status', status)

  const { data, error, count } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data: data ?? [], total: count ?? 0 })
}

// POST /api/doctor/consultations — Create consultation (optionally linked to appointment)
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json()
  const { patient_id, appointment_id, chief_complaint, notes, consultation_date, amount, currency, plan_name, payment_method, payment_reference } = body

  if (!patient_id) {
    return NextResponse.json({ error: 'patient_id requerido' }, { status: 400 })
  }

  const admin = createAdminClient()
  const consultationCode = genCode('CON')

  const insertData: Record<string, unknown> = {
    consultation_code: consultationCode,
    patient_id,
    doctor_id: user.id,
    chief_complaint: chief_complaint || null,
    notes: notes || null,
    consultation_date: consultation_date || new Date().toISOString(),
    payment_status: amount > 0 ? 'pending_approval' : 'unpaid',
    amount: amount || 0,
    currency: currency || 'USD',
    plan_name: plan_name || null,
    payment_method: payment_method || null,
    payment_reference: payment_reference || null,
  }

  if (appointment_id) {
    insertData.appointment_id = appointment_id
  }

  const { data, error } = await admin
    .from('consultations')
    .insert(insertData)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // If linked to appointment, update appointment status
  if (appointment_id) {
    await admin.from('appointments').update({ status: 'confirmed' }).eq('id', appointment_id)
  }

  return NextResponse.json({ success: true, consultation: data, code: consultationCode })
}

// PATCH /api/doctor/consultations — Update consultation
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json()
  const { id, ...fields } = body

  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('consultations')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('doctor_id', user.id) // security: only own consultations
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, consultation: data })
}
