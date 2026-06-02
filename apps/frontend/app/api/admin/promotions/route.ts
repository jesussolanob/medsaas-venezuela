import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET /api/admin/promotions — List all promotions
export async function GET() {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('plan_promotions')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    return NextResponse.json(data || [])
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST /api/admin/promotions — Create a new promotion
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { plan_key, duration_months, original_price_usd, promo_price_usd, label, is_active, ends_at } = body

    if (!plan_key || !duration_months || original_price_usd == null || promo_price_usd == null) {
      return NextResponse.json({ error: 'Faltan campos requeridos: plan_key, duration_months, original_price_usd, promo_price_usd' }, { status: 400 })
    }

    if (Number(promo_price_usd) >= Number(original_price_usd)) {
      return NextResponse.json({ error: 'El precio promocional debe ser menor al original' }, { status: 400 })
    }

    const admin = createAdminClient()
    const insertData = {
      plan_key: String(plan_key),
      duration_months: Number(duration_months),
      original_price_usd: Number(original_price_usd),
      promo_price_usd: Number(promo_price_usd),
      label: label || `Oferta ${duration_months} meses`,
      is_active: is_active ?? true,
      ends_at: ends_at ? new Date(ends_at).toISOString() : null,
    }

    const { data, error } = await admin
      .from('plan_promotions')
      .insert(insertData)
      .select()
      .single()

    if (error) {
      console.error('[API promotions POST] Supabase error:', error)
      return NextResponse.json({ error: error.message, details: error.details, hint: error.hint }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (err: any) {
    console.error('[API promotions POST] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// PUT /api/admin/promotions — Update a promotion
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('plan_promotions')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// DELETE /api/admin/promotions — Delete a promotion
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { error } = await admin
      .from('plan_promotions')
      .delete()
      .eq('id', id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
