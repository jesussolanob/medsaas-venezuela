import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  try {
    const { doctorId, plan } = await req.json()

    if (!doctorId || !plan) {
      return NextResponse.json(
        { error: 'Missing doctorId or plan' },
        { status: 400 }
      )
    }

    if (!['free', 'pro'].includes(plan)) {
      return NextResponse.json(
        { error: 'Invalid plan. Must be free or pro' },
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

    // Get the doctor's subscription
    const { data: subscription } = await admin
      .from('subscriptions')
      .select('*')
      .eq('doctor_id', doctorId)
      .maybeSingle()

    // If no subscription exists, create one first
    let subscriptionId = subscription?.id
    if (!subscription) {
      const now = new Date()
      const expiresAt = new Date(now)
      expiresAt.setDate(expiresAt.getDate() + 30)

      const { data: newSub, error: newSubErr } = await admin
        .from('subscriptions')
        .insert({
          doctor_id: doctorId,
          plan: 'free',
          status: 'trial',
          started_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
        })
        .select('id')
        .single()

      if (newSubErr) {
        return NextResponse.json(
          { error: 'Error creating subscription: ' + newSubErr.message },
          { status: 500 }
        )
      }
      subscriptionId = newSub.id
    }

    // Create a pending approval request in subscription_payments
    // Instead of directly changing the plan
    const { error: insertError } = await admin
      .from('subscription_payments')
      .insert({
        doctor_id: doctorId,
        amount: plan === 'pro' ? 20 : 0,
        currency: 'USD',
        payment_method: 'admin_upgrade',
        reference_number: `UPGRADE-${Date.now()}`,
        status: 'pending',
        notes: `Solicitud de cambio a plan ${plan.toUpperCase()} por admin`,
      })

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      doctorId,
      plan,
      message: 'Solicitud de cambio enviada a aprobaciones',
    })
  } catch (error: any) {
    console.error('Error changing plan:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
