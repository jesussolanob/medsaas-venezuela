import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const admin = createAdminClient()
    const { data: callerProfile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!callerProfile || !['super_admin', 'admin'].includes(callerProfile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Fetch all invoices with doctor info
    const { data: invoices, error } = await admin
      .from('invoices')
      .select(`
        id,
        invoice_number,
        amount,
        currency,
        description,
        status,
        issued_at,
        sent_at,
        paid_at,
        created_at,
        doctor_id,
        profiles:doctor_id(id, full_name, email, specialty)
      `)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ invoices: invoices || [] })
  } catch (error: any) {
    console.error('Error fetching invoices:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const { doctorId, amount, currency, description, subscriptionId } = await req.json()

    if (!doctorId || !amount || amount <= 0) {
      return NextResponse.json(
        { error: 'Invalid doctorId or amount' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const admin = createAdminClient()
    const { data: callerProfile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!callerProfile || !['super_admin', 'admin'].includes(callerProfile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Verify doctor exists
    const { data: doctor, error: doctorError } = await admin
      .from('profiles')
      .select('id, full_name, email')
      .eq('id', doctorId)
      .single()

    if (doctorError || !doctor) {
      return NextResponse.json(
        { error: 'Doctor not found' },
        { status: 404 }
      )
    }

    // Generate sequential invoice number: INV-YYYYMMDD-XXXX
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const dateStr = `${year}${month}${day}`

    // Get the count of invoices created today to generate sequential suffix
    const { data: todaysInvoices, error: countError } = await admin
      .from('invoices')
      .select('id', { count: 'exact' })
      .like('invoice_number', `INV-${dateStr}-%`)

    const sequenceNum = ((todaysInvoices?.length || 0) + 1).toString().padStart(4, '0')
    const invoiceNumber = `INV-${dateStr}-${sequenceNum}`

    // Create the invoice
    const { data: invoice, error: insertError } = await admin
      .from('invoices')
      .insert({
        doctor_id: doctorId,
        subscription_id: subscriptionId || null,
        invoice_number: invoiceNumber,
        amount: parseFloat(amount),
        currency: currency || 'USD',
        description: description || null,
        status: 'issued',
        created_by: user.id,
      })
      .select()
      .single()

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      invoice: {
        ...invoice,
        doctor_name: doctor.full_name,
        doctor_email: doctor.email,
      },
    })
  } catch (error: any) {
    console.error('Error creating invoice:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
