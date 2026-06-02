import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth-guards'

// GET /api/admin/doctors — List all doctors with their subscriptions (super_admin only)
//
// 2026-04-29: incluye last_sign_in_at desde auth.users.
// El campo no vive en profiles sino en la tabla gestionada por Supabase Auth,
// por eso hay que llamar admin.auth.admin.listUsers() y hacer merge por id.
export async function GET() {
  try {
    const guard = await requireSuperAdmin()
    if (!guard.ok) return guard.response
    const { admin } = guard

    const { data: doctors, error } = await admin
      .from('profiles')
      .select('id, full_name, email, specialty, is_active, created_at, plan, subscription_status, subscription_expires_at')
      .eq('role', 'doctor')
      .order('created_at', { ascending: false })

    if (error) throw error
    if (!doctors || doctors.length === 0) return NextResponse.json([])

    // Traer last_sign_in_at desde auth.users.
    // listUsers paginates: 50 por defecto, max 1000 → suficiente para Beta.
    let authUsers: { id: string; last_sign_in_at: string | null }[] = []
    try {
      let page = 1
      const perPage = 1000
      while (true) {
        const { data: usersPage, error: authErr } = await admin.auth.admin.listUsers({ page, perPage })
        if (authErr) break
        const users = (usersPage?.users || []).map(u => ({
          id: u.id,
          last_sign_in_at: u.last_sign_in_at ?? null,
        }))
        authUsers = authUsers.concat(users)
        if (users.length < perPage) break
        page++
        if (page > 10) break // hard cap defensivo
      }
    } catch (e) {
      console.warn('[admin/doctors] listUsers failed, last_sign_in_at será null:', e)
    }

    const lastSignInById = new Map(authUsers.map(u => [u.id, u.last_sign_in_at]))
    const enriched = doctors.map(d => ({
      ...d,
      last_sign_in_at: lastSignInById.get(d.id) ?? null,
    }))

    return NextResponse.json(enriched)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
