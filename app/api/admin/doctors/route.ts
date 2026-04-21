import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth-guards'

// GET /api/admin/doctors — List all doctors with their subscriptions (super_admin only)
export async function GET() {
  try {
    const guard = await requireSuperAdmin()
    if (!guard.ok) return guard.response
    const { admin } = guard

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
