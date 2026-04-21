#!/usr/bin/env node
/**
 * scripts/create-qa-users.mjs
 *
 * Crea las 3 cuentas QA en Supabase con datos completos.
 * Idempotente: si ya existen, las actualiza/skippea.
 *
 * Uso:  npm run qa:setup
 */

import { createClient } from '@supabase/supabase-js'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
dotenv.config({ path: path.join(ROOT, '.env.local') })

const URL  = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.error('❌  Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}

const sb = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const QA = [
  {
    email: 'qa.admin@delta.test',
    password: 'QaAdmin2026!',
    role: 'super_admin',
    full_name: 'QA Admin Delta',
    phone: '+584140000001',
  },
  {
    email: 'qa.doctor@delta.test',
    password: 'QaDoctor2026!',
    role: 'doctor',
    full_name: 'Dra. QA Doctor',
    phone: '+584140000002',
    specialty: 'Medicina General',
    professional_title: 'Dra.',
    consultation_fee: 25,
    timezone: 'America/Caracas',
    city: 'Caracas',
    state: 'Distrito Capital',
    allows_online: true,
    reviewed_by_admin: true,
  },
  {
    email: 'qa.patient@delta.test',
    password: 'QaPatient2026!',
    role: 'patient',
    full_name: 'QA Paciente Demo',
    phone: '+584140000003',
  },
]

async function ensureUser(qa) {
  const out = { email: qa.email }

  // 1) Buscar/crear en auth.users
  const { data: list } = await sb.auth.admin.listUsers({ perPage: 1000 })
  let user = list?.users?.find(u => u.email === qa.email) ?? null

  if (!user) {
    const { data, error } = await sb.auth.admin.createUser({
      email: qa.email,
      password: qa.password,
      email_confirm: true,
      user_metadata: { full_name: qa.full_name, role: qa.role },
    })
    if (error) throw new Error(`auth.createUser ${qa.email}: ${error.message}`)
    user = data.user
    out.created = true
  } else {
    // Reset password siempre — para que tengamos credenciales seguras
    const { error } = await sb.auth.admin.updateUserById(user.id, { password: qa.password })
    if (error) throw new Error(`auth.updateUserById ${qa.email}: ${error.message}`)
    out.reset_password = true
  }
  out.id = user.id

  // 2) Upsert profile
  const profilePayload = {
    id: user.id,
    email: qa.email,
    full_name: qa.full_name,
    role: qa.role,
    phone: qa.phone,
  }
  if (qa.specialty)            profilePayload.specialty = qa.specialty
  if (qa.professional_title)   profilePayload.professional_title = qa.professional_title
  if (qa.consultation_fee)     profilePayload.consultation_fee = qa.consultation_fee
  if (qa.timezone)             profilePayload.timezone = qa.timezone
  if (qa.city)                 profilePayload.city = qa.city
  if (qa.state)                profilePayload.state = qa.state
  if (typeof qa.allows_online === 'boolean') profilePayload.allows_online = qa.allows_online
  if (typeof qa.reviewed_by_admin === 'boolean') profilePayload.reviewed_by_admin = qa.reviewed_by_admin

  const { error: pErr } = await sb.from('profiles').upsert(profilePayload, { onConflict: 'id' })
  if (pErr) throw new Error(`profiles upsert ${qa.email}: ${pErr.message}`)
  out.profile_ok = true

  // 3) Para doctor: crear subscription trial + reminders_settings + availability + slots básicos
  if (qa.role === 'doctor') {
    const { error: sErr } = await sb.from('subscriptions').upsert({
      doctor_id: user.id,
      plan: 'trial',
      status: 'active',
      price_usd: 0,
      current_period_end: new Date(Date.now() + 365*86400000).toISOString(),
    }, { onConflict: 'doctor_id' })
    if (sErr) console.warn(`subscription upsert: ${sErr.message}`)
    out.subscription_ok = true

    const { error: rErr } = await sb.from('reminders_settings').upsert({
      doctor_id: user.id,
    }, { onConflict: 'doctor_id' })
    if (rErr) console.warn(`reminders_settings: ${rErr.message}`)
    out.reminders_settings_ok = true

    // schedule config
    await sb.from('doctor_schedule_config').upsert({
      doctor_id: user.id,
      slot_duration: 30,
      buffer_minutes: 0,
      advance_booking_days: 30,
      auto_approve: false,
    }, { onConflict: 'doctor_id' })

    // availability lunes a viernes 9-17 (delete first to be idempotent)
    await sb.from('doctor_availability').delete().eq('doctor_id', user.id)
    const slots = []
    for (let day = 1; day <= 5; day++) {
      slots.push({
        doctor_id: user.id, day_of_week: day,
        start_time: '09:00', end_time: '17:00', is_enabled: true,
      })
    }
    await sb.from('doctor_availability').insert(slots)
    out.schedule_ok = true

    // pricing_plans básicos
    await sb.from('pricing_plans').delete().eq('doctor_id', user.id)
    await sb.from('pricing_plans').insert([
      {
        doctor_id: user.id, name: 'Consulta General',
        price_usd: 25, duration_minutes: 30, sessions_count: 1, is_active: true,
      },
      {
        doctor_id: user.id, name: 'Paquete 4 Sesiones',
        price_usd: 80, duration_minutes: 30, sessions_count: 4, is_active: true,
      },
    ])
    out.pricing_plans_ok = true
  }

  return out
}

async function setupPatientData(adminId, doctorId, patientUserId) {
  // Crear registro patients vinculado al doctor + auth_user_id del patient
  const { data: existing } = await sb.from('patients')
    .select('id').eq('doctor_id', doctorId).eq('email', 'qa.patient@delta.test').maybeSingle()

  let patientRecordId = existing?.id
  if (!patientRecordId) {
    const { data, error } = await sb.from('patients').insert({
      doctor_id: doctorId,
      auth_user_id: patientUserId,
      full_name: 'QA Paciente Demo',
      email: 'qa.patient@delta.test',
      phone: '+584140000003',
      cedula: 'V-12345678',
      source: 'qa_setup',
    }).select('id').single()
    if (error) throw new Error(`patient insert: ${error.message}`)
    patientRecordId = data.id
  } else {
    await sb.from('patients').update({ auth_user_id: patientUserId }).eq('id', patientRecordId)
  }
  console.log('   patient record:', patientRecordId)

  // Crear cita futura para el paciente con el doctor
  const inOneWeek = new Date()
  inOneWeek.setDate(inOneWeek.getDate() + 7)
  inOneWeek.setHours(10, 0, 0, 0)

  const { data: existingAppt } = await sb.from('appointments')
    .select('id')
    .eq('doctor_id', doctorId)
    .eq('patient_id', patientRecordId)
    .gte('scheduled_at', new Date().toISOString())
    .maybeSingle()

  if (!existingAppt) {
    const { error: aErr } = await sb.from('appointments').insert({
      doctor_id: doctorId,
      patient_id: patientRecordId,
      auth_user_id: patientUserId,
      patient_name: 'QA Paciente Demo',
      patient_email: 'qa.patient@delta.test',
      patient_phone: '+584140000003',
      scheduled_at: inOneWeek.toISOString(),
      status: 'confirmed',
      source: 'qa_setup',
      plan_name: 'Consulta General',
      plan_price: 25,
      payment_method: 'efectivo',
      appointment_mode: 'presencial',
      chief_complaint: 'Cita de prueba E2E',
    })
    if (aErr) console.warn(`appointment insert: ${aErr.message}`)
    else console.log('   future appointment created at', inOneWeek.toISOString())
  } else {
    console.log('   appointment ya existe:', existingAppt.id)
  }
}

async function main() {
  console.log('🚀 Setup cuentas QA en Supabase')
  const results = []
  for (const qa of QA) {
    process.stdout.write(`→ ${qa.email}... `)
    try {
      const r = await ensureUser(qa)
      console.log(JSON.stringify(r))
      results.push(r)
    } catch (e) {
      console.error('ERR:', e.message)
      process.exit(1)
    }
  }

  // Patient → linkear con QA doctor + crear cita
  const adminId = results.find(r => r.email === 'qa.admin@delta.test').id
  const doctorId = results.find(r => r.email === 'qa.doctor@delta.test').id
  const patientId = results.find(r => r.email === 'qa.patient@delta.test').id
  console.log('→ vincular paciente con doctor + cita futura...')
  await setupPatientData(adminId, doctorId, patientId)

  console.log('\n✅ Cuentas listas. Credenciales:')
  for (const qa of QA) {
    console.log(`   ${qa.email}  /  ${qa.password}  (${qa.role})`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
