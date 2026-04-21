import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-guards'
import { resolveBlocksForDoctor } from '@/lib/consultation-blocks'

// GET /api/doctor/consultation-blocks
// Retorna: { catalog: [...], resolved: [...], doctor_config: [...] }
export async function GET(req: NextRequest) {
  const guard = await requireRole(['doctor', 'super_admin'])
  if (!guard.ok) return guard.response
  const { admin, profile } = guard

  const { searchParams } = new URL(req.url)
  const doctorId = searchParams.get('doctor_id') || profile.id

  // Validar: si es doctor solo puede ver la suya; super_admin cualquiera
  if (profile.role !== 'super_admin' && doctorId !== profile.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Traer el specialty del doctor
  const { data: doctorProfile } = await admin
    .from('profiles').select('specialty').eq('id', doctorId).single()

  const [catalogRes, doctorRes, resolved] = await Promise.all([
    admin.from('consultation_block_catalog').select('*').order('key'),
    admin.from('doctor_consultation_blocks').select('*').eq('doctor_id', doctorId),
    resolveBlocksForDoctor({ doctorId, specialty: doctorProfile?.specialty }),
  ])

  return NextResponse.json({
    catalog: catalogRes.data || [],
    doctor_config: doctorRes.data || [],
    resolved,
    doctor_specialty: doctorProfile?.specialty || null,
  })
}

// PUT /api/doctor/consultation-blocks — reemplaza TODA la config del doctor
// body: { blocks: [{ block_key, enabled, sort_order, custom_label, printable, send_to_patient }] }
export async function PUT(req: NextRequest) {
  const guard = await requireRole(['doctor', 'super_admin'])
  if (!guard.ok) return guard.response
  const { admin, profile } = guard

  const body = await req.json()
  const { doctor_id, blocks } = body
  const targetDoctor = doctor_id || profile.id

  if (profile.role !== 'super_admin' && targetDoctor !== profile.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!Array.isArray(blocks)) {
    return NextResponse.json({ error: 'blocks debe ser un array' }, { status: 400 })
  }

  // Validar que al menos un bloque esté enabled=true
  const enabledCount = blocks.filter((b: any) => b.enabled !== false).length
  if (enabledCount === 0) {
    return NextResponse.json(
      { error: 'Debes tener al menos un bloque activo en tu configuración' },
      { status: 400 }
    )
  }

  // Validar que todos los block_key existan en el catálogo
  const { data: catalog } = await admin.from('consultation_block_catalog').select('key')
  const validKeys = new Set((catalog || []).map((c: any) => c.key))
  for (const b of blocks) {
    if (!b.block_key || !validKeys.has(b.block_key)) {
      return NextResponse.json(
        { error: `block_key inválido: ${b.block_key}` },
        { status: 400 }
      )
    }
  }

  // Estrategia simple: DELETE + INSERT (pequeño volumen)
  await admin.from('doctor_consultation_blocks').delete().eq('doctor_id', targetDoctor)

  const rows = blocks.map((b: any, idx: number) => ({
    doctor_id: targetDoctor,
    block_key: b.block_key,
    enabled: b.enabled ?? true,
    sort_order: b.sort_order ?? idx,
    custom_label: b.custom_label || null,
    custom_content_type: b.custom_content_type || null,
    printable: b.printable ?? null,
    send_to_patient: b.send_to_patient ?? null,
    updated_at: new Date().toISOString(),
  }))

  if (rows.length > 0) {
    const { error } = await admin.from('doctor_consultation_blocks').insert(rows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, blocks_saved: rows.length })
}
