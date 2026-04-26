'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

// ── Types ─────────────────────────────────────────────────────────────────────

export type Patient = {
  id: string
  doctor_id: string
  full_name: string
  age: number | null
  phone: string | null
  cedula: string | null
  email: string | null
  sex: string | null
  notes: string | null
  source: string | null          // 'manual' | 'invitation' | 'whatsapp' | 'booking'
  auth_user_id?: string | null   // If set, patient registered via portal (read-only)
  birth_date?: string | null
  address?: string | null
  city?: string | null
  blood_type?: string | null
  allergies?: string | null
  chronic_conditions?: string | null
  emergency_contact_name?: string | null
  emergency_contact_phone?: string | null
  avatar_url?: string | null
  created_at: string
}

export type Consultation = {
  id: string
  consultation_code: string      // e.g. CON-20240115-0001
  patient_id: string
  doctor_id: string
  chief_complaint: string | null
  notes: string | null
  diagnosis: string | null
  treatment: string | null
  payment_status: 'pending' | 'approved'
  consultation_date: string
  created_at: string
}

// ── Generate unique consultation code ─────────────────────────────────────────

function genConsultationCode(): string {
  const date = new Date()
  const d = date.toISOString().slice(0, 10).replace(/-/g, '')
  const rand = Math.floor(1000 + Math.random() * 9000)
  return `CON-${d}-${rand}`
}

// ── Patients CRUD ─────────────────────────────────────────────────────────────

export async function getPatients(doctorId: string): Promise<Patient[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .eq('doctor_id', doctorId)
    .order('created_at', { ascending: false })

  if (error) { console.error('getPatients:', error.message); return [] }
  return data ?? []
}

// RONDA 19b: ampliado para soportar el PatientForm unificado.
// Todos los campos clinicos opcionales aceptan undefined o null.
export type AddPatientInput = {
  full_name: string
  age?: number | null
  birth_date?: string | null
  phone?: string | null
  cedula?: string | null
  email?: string | null
  sex?: string | null
  notes?: string | null
  source?: string | null
  blood_type?: string | null
  address?: string | null
  city?: string | null
  allergies?: string | null
  chronic_conditions?: string | null
  emergency_contact_name?: string | null
  emergency_contact_phone?: string | null
}

export type ActionResult = { success: true } | { success: false; error: string }

export async function addPatient(doctorId: string, input: AddPatientInput): Promise<ActionResult> {
  const supabase = createAdminClient()
  const { error } = await supabase.from('patients').insert({
    doctor_id: doctorId,
    full_name: input.full_name,
    age: input.age ?? null,
    birth_date: input.birth_date ?? null,
    phone: input.phone ?? null,
    cedula: input.cedula ?? null,
    email: input.email ?? null,
    sex: input.sex ?? null,
    notes: input.notes ?? null,
    source: input.source ?? 'manual',
    blood_type: input.blood_type ?? null,
    address: input.address ?? null,
    city: input.city ?? null,
    allergies: input.allergies ?? null,
    chronic_conditions: input.chronic_conditions ?? null,
    emergency_contact_name: input.emergency_contact_name ?? null,
    emergency_contact_phone: input.emergency_contact_phone ?? null,
  })
  if (error) return { success: false, error: error.message }
  revalidatePath('/doctor/patients')
  return { success: true }
}

export async function getDoctorId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

// ── Consultations ──────────────────────────────────────────────────────────────

export async function getConsultations(patientId: string): Promise<Consultation[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('consultations')
    .select('*')
    .eq('patient_id', patientId)
    .order('consultation_date', { ascending: false })

  if (error) { console.error('getConsultations:', error.message); return [] }
  return data ?? []
}

export type CreateConsultationInput = {
  patient_id: string
  chief_complaint?: string
  notes?: string
  diagnosis?: string
  treatment?: string
  payment_status?: 'pending' | 'approved'
}

export async function createConsultation(doctorId: string, input: CreateConsultationInput): Promise<ActionResult & { code?: string }> {
  const supabase = createAdminClient()
  const code = genConsultationCode()

  const { error } = await supabase.from('consultations').insert({
    consultation_code: code,
    patient_id: input.patient_id,
    doctor_id: doctorId,
    chief_complaint: input.chief_complaint ?? null,
    notes: input.notes ?? null,
    diagnosis: input.diagnosis ?? null,
    treatment: input.treatment ?? null,
    payment_status: input.payment_status ?? 'pending',
    consultation_date: new Date().toISOString(),
  })

  if (error) return { success: false, error: error.message }
  revalidatePath('/doctor/patients')
  return { success: true, code }
}

export async function updateConsultationStatus(
  consultationId: string,
  status: 'pending' | 'approved'
): Promise<ActionResult> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('consultations')
    .update({ payment_status: status })
    .eq('id', consultationId)

  if (error) return { success: false, error: error.message }
  revalidatePath('/doctor/patients')
  return { success: true }
}

export async function updateConsultationNotes(
  consultationId: string,
  fields: { notes?: string; diagnosis?: string; treatment?: string; chief_complaint?: string }
): Promise<ActionResult> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('consultations')
    .update(fields)
    .eq('id', consultationId)

  if (error) return { success: false, error: error.message }
  revalidatePath('/doctor/patients')
  return { success: true }
}

export type UpdatePatientInput = {
  full_name?: string
  age?: number | null
  birth_date?: string | null
  phone?: string | null
  cedula?: string | null
  email?: string | null
  sex?: string | null
  notes?: string | null
  blood_type?: string | null
  allergies?: string | null
  chronic_conditions?: string | null
  emergency_contact_name?: string | null
  emergency_contact_phone?: string | null
  address?: string | null
  city?: string | null
  source?: string | null
}

export async function updatePatient(patientId: string, doctorId: string, input: UpdatePatientInput): Promise<ActionResult> {
  const supabase = createAdminClient()

  // Verify the patient belongs to this doctor
  const { data: existing } = await supabase
    .from('patients')
    .select('id, doctor_id, auth_user_id')
    .eq('id', patientId)
    .single()

  if (!existing || existing.doctor_id !== doctorId) {
    return { success: false, error: 'Paciente no encontrado' }
  }

  // If patient has auth_user_id (registered via portal), don't allow editing core fields
  if (existing.auth_user_id) {
    return { success: false, error: 'Este paciente está sincronizado con su cuenta. No se puede editar desde aquí.' }
  }

  const updateData: Record<string, unknown> = {}
  if (input.full_name !== undefined) updateData.full_name = input.full_name
  if (input.age !== undefined) updateData.age = input.age
  if (input.birth_date !== undefined) updateData.birth_date = input.birth_date
  if (input.phone !== undefined) updateData.phone = input.phone
  if (input.cedula !== undefined) updateData.cedula = input.cedula
  if (input.email !== undefined) updateData.email = input.email
  if (input.sex !== undefined) updateData.sex = input.sex
  if (input.notes !== undefined) updateData.notes = input.notes
  if (input.blood_type !== undefined) updateData.blood_type = input.blood_type
  if (input.allergies !== undefined) updateData.allergies = input.allergies
  if (input.chronic_conditions !== undefined) updateData.chronic_conditions = input.chronic_conditions
  if (input.emergency_contact_name !== undefined) updateData.emergency_contact_name = input.emergency_contact_name
  if (input.emergency_contact_phone !== undefined) updateData.emergency_contact_phone = input.emergency_contact_phone
  if (input.address !== undefined) updateData.address = input.address
  if (input.city !== undefined) updateData.city = input.city
  if (input.source !== undefined) updateData.source = input.source

  const { error } = await supabase
    .from('patients')
    .update(updateData)
    .eq('id', patientId)

  if (error) return { success: false, error: error.message }
  revalidatePath('/doctor/patients')
  return { success: true }
}

export async function getAllConsultationsForDoctor(doctorId: string): Promise<(Consultation & { patient_name: string })[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('consultations')
    .select('*, patients(full_name)')
    .eq('doctor_id', doctorId)
    .order('consultation_date', { ascending: false })

  if (error) { console.error('getAllConsultations:', error.message); return [] }
  return (data ?? []).map(r => ({
    ...r,
    patient_name: (r.patients as { full_name: string } | null)?.full_name ?? 'Paciente',
  }))
}
