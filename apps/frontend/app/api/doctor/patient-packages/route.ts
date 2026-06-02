import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-guards'

// GET /api/doctor/patient-packages?patient_id=<uuid>
// Lista paquetes activos del paciente para este doctor (o todos si super_admin)
export async function GET(req: NextRequest) {
  const guard = await requireRole(['super_admin', 'doctor', 'patient'])
  if (!guard.ok) return guard.response
  const { admin, profile } = guard

  const { searchParams } = new URL(req.url)
  const patientId = searchParams.get('patient_id')

  let query = admin.from('patient_packages').select(`
    id, doctor_id, patient_id, auth_user_id,
    package_template_id, plan_name, specialty,
    total_sessions, used_sessions, status,
    purchased_amount_usd, created_at, updated_at,
    doctor:doctor_id(full_name, specialty),
    patient:patient_id(full_name, email)
  `).order('created_at', { ascending: false })

  if (profile.role === 'doctor') {
    query = query.eq('doctor_id', profile.id)
    if (patientId) query = query.eq('patient_id', patientId)
  } else if (profile.role === 'patient') {
    // Paciente solo ve sus propios paquetes
    query = query.eq('auth_user_id', profile.id)
  } else if (patientId) {
    query = query.eq('patient_id', patientId)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data || [] })
}

// POST /api/doctor/patient-packages — asigna paquete a un paciente
// body: { patient_id, package_template_id, payment_method?, payment_reference? }
export async function POST(req: NextRequest) {
  const guard = await requireRole(['super_admin', 'doctor'])
  if (!guard.ok) return guard.response
  const { admin, profile } = guard

  const body = await req.json()
  const { patient_id, package_template_id, payment_method, payment_reference } = body

  if (!patient_id || !package_template_id) {
    return NextResponse.json(
      { error: 'patient_id y package_template_id son requeridos' },
      { status: 400 }
    )
  }

  // Cargar template
  const { data: tpl, error: tplErr } = await admin
    .from('package_templates')
    .select('*')
    .eq('id', package_template_id)
    .eq('is_active', true)
    .single()
  if (tplErr || !tpl) {
    return NextResponse.json({ error: 'Plantilla no encontrada o inactiva' }, { status: 404 })
  }

  // Cargar paciente + validar ownership
  const { data: patient } = await admin
    .from('patients').select('id, doctor_id, auth_user_id').eq('id', patient_id).single()
  if (!patient) return NextResponse.json({ error: 'Paciente no encontrado' }, { status: 404 })

  const doctorId = profile.role === 'super_admin' ? patient.doctor_id : profile.id

  if (profile.role === 'doctor' && patient.doctor_id !== profile.id) {
    return NextResponse.json({ error: 'Este paciente no es tuyo' }, { status: 403 })
  }

  // Validar que el template aplique al doctor (si es específico)
  if (tpl.doctor_id && tpl.doctor_id !== doctorId) {
    return NextResponse.json(
      { error: 'Este paquete es específico de otro doctor' },
      { status: 400 }
    )
  }

  // Crear patient_package
  const { data: pkg, error: pkgErr } = await admin
    .from('patient_packages')
    .insert({
      doctor_id: doctorId,
      patient_id,
      auth_user_id: patient.auth_user_id,
      package_template_id: tpl.id,
      plan_name: tpl.name,
      specialty: tpl.specialty,
      total_sessions: tpl.sessions_count,
      used_sessions: 0,
      status: 'active',
      purchased_amount_usd: tpl.price_usd,
    })
    .select()
    .single()

  if (pkgErr) return NextResponse.json({ error: pkgErr.message }, { status: 500 })

  // Log inicial
  await admin.from('package_balance_log').insert({
    package_id: pkg.id,
    delta: 0,
    balance_after: tpl.sessions_count,
    reason: 'initial_allocation',
    actor_id: profile.id,
    notes: payment_reference || `Asignado por ${profile.role}`,
  })

  return NextResponse.json({ success: true, data: pkg })
}
