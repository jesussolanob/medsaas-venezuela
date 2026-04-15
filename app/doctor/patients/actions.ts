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
  source: string | null          // 'manual' | 'invitation' | 'whatsapp'
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
  payment_status: 'unpaid' | 'pending_approval' | 'approved'
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

export type AddPatientInput = {
  full_name: string
  age?: number
  phone?: string
  cedula?: string
  email?: string
  sex?: string
  notes?: string
  source?: string
}

export type ActionResult = { success: true } | { success: false; error: string }

export async function addPatient(doctorId: string, input: AddPatientInput): Promise<ActionResult> {
  const supabase = createAdminClient()
  const { error } = await supabase.from('patients').insert({
    doctor_id: doctorId,
    full_name: input.full_name,
    age: input.age ?? null,
    phone: input.phone ?? null,
    cedula: input.cedula ?? null,
    email: input.email ?? null,
    sex: input.sex ?? null,
    notes: input.notes ?? null,
    source: input.source ?? 'manual',
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
  payment_status?: 'unpaid' | 'pending_approval' | 'approved'
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
    payment_status: input.payment_status ?? 'unpaid',
    consultation_date: new Date().toISOString(),
  })

  if (error) return { success: false, error: error.message }
  revalidatePath('/doctor/patients')
  return { success: true, code }
}

export async function updateConsultationStatus(
  consultationId: string,
  status: 'unpaid' | 'pending_approval' | 'approved'
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
