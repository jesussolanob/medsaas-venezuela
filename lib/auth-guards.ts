/**
 * lib/auth-guards.ts
 *
 * Helpers para proteger rutas API por rol. Centralizado para evitar
 * el patrón "auth.getUser pero olvido el rol" (CR-012).
 *
 * Uso típico en una ruta /api/admin/X:
 *
 *   import { requireSuperAdmin } from '@/lib/auth-guards'
 *
 *   export async function GET() {
 *     const guard = await requireSuperAdmin()
 *     if (!guard.ok) return guard.response
 *     const { user, admin } = guard
 *     // ...lógica protegida...
 *   }
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type GuardOk<T> = { ok: true; user: { id: string; email: string | null }; admin: ReturnType<typeof createAdminClient>; profile: T }
type GuardFail = { ok: false; response: NextResponse }
type Guard<T> = GuardOk<T> | GuardFail

export type UserRole = 'super_admin' | 'doctor' | 'assistant' | 'patient'

interface ProfileMin {
  id: string
  role: UserRole
  email: string | null
}

/** Requiere autenticación + rol exacto super_admin. */
export async function requireSuperAdmin(): Promise<Guard<ProfileMin>> {
  return requireRole(['super_admin'])
}

/** Requiere autenticación + uno de los roles permitidos. */
export async function requireRole(allowed: UserRole[]): Promise<Guard<ProfileMin>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }
  }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, role, email')
    .eq('id', user.id)
    .single()

  if (!profile) {
    return { ok: false, response: NextResponse.json({ error: 'Profile no encontrado' }, { status: 403 }) }
  }
  if (!allowed.includes(profile.role as UserRole)) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return {
    ok: true,
    user: { id: user.id, email: user.email ?? null },
    admin,
    profile: profile as ProfileMin,
  }
}

/** Requiere autenticación de cualquier rol. */
export async function requireAuth(): Promise<Guard<ProfileMin>> {
  return requireRole(['super_admin', 'doctor', 'assistant', 'patient'])
}
