import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const admin = createAdminClient()
    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['super_admin', 'admin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { doctorId, amount, currency, description } = await req.json()

    if (!doctorId || !amount) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Generate invoice number: FAC-YYYYMMDD-XXXX
    const now = new Date()
    const dateStr = now.toISOString().split('T')[0].replace(/-/g, '')
    const { count } = await admin
      .from('invoices')
      .select('id', { count: 'exact', head: true })

    const seq = String((count || 0) + 1).padStart(4, '0')
    const invoiceNumber = `FAC-${dateStr}-${seq}`

    const { data: invoice, error } = await admin
      .from('invoices')
      .insert({
        doctor_id: doctorId,
        invoice_number: invoiceNumber,
        amount,
        currency: currency || 'USD',
        description: description || 'Pago de suscripción médica',
        status: 'issued',
        issued_at: now.toISOString(),
        created_by: user.id,
      })
      .select(`
        id,
        invoice_number,
        doctor_id,
        amount,
        currency,
        description,
        status,
        issued_at,
        sent_at,
        paid_at,
        profiles:doctor_id(full_name, email)
      `)
      .single()

    if (error) {
      console.error('Error creating invoice:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const doctorProfile = Array.isArray((invoice as any).profiles) ? (invoice as any).profiles[0] : (invoice as any).profiles

    const transformedInvoice = {
      id: invoice.id,
      invoice_number: invoice.invoice_number,
      doctor_id: invoice.doctor_id,
      doctor_name: doctorProfile?.full_name || 'Unknown',
      doctor_email: doctorProfile?.email || 'unknown@example.com',
      amount: invoice.amount,
      currency: invoice.currency,
      description: invoice.description,
      status: invoice.status,
      issued_at: invoice.issued_at,
      sent_at: invoice.sent_at,
      paid_at: invoice.paid_at,
    }

    return NextResponse.json({ invoice: transformedInvoice })
  } catch (error: any) {
    console.error('Error creating invoice:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
