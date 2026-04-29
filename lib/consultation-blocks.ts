/**
 * lib/consultation-blocks.ts
 *
 * Resolución de los bloques de consulta activos para un doctor.
 * Sirve tanto al doctor (para pintar su UI de consulta) como al renderizador
 * de informes/PDFs/emails.
 *
 * Cascada de resolución (prioridad descendente):
 *   1) doctor_consultation_blocks (config personal del doctor)
 *   2) specialty_default_blocks (defaults por especialidad)
 *   3) consultation_block_catalog (defaults globales — fallback)
 */

import { createAdminClient } from '@/lib/supabase/admin'

export type BlockContentType = 'rich_text' | 'list' | 'date' | 'file' | 'structured' | 'numeric'

export type ConsultationBlock = {
  key: string
  label: string
  content_type: BlockContentType
  enabled: boolean
  sort_order: number
  printable: boolean
  send_to_patient: boolean
  /** Datos del bloque (contenido del doctor en la consulta). Opcional en resolución inicial. */
  value?: unknown
}

export type ResolveArgs = {
  doctorId: string
  specialty?: string | null
}

/**
 * Resuelve el conjunto final de bloques para un doctor.
 * Retorna SOLO los bloques enabled=true, ordenados por sort_order.
 */
export async function resolveBlocksForDoctor({
  doctorId,
  specialty,
}: ResolveArgs): Promise<ConsultationBlock[]> {
  const admin = createAdminClient()

  const [catalogRes, specialtyRes, doctorRes] = await Promise.all([
    admin.from('consultation_block_catalog').select('*'),
    specialty
      ? admin.from('specialty_default_blocks').select('*').eq('specialty', specialty)
      : Promise.resolve({ data: [], error: null }),
    admin.from('doctor_consultation_blocks').select('*').eq('doctor_id', doctorId),
  ])

  const catalog = (catalogRes.data || [])
  const specialtyDefaults = (specialtyRes.data || [])
  const doctorConfig = (doctorRes.data || [])

  // Map catálogo por key
  const catalogMap = new Map(catalog.map((c: any) => [c.key, c]))
  // Map specialty defaults por key
  const specialtyMap = new Map(specialtyDefaults.map((s: any) => [s.block_key, s]))
  // Map doctor config por key
  const doctorMap = new Map(doctorConfig.map((d: any) => [d.block_key, d]))

  // El conjunto final parte del catálogo; aplicamos cascada.
  const blocks: ConsultationBlock[] = []

  // RONDA 37: detectar si la specialty del doctor TIENE algun default configurado.
  // Si NO tiene defaults Y el doctor tampoco tiene config personal, caemos a un
  // modo "zero-friction": mostramos todos los bloques printables del catalog.
  // Esto evita el bug donde el snapshot quedaba vacio y la consulta caia al
  // fallback hardcoded de 5 tabs (Informe, Receta, Prescripciones, Reposo, Notas).
  const specialtyHasDefaults = specialtyDefaults.length > 0
  const doctorHasConfig = doctorConfig.length > 0

  for (const cat of catalog) {
    const catalogEntry = cat as any
    const specialtyEntry = specialtyMap.get(cat.key) as any
    const doctorEntry = doctorMap.get(cat.key) as any

    // Resolución de enabled (cascada).
    // RONDA 37 + AUDIT FIX C-4 (2026-04-28): combina zero-friction onboarding
    // (doctor virgen sin specialty defaults) con respeto al `default_enabled`
    // del catálogo cuando el doctor SÍ tiene config personal pero no para este
    // block_key — así los core (chief_complaint, diagnosis, treatment,
    // prescription) siguen visibles aunque el doctor haya escondido otros.
    let enabled: boolean
    if (doctorEntry) {
      enabled = doctorEntry.enabled
    } else if (specialtyEntry) {
      enabled = specialtyEntry.enabled
    } else if (!doctorHasConfig && !specialtyHasDefaults) {
      // Doctor totalmente "virgen" (no toco settings y su specialty no tiene
      // defaults). Mostrar todos los bloques printables como onboarding.
      enabled = catalogEntry.default_printable !== false
    } else {
      // Doctor con config personal o specialty con defaults pero sin entry
      // para este block_key específico → respetar `default_enabled` del catálogo.
      enabled = catalogEntry.default_enabled ?? false
    }

    if (!enabled) continue

    const label = doctorEntry?.custom_label ?? catalogEntry.default_label
    const content_type: BlockContentType =
      (doctorEntry?.custom_content_type ?? catalogEntry.default_content_type) as BlockContentType
    const sort_order = doctorEntry?.sort_order ?? specialtyEntry?.sort_order ?? 99
    const printable = doctorEntry?.printable ?? catalogEntry.default_printable
    const send_to_patient = doctorEntry?.send_to_patient ?? catalogEntry.default_send_to_patient

    blocks.push({
      key: cat.key,
      label,
      content_type,
      enabled,
      sort_order,
      printable,
      send_to_patient,
    })
  }

  // Ordenar por sort_order ascendente, con key como desempate
  blocks.sort((a, b) => a.sort_order - b.sort_order || a.key.localeCompare(b.key))

  return blocks
}

/**
 * Congela la configuración actual en un snapshot JSON para guardarla en
 * consultations.blocks_snapshot. Así, cambios futuros en la config del doctor
 * no alteran consultas viejas.
 */
export async function snapshotBlocksForConsultation(doctorId: string, specialty?: string | null) {
  const resolved = await resolveBlocksForDoctor({ doctorId, specialty })
  return resolved.map(b => ({
    key: b.key,
    label: b.label,
    content_type: b.content_type,
    sort_order: b.sort_order,
    printable: b.printable,
    send_to_patient: b.send_to_patient,
  }))
}
