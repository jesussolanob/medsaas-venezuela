/**
 * POST /api/doctor/subscription/checkout
 * Form-data:
 *   - duration_months: number
 *   - method: 'pago_movil'|'transferencia'|'zelle'
 *   - reference_number: string
 *   - amount_usd: number
 *   - notes?: string
 *   - receipt: File (imagen o PDF)
 *
 * Crea un subscription_payments con status='pending' + sube el comprobante a Storage.
 * El admin debe aprobar para que la suscripción se extienda.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-guards'

export async function POST(req: NextRequest) {
  const guard = await requireRole(['doctor'])
  if (!guard.ok) return guard.response
  const { admin, user } = guard

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Form data inválido' }, { status: 400 })
  }

  const duration_months = Number(formData.get('duration_months')) || 1
  const method = String(formData.get('method') || '')
  const reference_number = String(formData.get('reference_number') || '').trim()
  const amount_usd = Number(formData.get('amount_usd'))
  const amount_bs_raw = formData.get('amount_bs')
  const amount_bs = amount_bs_raw ? Number(amount_bs_raw) : null
  const bcv_rate_raw = formData.get('bcv_rate_used')
  const bcv_rate_used = bcv_rate_raw ? Number(bcv_rate_raw) : null
  const notes = String(formData.get('notes') || '').trim()
  const promotion_id = formData.get('promotion_id') ? String(formData.get('promotion_id')) : null
  const receipt = formData.get('receipt') as File | null

  if (!['pago_movil', 'transferencia', 'zelle'].includes(method)) {
    return NextResponse.json({ error: 'Método de pago inválido' }, { status: 400 })
  }
  if (!amount_usd || amount_usd < 1) {
    return NextResponse.json({ error: 'Monto inválido' }, { status: 400 })
  }
  if (!reference_number) {
    return NextResponse.json({ error: 'Referencia/nro de comprobante requerido' }, { status: 400 })
  }
  if (duration_months < 1 || duration_months > 36) {
    return NextResponse.json({ error: 'Duración debe estar entre 1 y 36 meses' }, { status: 400 })
  }

  // Subir comprobante (opcional pero recomendado)
  let receipt_url: string | null = null
  if (receipt && typeof receipt === 'object' && 'arrayBuffer' in receipt) {
    if (receipt.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'Comprobante > 5 MB' }, { status: 400 })
    }
    const ext = (receipt.name?.split('.').pop() || 'bin').toLowerCase()
    if (!['jpg', 'jpeg', 'png', 'pdf', 'webp', 'heic'].includes(ext)) {
      return NextResponse.json({ error: 'Formato no soportado (jpg/png/pdf/webp)' }, { status: 400 })
    }
    const path = `${user.id}/${Date.now()}.${ext}`
    const buf = Buffer.from(await receipt.arrayBuffer())
    const { error: upErr } = await admin.storage
      .from('payment-receipts')
      .upload(path, buf, { contentType: receipt.type || `application/${ext}`, upsert: false })
    if (upErr) {
      console.error('[subscription/checkout] upload error:', upErr)
      return NextResponse.json({ error: 'Error subiendo comprobante' }, { status: 500 })
    }
    receipt_url = path
  }

  const { data, error } = await admin
    .from('subscription_payments')
    .insert({
      doctor_id: user.id,
      amount_usd,
      amount_bs: amount_bs && amount_bs > 0 ? amount_bs : null,
      bcv_rate_used: bcv_rate_used && bcv_rate_used > 0 ? bcv_rate_used : null,
      duration_months,
      method,
      reference_number,
      receipt_url,
      promotion_id,
      notes: notes || null,
      status: 'pending',
    })
    .select()
    .single()

  if (error) {
    console.error('[subscription/checkout] insert error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, payment: data })
}
