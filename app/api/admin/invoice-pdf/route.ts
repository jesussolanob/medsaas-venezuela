import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generatePdfBuffer } from './pdf-generator'

/**
 * GET /api/admin/invoice-pdf?invoiceId=xxx
 * Generates and returns a professional PDF invoice
 */
export async function GET(req: NextRequest) {
  try {
    const invoiceId = req.nextUrl.searchParams.get('invoiceId')

    if (!invoiceId) {
      return NextResponse.json(
        { error: 'Missing invoiceId query parameter' },
        { status: 400 }
      )
    }

    // Verify authentication
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const admin = createAdminClient()

    // Verify caller is super_admin or admin
    const { data: callerProfile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!callerProfile || !['super_admin', 'admin'].includes(callerProfile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Fetch invoice with doctor info
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
        sent_at,
        paid_at,
        created_at,
        doctor_id,
        profiles:doctor_id(id, full_name, email, specialty)
      `)
      .eq('id', invoiceId)
      .single()

    if (invoiceError || !invoice) {
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 }
      )
    }

    // Normalize profiles (Supabase returns array for joined relations)
    const normalizedInvoice = {
      ...invoice,
      profiles: Array.isArray(invoice.profiles)
        ? invoice.profiles[0]
        : invoice.profiles,
    }

    // Generate PDF
    const pdfBuffer = await generatePdfBuffer(normalizedInvoice as any)

    // Check if download is requested
    const download = req.nextUrl.searchParams.get('download') === 'true'
    const disposition = download
      ? `attachment; filename="factura-${invoice.invoice_number}.pdf"`
      : `inline; filename="factura-${invoice.invoice_number}.pdf"`

    // Return PDF as response
    return new NextResponse(pdfBuffer as any, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': disposition,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    })
  } catch (error: any) {
    console.error('Error generating invoice PDF:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
