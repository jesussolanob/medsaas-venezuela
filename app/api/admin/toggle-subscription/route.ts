import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  try {
    const { subscriptionId, action } = await req.json()

    if (!subscriptionId || !action) {
      return NextResponse.json(
        { error: 'Missing subscriptionId or action' },
        { status: 400 }
      )
    }

    if (!['suspend', 'activate'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Must be suspend or activate' },
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

    // Update subscription status
    const newStatus = action === 'activate' ? 'active' : 'suspended'
    const { error: updateError } = await admin
      .from('subscriptions')
      .update({ status: newStatus })
      .eq('id', subscriptionId)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      subscriptionId,
      action,
      status: newStatus,
    })
  } catch (error: any) {
    console.error('Error toggling subscription status:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
