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

    // Fetch all subscriptions with doctor info
    const { data: subscriptions, error } = await admin
      .from('subscriptions')
      .select(`
        id,
        plan,
        status,
        price_usd,
        current_period_start,
        current_period_end,
        created_at,
        profiles:doctor_id(full_name, email, specialty)
      `)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Build CSV
    const headers = [
      'Médico/Clínica',
      'Email',
      'Especialidad',
      'Plan',
      'Estado',
      'Precio USD',
      'Fecha Inicio',
      'Fecha Fin',
      'Fecha Creación',
    ]

    const rows = (subscriptions || []).map((sub: any) => {
      const doctor = Array.isArray(sub.profiles) ? sub.profiles[0] : sub.profiles
      return [
        doctor?.full_name || 'N/A',
        doctor?.email || 'N/A',
        doctor?.specialty || 'N/A',
        sub.plan || 'N/A',
        sub.status || 'N/A',
        sub.price_usd != null ? `$${sub.price_usd}` : 'N/A',
        sub.current_period_start ? new Date(sub.current_period_start).toLocaleDateString('es-VE') : 'N/A',
        sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString('es-VE') : 'N/A',
        sub.created_at ? new Date(sub.created_at).toLocaleDateString('es-VE') : 'N/A',
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
        'Content-Disposition': `attachment; filename="suscripciones-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
