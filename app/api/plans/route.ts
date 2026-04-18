import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET /api/plans — Public: list active plan configs with prices
export async function GET() {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('plan_configs')
      .select('plan_key, name, price, trial_days')
      .eq('is_active', true)
      .order('sort_order')

    if (error) throw error
    return NextResponse.json(data || [])
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
