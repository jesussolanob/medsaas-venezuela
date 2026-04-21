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

    // Verify the caller is authenticated and is a super_admin
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

    if (!callerProfile || callerProfile.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get the payment record (incluye status para idempotencia)
    const { data: payment, error: paymentError } = await admin
      .from('subscription_payments')
      .select('id, doctor_id, amount, currency, method, status')
      .eq('id', paymentId)
      .single()

    if (paymentError || !payment) {
      return NextResponse.json(
        { error: 'Payment not found' },
        { status: 404 }
      )
    }

    // AL-109: Idempotencia — no reaplicar si ya fue procesado
    if (action === 'approve' && payment.status === 'verified') {
      return NextResponse.json({
        error: 'Este pago ya fue aprobado anteriormente',
        alreadyApplied: true,
        paymentId,
        status: payment.status,
      }, { status: 409 })
    }
    if (action === 'reject' && payment.status === 'rejected') {
      return NextResponse.json({
        error: 'Este pago ya fue rechazado anteriormente',
        alreadyApplied: true,
        paymentId,
        status: payment.status,
      }, { status: 409 })
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

    // If approving, extend the doctor's subscription
    // Check for promotions to determine duration
    if (action === 'approve') {
      // Get current subscription
      const { data: subscription, error: subError } = await admin
        .from('subscriptions')
        .select('id, plan, current_period_end')
        .eq('doctor_id', payment.doctor_id)
        .single()

      if (subError) {
        console.error('Error fetching subscription:', subError)
      } else if (subscription) {
        // Check if there's a matching active promotion for this payment amount
        let extensionDays = 30 // default: 1 month
        const { data: matchingPromo } = await admin
          .from('plan_promotions')
          .select('duration_months, promo_price_usd')
          .eq('is_active', true)
          .eq('promo_price_usd', payment.amount)
          .or('ends_at.is.null,ends_at.gt.' + new Date().toISOString())
          .maybeSingle()

        if (matchingPromo) {
          extensionDays = matchingPromo.duration_months * 30
        }

        // Extend from now or from expiration (whichever is later)
        const expiresAt = subscription.current_period_end ? new Date(subscription.current_period_end) : new Date()
        const now = new Date()
        const startDate = expiresAt > now ? expiresAt : now
        startDate.setDate(startDate.getDate() + extensionDays)

        // Check if this is an admin upgrade request
        const isAdminUpgrade = payment.method === 'admin_upgrade'

        let updatePayload: any = {
          current_period_end: startDate.toISOString(),
          status: 'active',
        }

        // If it's an admin upgrade, también actualiza el plan según plan_configs (AL-110, CR-007)
        if (isAdminUpgrade) {
          // Consulta plan_configs para encontrar el plan que corresponde al monto
          const { data: matchingPlan } = await admin
            .from('plan_configs')
            .select('plan_key, price')
            .eq('price', payment.amount)
            .eq('is_active', true)
            .maybeSingle()

          if (matchingPlan) {
            updatePayload.plan = matchingPlan.plan_key
            updatePayload.price_usd = matchingPlan.price
          } else {
            // Fallback coherente con CLAUDE.md: clinic (no enterprise)
            if (Number(payment.amount) === 30) {
              updatePayload.plan = 'professional'
              updatePayload.price_usd = 30
            } else if (Number(payment.amount) === 100) {
              updatePayload.plan = 'clinic'   // CR-007: clinic, NO enterprise
              updatePayload.price_usd = 100
            } else if (Number(payment.amount) === 10) {
              updatePayload.plan = 'basic'
              updatePayload.price_usd = 10
            } else {
              console.warn('[approve-payment] Monto sin plan mapeado:', payment.amount)
            }
          }
        }

        const { error: extendError } = await admin
          .from('subscriptions')
          .update(updatePayload)
          .eq('id', subscription.id)

        if (extendError) {
          console.error('Error extending subscription:', extendError)
        }

        // Sync clinic subscription_status when approving payment
        const { data: doctorProfile } = await admin
          .from('profiles')
          .select('clinic_id')
          .eq('id', payment.doctor_id)
          .single()

        if (doctorProfile?.clinic_id) {
          const clinicUpdate: Record<string, string> = { subscription_status: 'active' }
          if (isAdminUpgrade && updatePayload.plan) {
            clinicUpdate.subscription_plan = updatePayload.plan
          }
          await admin
            .from('clinics')
            .update(clinicUpdate)
            .eq('id', doctorProfile.clinic_id)
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
