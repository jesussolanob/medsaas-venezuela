import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, requireRole } from '@/lib/auth-guards'

// GET /api/admin/packages — lista todas las plantillas de paquetes
export async function GET() {
  // Admin O doctor (doctor ve solo las suyas)
  const guard = await requireRole(['super_admin', 'doctor'])
  if (!guard.ok) return guard.response
  const { admin, profile } = guard

  let query = admin.from('package_templates').select(`
    id, name, description, sessions_count, price_usd, specialty,
    doctor_id, is_active, created_at,
    doctor:doctor_id(full_name, email, specialty)
  `).order('created_at', { ascending: false })

  // Si no es super_admin, filtrar por sus propios templates + templates genéricos
  if (profile.role !== 'super_admin') {
    query = query.or(`doctor_id.eq.${profile.id},doctor_id.is.null`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data || [] })
}

// POST /api/admin/packages — crea una plantilla de paquete
export async function POST(req: NextRequest) {
  const guard = await requireRole(['super_admin', 'doctor'])
  if (!guard.ok) return guard.response
  const { admin, profile } = guard

  const body = await req.json()
  const { name, description, sessions_count, price_usd, specialty, doctor_id } = body

  if (!name || !sessions_count || price_usd === undefined) {
    return NextResponse.json(
      { error: 'name, sessions_count y price_usd son requeridos' },
      { status: 400 }
    )
  }
  if (Number(sessions_count) <= 0) {
    return NextResponse.json({ error: 'sessions_count debe ser > 0' }, { status: 400 })
  }
  if (Number(price_usd) < 0) {
    return NextResponse.json({ error: 'price_usd no puede ser negativo' }, { status: 400 })
  }
  if (!doctor_id && !specialty) {
    return NextResponse.json(
      { error: 'Debe especificar doctor_id o specialty' },
      { status: 400 }
    )
  }

  // Si NO es super_admin, forzamos doctor_id = self (no puede crear para otro doctor)
  const finalDoctorId = profile.role === 'super_admin' ? (doctor_id || null) : profile.id

  const { data, error } = await admin.from('package_templates').insert({
    name,
    description: description || null,
    sessions_count: Number(sessions_count),
    price_usd: Number(price_usd),
    specialty: specialty || null,
    doctor_id: finalDoctorId,
    is_active: true,
    created_by: profile.id,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data })
}

// PATCH /api/admin/packages?id=<uuid> — actualiza un template
export async function PATCH(req: NextRequest) {
  const guard = await requireRole(['super_admin', 'doctor'])
  if (!guard.ok) return guard.response
  const { admin, profile } = guard

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  // Verificar ownership si no es super_admin
  if (profile.role !== 'super_admin') {
    const { data: existing } = await admin
      .from('package_templates').select('doctor_id').eq('id', id).single()
    if (!existing || existing.doctor_id !== profile.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const body = await req.json()
  const ALLOWED = ['name', 'description', 'sessions_count', 'price_usd', 'specialty', 'is_active']
  const safe: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(body)) {
    if (ALLOWED.includes(k)) safe[k] = v
  }
  safe.updated_at = new Date().toISOString()

  const { data, error } = await admin
    .from('package_templates').update(safe).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data })
}

// DELETE /api/admin/packages?id=<uuid> — soft-delete (marca is_active=false)
export async function DELETE(req: NextRequest) {
  const guard = await requireRole(['super_admin', 'doctor'])
  if (!guard.ok) return guard.response
  const { admin, profile } = guard

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  if (profile.role !== 'super_admin') {
    const { data: existing } = await admin
      .from('package_templates').select('doctor_id').eq('id', id).single()
    if (!existing || existing.doctor_id !== profile.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const { error } = await admin
    .from('package_templates').update({ is_active: false }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
