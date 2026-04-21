import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth-guards'

// GET /api/admin/admins — lista super_admins
export async function GET() {
  const guard = await requireSuperAdmin()
  if (!guard.ok) return guard.response
  const { admin } = guard

  const { data, error } = await admin
    .from('profiles')
    .select('id, email, full_name, phone, created_at')
    .eq('role', 'super_admin')
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data || [] })
}

// POST /api/admin/admins — crea un nuevo super_admin
export async function POST(req: NextRequest) {
  const guard = await requireSuperAdmin()
  if (!guard.ok) return guard.response
  const { admin } = guard

  const body = await req.json()
  const { email, password, full_name, phone } = body

  if (!email || !password || !full_name) {
    return NextResponse.json(
      { error: 'email, password y full_name son requeridos' },
      { status: 400 }
    )
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: 'El password debe tener al menos 8 caracteres' },
      { status: 400 }
    )
  }

  // Crear auth user
  const { data: authData, error: authErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name, role: 'super_admin' },
  })
  if (authErr) {
    return NextResponse.json({ error: authErr.message }, { status: 400 })
  }

  const userId = authData.user.id

  // Upsert profile con role=super_admin
  const { error: pErr } = await admin.from('profiles').upsert({
    id: userId,
    email,
    full_name,
    phone: phone || null,
    role: 'super_admin',
  }, { onConflict: 'id' })

  if (pErr) {
    // Rollback auth user si el profile falla
    await admin.auth.admin.deleteUser(userId).catch(() => {})
    return NextResponse.json({ error: pErr.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, id: userId, email, full_name })
}

// DELETE /api/admin/admins?id=<uuid> — revoca un super_admin (degrada a doctor)
// No se borra el usuario; solo se cambia su rol.
export async function DELETE(req: NextRequest) {
  const guard = await requireSuperAdmin()
  if (!guard.ok) return guard.response
  const { admin, user } = guard

  const { searchParams } = new URL(req.url)
  const targetId = searchParams.get('id')
  if (!targetId) {
    return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  }
  if (targetId === user.id) {
    return NextResponse.json(
      { error: 'No puedes revocar tu propio acceso de super_admin' },
      { status: 400 }
    )
  }

  // Verificar que queda al menos otro super_admin después
  const { count } = await admin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'super_admin')
  if ((count || 0) <= 1) {
    return NextResponse.json(
      { error: 'Debe quedar al menos un super_admin' },
      { status: 400 }
    )
  }

  const { error } = await admin
    .from('profiles')
    .update({ role: 'doctor' })
    .eq('id', targetId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
