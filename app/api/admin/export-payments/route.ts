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
    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['super_admin', 'admin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Fetch all payments with doctor info
    const { data: payments, error } = await admin
      .from('subscription_payments')
      .select(`
        id,
        amount,
        currency,
        method,
        reference_number,
        status,
        created_at,
        verified_at,
        rejection_reason,
        profiles:doctor_id(full_name, email)
      `)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const METHOD_LABELS: Record<string, string> = {
      pago_movil: 'Pago Móvil',
      transferencia: 'Transferencia',
      zelle: 'Zelle',
      admin_upgrade: 'Upgrade Admin',
    }

    const STATUS_LABELS: Record<string, string> = {
      pending: 'Pendiente',
      verified: 'Verificado',
      rejected: 'Rechazado',
    }

    const headers = [
      'Médico',
      'Email',
      'Monto',
      'Moneda',
      'Método de Pago',
      'Referencia',
      'Estado',
      'Fecha de Pago',
      'Fecha Verificación',
      'Motivo Rechazo',
    ]

    const rows = (payments || []).map((p: any) => {
      const doctor = Array.isArray(p.profiles) ? p.profiles[0] : p.profiles
      return [
        doctor?.full_name || 'N/A',
        doctor?.email || 'N/A',
        p.amount != null ? p.amount.toFixed(2) : '0.00',
        p.currency || 'USD',
        METHOD_LABELS[p.method] || p.method || 'N/A',
        p.reference_number || 'N/A',
        STATUS_LABELS[p.status] || p.status || 'N/A',
        p.created_at ? new Date(p.created_at).toLocaleDateString('es-VE') : 'N/A',
        p.verified_at ? new Date(p.verified_at).toLocaleDateString('es-VE') : 'N/A',
        p.rejection_reason || '',
      ]
    })

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n')

    const bom = '\uFEFF'
    return new NextResponse(bom + csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="reporte-pagos-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
