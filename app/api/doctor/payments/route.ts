import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/doctor/payments — List consultation payments for doctor
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const admin = createAdminClient()
  const { searchParams } = new URL(req.url)
  const consultationId = searchParams.get('consultation_id')
  const status = searchParams.get('status')
  const limit = parseInt(searchParams.get('limit') || '50')
  const offset = parseInt(searchParams.get('offset') || '0')

  let query = admin
    .from('consultation_payments')
    .select(`
      *,
      consultations(id, consultation_code, consultation_date),
      patients(id, full_name, phone, email)
    `, { count: 'exact' })
    .eq('doctor_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (consultationId) query = query.eq('consultation_id', consultationId)
  if (status) query = query.eq('status', status)

  const { data, error, count } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [], total: count ?? 0 })
}

// POST /api/doctor/payments — Register payment for consultation
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json()
  const { consultation_id, patient_id, amount, currency, payment_method, reference_number, receipt_url, notes } = body

  if (!consultation_id || !patient_id || !amount || !payment_method) {
    return NextResponse.json({ error: 'Campos requeridos: consultation_id, patient_id, amount, payment_method' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Verify consultation belongs to doctor
  const { data: consultation } = await admin
    .from('consultations')
    .select('id, doctor_id')
    .eq('id', consultation_id)
    .eq('doctor_id', user.id)
    .single()

  if (!consultation) {
    return NextResponse.json({ error: 'Consulta no encontrada' }, { status: 404 })
  }

  const { data, error } = await admin
    .from('consultation_payments')
    .insert({
      consultation_id,
      doctor_id: user.id,
      patient_id,
      amount,
      currency: currency || 'USD',
      payment_method,
      reference_number: reference_number || null,
      receipt_url: receipt_url || null,
      notes: notes || null,
      status: 'pending',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Update consultation payment status to pending_approval
  await admin
    .from('consultations')
    .update({ payment_status: 'pending_approval', amount })
    .eq('id', consultation_id)

  return NextResponse.json({ success: true, payment: data })
}

// PATCH /api/doctor/payments — Approve/reject payment
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json()
  const { id, action, notes } = body

  if (!id || !action) {
    return NextResponse.json({ error: 'id y action requeridos' }, { status: 400 })
  }

  const admin = createAdminClient()

  const updateData: Record<string, unknown> = {
    status: action === 'approve' ? 'approved' : 'rejected',
    updated_at: new Date().toISOString(),
    notes: notes || null,
  }

  if (action === 'approve') {
    updateData.approved_at = new Date().toISOString()
    updateData.approved_by = user.id
  }

  const { data, error } = await admin
    .from('consultation_payments')
    .update(updateData)
    .eq('id', id)
    .eq('doctor_id', user.id)
    .select('*, consultations(id)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Trigger will auto-update consultation.payment_status via DB trigger

  return NextResponse.json({ success: true, payment: data })
}
