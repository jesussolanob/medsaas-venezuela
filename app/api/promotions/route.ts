import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET /api/promotions — Public: list active promotions
export async function GET() {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('plan_promotions')
      .select('id, plan_key, duration_months, original_price_usd, promo_price_usd, label, ends_at')
      .eq('is_active', true)
      .or('ends_at.is.null,ends_at.gt.' + new Date().toISOString())
      .order('plan_key')

    if (error) throw error
    return NextResponse.json(data || [])
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
