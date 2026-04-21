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

  for (const cat of catalog) {
    const catalogEntry = cat as any
    const specialtyEntry = specialtyMap.get(cat.key) as any
    const doctorEntry = doctorMap.get(cat.key) as any

    // Resolución de enabled (cascada)
    let enabled: boolean
    if (doctorEntry) {
      enabled = doctorEntry.enabled
    } else if (specialtyEntry) {
      enabled = specialtyEntry.enabled
    } else {
      // Si no hay ni config doctor ni specialty default, el bloque NO aparece
      // salvo que sea del catálogo genérico y no haya specialty definida
      enabled = !specialty  // Sin specialty → mostramos todo el catálogo activo
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
