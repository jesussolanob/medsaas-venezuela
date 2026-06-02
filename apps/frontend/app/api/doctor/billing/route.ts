import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

function genDocNumber(type: string): string {
  const prefixes: Record<string, string> = {
    factura: 'FAC',
    recibo: 'REC',
    presupuesto: 'PRE',
  }
  const prefix = prefixes[type] || 'DOC'
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `${prefix}-${d}-${rand}`
}

// GET /api/doctor/billing — List billing documents for doctor
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const admin = createAdminClient()
  const { searchParams } = new URL(req.url)
  const docType = searchParams.get('doc_type')
  const limit = parseInt(searchParams.get('limit') || '50')
  const offset = parseInt(searchParams.get('offset') || '0')

  let query = admin
    .from('billing_documents')
    .select(`
      *,
      patients(id, full_name),
      consultations(id, consultation_code)
    `, { count: 'exact' })
    .eq('doctor_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (docType) query = query.eq('doc_type', docType)

  const { data, error, count } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [], total: count ?? 0 })
}

// POST /api/doctor/billing — Create billing document (receipt/estimate/invoice)
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json()
  const {
    doc_type,
    consultation_id,
    payment_id,
    patient_id,
    items,
    subtotal,
    total,
    iva_amount,
    igtf_amount,
    bcv_rate,
    total_bs,
    notes,
    currency,
  } = body

  if (!doc_type || !total) {
    return NextResponse.json({ error: 'doc_type y total requeridos' }, { status: 400 })
  }

  const admin = createAdminClient()
  const docNumber = genDocNumber(doc_type)

  const { data, error } = await admin
    .from('billing_documents')
    .insert({
      doc_number: docNumber,
      doc_type,
      doctor_id: user.id,
      consultation_id: consultation_id || null,
      payment_id: payment_id || null,
      patient_id: patient_id || null,
      items: items || [],
      subtotal: subtotal || total,
      total,
      iva_amount: iva_amount || 0,
      igtf_amount: igtf_amount || 0,
      bcv_rate: bcv_rate || null,
      total_bs: total_bs || null,
      notes: notes || null,
      currency: currency || 'USD',
      status: 'issued',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, document: data, docNumber })
}
