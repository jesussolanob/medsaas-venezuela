import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

  const { data: planFeatures, error } = await admin
    .from('plan_features')
    .select('*')
    .order('plan')
    .order('feature_key')

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch plan features' }, { status: 500 })
  }

  const groupedByPlan = (planFeatures || []).reduce(
    (acc: Record<string, any[]>, feature: any) => {
      if (!acc[feature.plan]) {
        acc[feature.plan] = []
      }
      acc[feature.plan].push(feature)
      return acc
    },
    {} as Record<string, any[]>
  )

  return NextResponse.json({ data: planFeatures, grouped: groupedByPlan })
}

export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

  const body = await request.json()
  const { plan, feature_key, enabled } = body

  if (!plan || !feature_key || typeof enabled !== 'boolean') {
    return NextResponse.json(
      { error: 'Missing or invalid parameters: plan, feature_key, enabled' },
      { status: 400 }
    )
  }

  const { data, error } = await admin
    .from('plan_features')
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq('plan', plan)
    .eq('feature_key', feature_key)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: 'Failed to update plan feature' }, { status: 500 })
  }

  return NextResponse.json({ message: 'Plan feature updated successfully', data })
}
