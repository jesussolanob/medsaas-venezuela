/**
 * lib/report-data.ts — RONDA 36
 *
 * Construye un SNAPSHOT INMUTABLE del informe medico a partir de:
 *   - blocks_snapshot (estructura congelada al crear la consulta)
 *   - blocks_data    (valores que el doctor llena durante la consulta)
 *
 * El resultado se guarda en consultations.report_data (JSONB) y es la unica
 * fuente que la vista del paciente y el PDF deben leer.
 *
 * Garantias:
 *   1) Independencia total de templates: si manana el doctor edita o borra su
 *      plantilla maestra, este informe queda intacto (ya tiene label, tipo y
 *      orden congelados).
 *   2) Limpieza visual: bloques sin valor no se incluyen.
 *   3) Auditable: incluye built_at + version para detectar formato a futuro.
 */

export type ReportBlockSnapshot = {
  key: string
  label: string
  content_type: 'rich_text' | 'list' | 'date' | 'file' | 'structured' | 'numeric'
  sort_order: number
  printable: boolean
  send_to_patient: boolean
}

export type ReportBlock = ReportBlockSnapshot & {
  value: unknown
}

export type ReportData = {
  version: 1
  built_at: string          // ISO timestamp
  blocks: ReportBlock[]     // ya ordenados, sin vacios
  // Campos legacy preservados para retrocompatibilidad
  legacy?: {
    chief_complaint?: string | null
    diagnosis?: string | null
    treatment?: string | null
    notes?: string | null
  }
}

/**
 * Determina si un valor de bloque esta "vacio" segun su content_type.
 * Un bloque vacio NO se incluye en el report_data — asi el paciente solo ve
 * lo que el doctor realmente lleno.
 */
export function isBlockValueEmpty(contentType: string, value: unknown): boolean {
  if (value === null || value === undefined) return true

  switch (contentType) {
    case 'list':
      // Lista: vacia si no es array o si todos los items son strings vacios
      if (!Array.isArray(value)) return true
      return value.every(v => typeof v !== 'string' || v.trim() === '')

    case 'numeric': {
      // Numerico: 0 cuenta como valor real, solo NaN/undefined/null son vacio
      const n = typeof value === 'number' ? value : Number(value)
      return !Number.isFinite(n)
    }

    case 'date':
      // Fecha: string ISO, vacio si no hay nada
      return typeof value !== 'string' || value.trim() === ''

    case 'structured':
      // Objeto estructurado: vacio si no tiene keys o todas las keys son vacias
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        const keys = Object.keys(value)
        if (keys.length === 0) return true
        return keys.every(k => {
          const v = (value as any)[k]
          return v === null || v === undefined || (typeof v === 'string' && v.trim() === '')
        })
      }
      // Si vino como string (textarea), vacio si solo whitespace o tags vacios
      if (typeof value === 'string') return value.replace(/<[^>]*>/g, '').trim() === ''
      return true

    case 'rich_text':
    case 'file':
    default:
      // String: vacio si solo whitespace; si trae HTML, quitar tags antes
      if (typeof value !== 'string') return true
      return value.replace(/<[^>]*>/g, '').trim() === ''
  }
}

/**
 * Construye el report_data inmutable a partir del snapshot + valores.
 * Esta es la funcion canonica — la usan tanto el endpoint de guardado como
 * los renderers (paciente y PDF).
 */
export function buildReportData(
  blocksSnapshot: ReportBlockSnapshot[] | null | undefined,
  blocksData: Record<string, unknown> | null | undefined,
  legacy?: ReportData['legacy'],
): ReportData {
  const snapshot = Array.isArray(blocksSnapshot) ? blocksSnapshot : []
  const values = blocksData && typeof blocksData === 'object' ? blocksData : {}

  const blocks: ReportBlock[] = snapshot
    .map(b => ({ ...b, value: (values as any)[b.key] }))
    // Filtrar vacios — un bloque sin contenido no se incluye en el informe
    .filter(b => !isBlockValueEmpty(b.content_type, b.value))
    // Solo bloques marcados send_to_patient=true salen al paciente.
    // OJO: aqui dejamos pasar todos; el filtro send_to_patient lo aplica el
    // renderer del paciente (asi el doctor sigue viendo todos los bloques).
    .sort((a, b) => a.sort_order - b.sort_order || a.key.localeCompare(b.key))

  return {
    version: 1,
    built_at: new Date().toISOString(),
    blocks,
    legacy: legacy || undefined,
  }
}

/**
 * Filtra los bloques que el paciente puede ver (send_to_patient=true).
 * El doctor ve TODOS, el paciente solo los marcados como compartibles.
 */
export function filterBlocksForPatient(report: ReportData): ReportBlock[] {
  return report.blocks.filter(b => b.send_to_patient)
}

/**
 * Renderiza el VALOR de un bloque a texto plano para previsualizacion en
 * listas (ej: cards de "Mis Informes" del paciente).
 */
export function blockValueToText(block: ReportBlock, maxLength = 150): string {
  const v = block.value
  let text = ''

  switch (block.content_type) {
    case 'list':
      text = Array.isArray(v) ? v.join(', ') : ''
      break
    case 'numeric':
      text = String(v ?? '')
      break
    case 'date':
      text = typeof v === 'string' ? new Date(v).toLocaleDateString('es-VE') : ''
      break
    case 'structured':
      if (typeof v === 'object' && v !== null) {
        text = Object.entries(v).map(([k, val]) => `${k}: ${val}`).join(' · ')
      } else if (typeof v === 'string') {
        text = v.replace(/<[^>]*>/g, '')
      }
      break
    default:
      text = typeof v === 'string' ? v.replace(/<[^>]*>/g, '') : ''
  }

  text = text.trim()
  if (text.length > maxLength) text = text.substring(0, maxLength) + '...'
  return text
}
