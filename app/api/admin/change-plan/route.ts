import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  try {
    const { doctorId, plan } = await req.json()

    if (!doctorId || !plan) {
      return NextResponse.json({ error: 'Missing doctorId or plan' }, { status: 400 })
    }

    const validPlans = ['trial', 'basic', 'professional', 'enterprise', 'clinic']
    if (!validPlans.includes(plan)) {
      return NextResponse.json({ error: 'Plan inválido' }, { status: 400 })
    }

    // Verify caller is admin
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const admin = createAdminClient()
    const { data: callerProfile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!callerProfile || !['super_admin', 'admin'].includes(callerProfile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get existing subscription
    const { data: subscription } = await admin
      .from('subscriptions')
      .select('*')
      .eq('doctor_id', doctorId)
      .maybeSingle()

    const now = new Date()
    const expiresAt = new Date(now)
    expiresAt.setDate(expiresAt.getDate() + 30)

    const isTrial = plan === 'trial'
    const newStatus = isTrial ? 'trial' : 'active'

    if (subscription) {
      // Update existing subscription
      const { error: updateError } = await admin
        .from('subscriptions')
        .update({
          plan,
          status: newStatus,
          current_period_end: expiresAt.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq('id', subscription.id)

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }
    } else {
      // Create new subscription
      const { error: insertError } = await admin
        .from('subscriptions')
        .insert({
          doctor_id: doctorId,
          plan,
          status: newStatus,
          current_period_end: expiresAt.toISOString(),
        })

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 })
      }
    }

    return NextResponse.json({
      success: true,
      doctorId,
      plan,
      status: newStatus,
      message: `Plan cambiado a ${plan} exitosamente`,
    })
  } catch (error: any) {
    console.error('Error changing plan:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
