import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET+POST /api/seed-clinic — Create test clinic "Metropolitana" with test doctors
// 🚫 Deshabilitado en producción (CR-004). Sólo dev local.
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return handler()
}
export async function POST() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return handler()
}
async function handler() {
  const supabase = createAdminClient()

  // 1. Create clinic admin user
  const adminEmail = 'metropolitana@gmail.com'
  const adminPassword = '12345678'

  const { data: adminAuth, error: adminAuthErr } = await supabase.auth.admin.createUser({
    email: adminEmail,
    password: adminPassword,
    email_confirm: true,
    user_metadata: { full_name: 'Admin Metropolitana', role: 'doctor' },
  })

  if (adminAuthErr) {
    // If already exists, try to find the user
    if (adminAuthErr.message.includes('already registered')) {
      const { data: { users } } = await supabase.auth.admin.listUsers()
      const existing = users?.find(u => u.email === adminEmail)
      if (existing) {
        return NextResponse.json({ message: 'Clinic admin already exists', userId: existing.id })
      }
    }
    return NextResponse.json({ error: adminAuthErr.message }, { status: 500 })
  }

  const adminUserId = adminAuth.user.id

  // 2. Create the clinic
  const { data: clinic, error: clinicErr } = await supabase.from('clinics').insert({
    name: 'Centro Médico Metropolitano',
    slug: 'centro-medico-metropolitano',
    owner_id: adminUserId,
    address: 'Av. Principal, Torre Médica, Piso 5',
    city: 'Caracas',
    state: 'Distrito Capital',
    phone: '+58 212 9876543',
    email: adminEmail,
    specialty: 'Multiespecialidad',
    subscription_plan: 'centro_salud',
    subscription_status: 'trial',
    max_doctors: 10,
  }).select('id').single()

  if (clinicErr || !clinic) {
    return NextResponse.json({ error: clinicErr?.message || 'Failed to create clinic' }, { status: 500 })
  }

  // 3. Create admin profile
  await supabase.from('profiles').upsert({
    id: adminUserId,
    full_name: 'María González',
    email: adminEmail,
    specialty: 'Medicina General',
    phone: '+58 412 5551234',
    professional_title: 'Dra.',
    sex: 'female',
    role: 'doctor',
    is_active: true,
    clinic_id: clinic.id,
    clinic_role: 'admin',
    city: 'Caracas',
    state: 'Distrito Capital',
    country: 'Venezuela',
  })

  // 4. Create subscription for admin
  const now = new Date()
  const expires = new Date(now)
  expires.setDate(expires.getDate() + 30)

  await supabase.from('subscriptions').insert({
    doctor_id: adminUserId,
    plan: 'enterprise',
    status: 'trial',
    current_period_end: expires.toISOString(),
  })

  // 5. Create test doctors
  const testDoctors = [
    { name: 'Carlos Pérez', email: 'dr.perez.metro@gmail.com', specialty: 'Cardiología', title: 'Dr.', sex: 'male', phone: '+58 414 1112233' },
    { name: 'Ana Rodríguez', email: 'dra.rodriguez.metro@gmail.com', specialty: 'Pediatría', title: 'Dra.', sex: 'female', phone: '+58 412 4445566' },
    { name: 'Luis Martínez', email: 'dr.martinez.metro@gmail.com', specialty: 'Dermatología', title: 'Dr.', sex: 'male', phone: '+58 416 7778899' },
  ]

  const createdDoctors: string[] = []

  for (const doc of testDoctors) {
    const { data: docAuth, error: docAuthErr } = await supabase.auth.admin.createUser({
      email: doc.email,
      password: '12345678',
      email_confirm: true,
      user_metadata: { full_name: doc.name, role: 'doctor' },
    })

    if (docAuthErr) {
      console.error(`Error creating doctor ${doc.email}:`, docAuthErr.message)
      continue
    }

    const docUserId = docAuth.user.id

    await supabase.from('profiles').upsert({
      id: docUserId,
      full_name: doc.name,
      email: doc.email,
      specialty: doc.specialty,
      phone: doc.phone,
      professional_title: doc.title,
      sex: doc.sex,
      role: 'doctor',
      is_active: true,
      clinic_id: clinic.id,
      clinic_role: 'doctor',
      city: 'Caracas',
      state: 'Distrito Capital',
      country: 'Venezuela',
    })

    await supabase.from('subscriptions').insert({
      doctor_id: docUserId,
      plan: 'enterprise',
      status: 'trial',
      current_period_end: expires.toISOString(),
    })

    createdDoctors.push(doc.name)
  }

  return NextResponse.json({
    success: true,
    clinicId: clinic.id,
    adminEmail,
    adminPassword,
    adminUserId,
    doctorsCreated: createdDoctors,
  })
}
