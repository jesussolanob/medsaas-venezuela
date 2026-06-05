/**
 * lib/shared-files.ts — NEUTRALIZADO (sin Supabase)
 *
 * Módulo original: RONDA 40 — helpers para el módulo "Seguimiento del Paciente"
 * (Shared Health Space). Centralizaba upload a Supabase Storage + insert en
 * shared_files + queries comunes.
 *
 * Estado actual: Supabase eliminado. Todas las funciones son stubs que devuelven
 * datos vacíos o no-op.
 *
 * FASE futura: backend shared_files — implementar:
 *   GET  /api/patient/shared-files?patientId=<id>
 *   POST /api/patient/shared-files          (upload multipart)
 *   PATCH /api/patient/shared-files/:id
 *   DELETE /api/patient/shared-files/:id
 * y reemplazar los stubs por llamadas a backendGet/backendPost de
 * @/lib/api-client.server.
 *
 * Consumidores actuales:
 *   - app/patient/seguimiento/page.tsx  (portal paciente — deshabilitado, usa placeholder)
 */

// ── Tipo público (shape que usaba la tabla shared_files en Supabase) ──────────
// Se conserva para que los consumidores TypeScript no rompan.
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

/** Path canónico en Storage — conservado para referencia futura. */
export function buildSharedPath(patientId: string, filename: string): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
  return `patients/${patientId}/shared/${Date.now()}_${safe}`
}

/** Detecta el `file_type` corto a partir del MIME o nombre. */
export function detectFileType(file: File): string {
  if (file.type.startsWith('image/')) return file.type.split('/')[1] || 'image'
  if (file.type === 'application/pdf') return 'pdf'
  const ext = file.name.split('.').pop()?.toLowerCase()
  return ext || 'unknown'
}

/** Detecta una categoría por defecto basada en el tipo de archivo. */
export function defaultCategory(file: File): SharedFile['category'] {
  if (file.type === 'application/pdf') return 'lab_result'
  if (file.type.startsWith('image/')) return 'image'
  return 'other'
}

/**
 * STUB — FASE futura: backend shared_files upload.
 * Originalmente subía al bucket de Supabase Storage e insertaba en shared_files.
 */
export async function uploadSharedFile(
  _supabase: unknown,
  _args: {
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
  return { data: null, error: 'Función no disponible — pendiente backend shared_files (Fase futura)' }
}

/**
 * STUB — FASE futura: backend shared_files — crear instrucción/tarea sin archivo.
 */
export async function createInstruction(
  _supabase: unknown,
  _args: {
    doctorId: string
    patientId: string
    title: string
    description?: string | null
  }
): Promise<{ data: SharedFile | null; error: string | null }> {
  return { data: null, error: 'Función no disponible — pendiente backend shared_files (Fase futura)' }
}

/**
 * STUB — FASE futura: backend shared_files — respuesta solo con comentario.
 */
export async function replyWithComment(
  _supabase: unknown,
  _args: {
    doctorId: string
    patientId: string
    title: string
    description: string
    createdBy: 'doctor' | 'patient'
    parentTaskId?: string | null
  }
): Promise<{ data: SharedFile | null; error: string | null }> {
  return { data: null, error: 'Función no disponible — pendiente backend shared_files (Fase futura)' }
}

/**
 * STUB — FASE futura: backend shared_files — editar metadatos.
 */
export async function updateSharedFile(
  _supabase: unknown,
  _args: {
    id: string
    title?: string
    description?: string | null
    status?: 'pending' | 'completed' | 'reviewed'
  }
): Promise<{ data: SharedFile | null; error: string | null }> {
  return { data: null, error: 'Función no disponible — pendiente backend shared_files (Fase futura)' }
}

/**
 * STUB — FASE futura: backend shared_files — adjuntar o reemplazar archivo.
 */
export async function attachFileToExisting(
  _supabase: unknown,
  _args: { id: string; file: File; patientId: string }
): Promise<{ data: SharedFile | null; error: string | null }> {
  return { data: null, error: 'Función no disponible — pendiente backend shared_files (Fase futura)' }
}

/**
 * STUB — FASE futura: backend shared_files — eliminar un shared_file.
 */
export async function deleteSharedFile(
  _supabase: unknown,
  _args: { id: string; fileUrl?: string | null }
): Promise<{ error: string | null }> {
  return { error: 'Función no disponible — pendiente backend shared_files (Fase futura)' }
}

/** STUB — lista vacía hasta que exista el endpoint de backend. */
export async function listSharedFiles(
  _supabase: unknown,
  _args: { patientId: string; doctorId?: string }
): Promise<SharedFile[]> {
  return []
}

/** STUB — no-op hasta que exista el endpoint de backend. */
export async function markAllReadByDoctor(
  _supabase: unknown,
  _args: { doctorId: string; patientId: string }
): Promise<void> {
  // no-op
}

/** STUB — no-op hasta que exista el endpoint de backend. */
export async function markAllReadByPatient(
  _supabase: unknown,
  _args: { patientId: string }
): Promise<void> {
  // no-op
}

/** STUB — mapa vacío hasta que exista el endpoint de backend. */
export async function countUnreadByDoctorPerPatient(
  _supabase: unknown,
  _doctorId: string
): Promise<Record<string, number>> {
  return {}
}
