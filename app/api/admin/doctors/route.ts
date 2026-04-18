import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET /api/admin/doctors — List all doctors with their subscriptions (admin only)
export async function GET() {
  try {
    // Verify caller is admin
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const admin = createAdminClient()

    // Use admin client to bypass RLS and get accurate subscription data
    const { data: doctors, error } = await admin
      .from('profiles')
      .select('id, full_name, email, specialty, is_active, created_at, subscriptions(plan, status)')
      .eq('role', 'doctor')
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json(doctors || [])
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
