import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  try {
    const { doctorId, action } = await req.json()

    if (!doctorId || !action) {
      return NextResponse.json(
        { error: 'Missing doctorId or action' },
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

    // Update is_active + subscription_status en profiles (un solo UPDATE)
    const isActive = action === 'activate'
    const subscriptionStatus = isActive ? 'active' : 'suspended'
    const { error: profileError } = await admin
      .from('profiles')
      .update({
        is_active: isActive,
        subscription_status: subscriptionStatus,
      })
      .eq('id', doctorId)

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      doctorId,
      action,
      is_active: isActive,
    })
  } catch (error: any) {
    console.error('Error toggling doctor status:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
