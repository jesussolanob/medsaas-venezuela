import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  try {
    const { paymentId, action, notes, method, reference_number } = await req.json()

    if (!paymentId || !['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid paymentId or action' },
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

    // Get the payment record
    const { data: payment, error: paymentError } = await admin
      .from('subscription_payments')
      .select('id, doctor_id, amount, currency, method')
      .eq('id', paymentId)
      .single()

    if (paymentError || !payment) {
      return NextResponse.json(
        { error: 'Payment not found' },
        { status: 404 }
      )
    }

    // Update the payment status
    const newStatus = action === 'approve' ? 'verified' : 'rejected'
    const updateData: any = {
      status: newStatus,
      verified_by: user.id,
      verified_at: new Date().toISOString(),
    }

    if (notes) {
      updateData.rejection_reason = notes
    }

    // Update method and reference if provided (from approval modal)
    if (method) {
      updateData.method = method
    }
    if (reference_number) {
      updateData.reference_number = reference_number
    }

    const { error: updateError } = await admin
      .from('subscription_payments')
      .update(updateData)
      .eq('id', paymentId)

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      )
    }

    // If approving, extend the doctor's subscription by 30 days
    // or change the plan if it's an admin upgrade request
    if (action === 'approve') {
      // Get current subscription
      const { data: subscription, error: subError } = await admin
        .from('subscriptions')
        .select('id, current_period_end')
        .eq('doctor_id', payment.doctor_id)
        .single()

      if (subError) {
        console.error('Error fetching subscription:', subError)
      } else if (subscription) {
        // Extend by 30 days from now or from expiration (whichever is later)
        const expiresAt = subscription.current_period_end ? new Date(subscription.current_period_end) : new Date()
        const now = new Date()
        const startDate = expiresAt > now ? expiresAt : now
        startDate.setDate(startDate.getDate() + 30)

        // Check if this is an admin upgrade request
        const isAdminUpgrade = payment.method === 'admin_upgrade'

        let updatePayload: any = {
          current_period_end: startDate.toISOString(),
          status: 'active',
        }

        // If it's an admin upgrade, also update the plan and price based on payment amount
        if (isAdminUpgrade) {
          // Determine plan based on payment amount
          if (payment.amount === 30) {
            updatePayload.plan = 'professional'
            updatePayload.price_usd = 30
          } else if (payment.amount === 100) {
            updatePayload.plan = 'enterprise'
            updatePayload.price_usd = 100
          } else {
            updatePayload.plan = 'basic'
            updatePayload.price_usd = 20
          }
        }

        const { error: extendError } = await admin
          .from('subscriptions')
          .update(updatePayload)
          .eq('id', subscription.id)

        if (extendError) {
          console.error('Error extending subscription:', extendError)
        }
      }
    }

    return NextResponse.json({
      success: true,
      paymentId,
      action,
      status: newStatus,
    })
  } catch (error: any) {
    console.error('Error approving payment:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
