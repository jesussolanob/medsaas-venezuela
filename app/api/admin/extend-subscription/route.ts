import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  try {
    const { subscriptionId, days = 30, newPlan, activate, suspend } = await req.json()

    if (!subscriptionId || typeof days !== 'number') {
      return NextResponse.json(
        { error: 'Invalid subscriptionId or days' },
        { status: 400 }
      )
    }

    // Verify the caller is authenticated and is a super_admin or admin
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

    // Get the subscription record
    const { data: subscription, error: subError } = await admin
      .from('subscriptions')
      .select('id, current_period_end, doctor_id')
      .eq('id', subscriptionId)
      .single()

    if (subError || !subscription) {
      return NextResponse.json(
        { error: 'Subscription not found' },
        { status: 404 }
      )
    }

    // Calculate new expiration date (from current expiration, or from now if already expired)
    const expiresAt = subscription.current_period_end ? new Date(subscription.current_period_end) : new Date()
    const now = new Date()
    const startDate = expiresAt > now ? expiresAt : now
    startDate.setDate(startDate.getDate() + days)

    // Update subscription
    const updateData: any = {
      current_period_end: startDate.toISOString(),
      status: suspend ? 'suspended' : 'active',
    }

    if (newPlan) {
      updateData.plan = newPlan
    }

    const { error: updateError } = await admin
      .from('subscriptions')
      .update(updateData)
      .eq('id', subscriptionId)

    if (updateError) {
      console.error('Update error:', updateError)
      return NextResponse.json(
        { error: updateError.message || 'Error updating subscription' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      subscriptionId,
      current_period_end: startDate.toISOString(),
      plan: newPlan || undefined,
    })
  } catch (error: any) {
    console.error('Extend subscription error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
