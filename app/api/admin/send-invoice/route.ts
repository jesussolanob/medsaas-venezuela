import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  try {
    const { invoiceId } = await req.json()

    if (!invoiceId) {
      return NextResponse.json(
        { error: 'Invalid invoiceId' },
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

    // Fetch the invoice with doctor info
    const { data: invoice, error: invoiceError } = await admin
      .from('invoices')
      .select(`
        id,
        invoice_number,
        amount,
        currency,
        description,
        status,
        issued_at,
        doctor_id,
        profiles:doctor_id(id, full_name, email)
      `)
      .eq('id', invoiceId)
      .single()

    if (invoiceError || !invoice) {
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 }
      )
    }

    // Update the invoice to mark it as sent
    const { error: updateError } = await admin
      .from('invoices')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
      })
      .eq('id', invoiceId)

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      )
    }

    // TODO: In a real scenario, you would send the email here using Resend, SendGrid, or similar
    // Example pseudo-code:
    // await sendInvoiceEmail({
    //   to: invoice.profiles.email,
    //   doctorName: invoice.profiles.full_name,
    //   invoiceNumber: invoice.invoice_number,
    //   amount: invoice.amount,
    //   currency: invoice.currency,
    //   description: invoice.description,
    //   issuedAt: invoice.issued_at,
    // })

    return NextResponse.json({
      success: true,
      message: `Factura ${invoice.invoice_number} enviada exitosamente`,
      invoice: {
        id: invoice.id,
        invoice_number: invoice.invoice_number,
        status: 'sent',
        sent_at: new Date().toISOString(),
      },
    })
  } catch (error: any) {
    console.error('Error sending invoice:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
