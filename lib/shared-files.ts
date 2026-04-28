/**
 * lib/shared-files.ts — RONDA 40
 *
 * Helpers para el modulo "Seguimiento del Paciente" (Shared Health Space).
 * Centraliza upload a Storage + insert en shared_files + queries comunes.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type SharedFile = {
  id: string
  doctor_id: string
  patient_id: string
  title: string
  description: string | null
  file_url: string | null
  file_type: string | null
  file_size_bytes: number | null
  category: 'instruction' | 'file' | 'recipe' | 'lab_result' | 'image' | 'other' | 'comment'
  status: 'pending' | 'completed' | 'reviewed'
  created_by: 'doctor' | 'patient'
  parent_task_id: string | null
  read_by_doctor: boolean
  read_by_patient: boolean
  created_at: string
  updated_at: string
}

export const SHARED_BUCKET = 'patient-shared-files'

/** Path canonico en Storage: patients/<patient_id>/shared/<filename> */
export function buildSharedPath(patientId: string, filename: string): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
  return `patients/${patientId}/shared/${Date.now()}_${safe}`
}

/** Detecta el `file_type` corto a partir del MIME o nombre */
export function detectFileType(file: File): string {
  if (file.type.startsWith('image/')) return file.type.split('/')[1] || 'image'
  if (file.type === 'application/pdf') return 'pdf'
  const ext = file.name.split('.').pop()?.toLowerCase()
  return ext || 'unknown'
}

/** Detecta una categoria por defecto basada en el tipo de archivo */
export function defaultCategory(file: File): SharedFile['category'] {
  if (file.type === 'application/pdf') return 'lab_result'
  if (file.type.startsWith('image/')) return 'image'
  return 'other'
}

/**
 * Sube un archivo al bucket y crea la fila en shared_files en una transaccion logica.
 * Si la insercion BD falla, intenta limpiar el archivo de Storage (best-effort).
 */
export async function uploadSharedFile(
  supabase: SupabaseClient,
  args: {
    file: File
    doctorId: string
    patientId: string
    title: string
    description?: string | null
    category?: SharedFile['category']
    createdBy: 'doctor' | 'patient'
    parentTaskId?: string | null
  }
): Promise<{ data: SharedFile | null; error: string | null }> {
  const path = buildSharedPath(args.patientId, args.file.name)

  // 1) Upload al bucket
  const { error: upErr } = await supabase.storage
    .from(SHARED_BUCKET)
    .upload(path, args.file, { contentType: args.file.type, upsert: false })
  if (upErr) {
    return { data: null, error: `Upload fallo: ${upErr.message}` }
  }

  const { data: pubUrl } = supabase.storage.from(SHARED_BUCKET).getPublicUrl(path)
  const fileUrl = pubUrl.publicUrl

  // 2) Insert en shared_files
  const row = {
    doctor_id: args.doctorId,
    patient_id: args.patientId,
    title: args.title,
    description: args.description || null,
    file_url: fileUrl,
    file_type: detectFileType(args.file),
    file_size_bytes: args.file.size,
    category: args.category || defaultCategory(args.file),
    status: 'completed' as const,
    created_by: args.createdBy,
    parent_task_id: args.parentTaskId || null,
    // Lo MARCA como NO leido para el otro lado (badge verde)
    read_by_doctor: args.createdBy === 'doctor',
    read_by_patient: args.createdBy === 'patient',
  }

  const { data, error: insErr } = await supabase
    .from('shared_files')
    .insert(row)
    .select()
    .single()

  if (insErr) {
    // Best-effort cleanup
    await supabase.storage.from(SHARED_BUCKET).remove([path])
    return { data: null, error: `Insert fallo: ${insErr.message}` }
  }

  // Si era respuesta a una tarea, marcar la tarea como completed
  if (args.parentTaskId) {
    await supabase
      .from('shared_files')
      .update({ status: 'completed', read_by_doctor: false })
      .eq('id', args.parentTaskId)
  }

  return { data: data as SharedFile, error: null }
}

/**
 * El doctor crea una INSTRUCCION/TAREA sin archivo (description con texto).
 * El paciente vera esto en su feed como tarea pendiente.
 */
export async function createInstruction(
  supabase: SupabaseClient,
  args: {
    doctorId: string
    patientId: string
    title: string
    description?: string | null
  }
): Promise<{ data: SharedFile | null; error: string | null }> {
  const { data, error } = await supabase
    .from('shared_files')
    .insert({
      doctor_id: args.doctorId,
      patient_id: args.patientId,
      title: args.title,
      description: args.description || null,
      file_url: null,
      file_type: null,
      category: 'instruction',
      status: 'pending',
      created_by: 'doctor',
      read_by_doctor: true,
      read_by_patient: false,
    })
    .select()
    .single()
  if (error) return { data: null, error: error.message }
  return { data: data as SharedFile, error: null }
}

/**
 * RONDA 41: respuesta SOLO con comentario (sin archivo). El paciente puede
 * responder a una tarea o dejar un comentario suelto sin obligarlo a adjuntar.
 * Si parentTaskId esta presente, marca la tarea original como completed.
 */
export async function replyWithComment(
  supabase: SupabaseClient,
  args: {
    doctorId: string
    patientId: string
    title: string
    description: string
    createdBy: 'doctor' | 'patient'
    parentTaskId?: string | null
  }
): Promise<{ data: SharedFile | null; error: string | null }> {
  if (!args.description || !args.description.trim()) {
    return { data: null, error: 'El comentario no puede estar vacío' }
  }
  const { data, error } = await supabase
    .from('shared_files')
    .insert({
      doctor_id: args.doctorId,
      patient_id: args.patientId,
      title: args.title || 'Comentario',
      description: args.description.trim(),
      file_url: null,
      file_type: null,
      // RONDA 42: categoria propia para que NO aparezca como tarea pendiente
      category: 'comment',
      status: 'completed',
      created_by: args.createdBy,
      parent_task_id: args.parentTaskId || null,
      // Lo marca NO leido para el otro lado
      read_by_doctor: args.createdBy === 'doctor',
      read_by_patient: args.createdBy === 'patient',
    })
    .select()
    .single()
  if (error) return { data: null, error: error.message }

  // Si era respuesta a una tarea, marcar la tarea original como completed
  if (args.parentTaskId) {
    await supabase
      .from('shared_files')
      .update({ status: 'completed', read_by_doctor: false })
      .eq('id', args.parentTaskId)
  }

  return { data: data as SharedFile, error: null }
}

/** Lista los shared_files de UN paciente, ordenados desc. */
export async function listSharedFiles(
  supabase: SupabaseClient,
  args: { patientId: string; doctorId?: string }
): Promise<SharedFile[]> {
  let q = supabase
    .from('shared_files')
    .select('*')
    .eq('patient_id', args.patientId)
    .order('created_at', { ascending: false })
  if (args.doctorId) q = q.eq('doctor_id', args.doctorId)
  const { data } = await q
  return (data || []) as SharedFile[]
}

/** Marca como leidos por el doctor todos los archivos de un paciente. */
export async function markAllReadByDoctor(
  supabase: SupabaseClient,
  args: { doctorId: string; patientId: string }
) {
  await supabase
    .from('shared_files')
    .update({ read_by_doctor: true })
    .eq('doctor_id', args.doctorId)
    .eq('patient_id', args.patientId)
    .eq('read_by_doctor', false)
}

/** Marca como leidos por el paciente */
export async function markAllReadByPatient(
  supabase: SupabaseClient,
  args: { patientId: string }
) {
  await supabase
    .from('shared_files')
    .update({ read_by_patient: true })
    .eq('patient_id', args.patientId)
    .eq('read_by_patient', false)
}

/**
 * Cuenta cuantos archivos NO leidos por el doctor hay para CADA paciente.
 * Usado para pintar el badge verde en la lista de pacientes.
 */
export async function countUnreadByDoctorPerPatient(
  supabase: SupabaseClient,
  doctorId: string
): Promise<Record<string, number>> {
  const { data } = await supabase
    .from('shared_files')
    .select('patient_id')
    .eq('doctor_id', doctorId)
    .eq('read_by_doctor', false)
    .eq('created_by', 'patient')
  const counts: Record<string, number> = {}
  for (const row of (data || [])) {
    const pid = (row as any).patient_id
    counts[pid] = (counts[pid] || 0) + 1
  }
  return counts
}
