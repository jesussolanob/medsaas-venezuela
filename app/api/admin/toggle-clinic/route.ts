import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  try {
    const { clinicId, action } = await req.json()

    if (!clinicId || !action) {
      return NextResponse.json({ error: 'Missing clinicId or action' }, { status: 400 })
    }

    // Verify the caller is authenticated and is an admin
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

    // Get the clinic
    const { data: clinic, error: clinicError } = await admin
      .from('clinics')
      .select('is_active')
      .eq('id', clinicId)
      .single()

    if (clinicError || !clinic) {
      return NextResponse.json({ error: 'Clinic not found' }, { status: 404 })
    }

    // Determine new status
    const newStatus = action === 'activate' ? true : false

    // Update the clinic
    const { error: updateError } = await admin
      .from('clinics')
      .update({ is_active: newStatus })
      .eq('id', clinicId)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: `Clinic ${action === 'activate' ? 'activated' : 'suspended'} successfully`,
    })
  } catch (err: any) {
    console.error('Error toggling clinic status:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
