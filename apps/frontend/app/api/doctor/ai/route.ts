import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// 2026-04-26: gemini-1.5-flash retired. Free tier: gemini-2.5-flash-lite tiene mayor cuota
// que gemini-2.0-flash. Si 429 → fallback automático al modelo siguiente.
// Free tier limits (RPM = req/min, RPD = req/día):
//   gemini-2.5-flash-lite:  15 RPM · 1500 RPD  ← default (más cuota)
//   gemini-2.5-flash:       10 RPM · 250 RPD
//   gemini-2.0-flash:       15 RPM · 1500 RPD
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite'
const GEMINI_FALLBACK_MODEL = 'gemini-2.0-flash'
const buildUrl = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`

// Cache simple en memoria — evita re-llamar Gemini con el mismo prompt en 5 min
const promptCache = new Map<string, { result: string; expires: number }>()
const CACHE_TTL_MS = 5 * 60 * 1000
function getCached(key: string): string | null {
  const entry = promptCache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expires) { promptCache.delete(key); return null }
  return entry.result
}
function setCached(key: string, result: string) {
  promptCache.set(key, { result, expires: Date.now() + CACHE_TTL_MS })
  // Cleanup si se llena (max 50 entradas)
  if (promptCache.size > 50) {
    const oldest = promptCache.keys().next().value
    if (oldest) promptCache.delete(oldest)
  }
}

async function callGeminiWithRetry(apiKey: string, prompt: string): Promise<{ ok: true; text: string } | { ok: false; status: number; body: string }> {
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
  })

  // Intento 1: modelo principal
  for (const model of [GEMINI_MODEL, GEMINI_FALLBACK_MODEL]) {
    try {
      const res = await fetch(`${buildUrl(model)}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
      if (res.ok) {
        const data = await res.json()
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Sin respuesta de la IA'
        return { ok: true, text }
      }
      // 429 → probar siguiente modelo. Otros errores → retornar
      if (res.status !== 429) {
        const errBody = await res.text()
        return { ok: false, status: res.status, body: errBody }
      }
      console.warn(`[AI] Modelo ${model} retornó 429, probando fallback...`)
    } catch (e: any) {
      console.error(`[AI] Error llamando ${model}:`, e?.message)
    }
  }
  return { ok: false, status: 429, body: 'Todos los modelos retornaron 429 (cuota agotada)' }
}

// L1 (2026-04-29): nueva accion `summarize_report` para el panel unificado.
type AIAction = 'summarize' | 'improve' | 'patient_history' | 'improve_block' | 'summarize_report'

// AUDIT FIX 2026-04-29 (IA-blocks): prompt-builder por block_key.
// Cada bloque del catálogo tiene un prompt específico que enfatiza lo que
// importa clínicamente para ese tipo de información. Si llega una key
// desconocida, caemos a un prompt genérico de mejora médica.
function buildBlockPrompt(blockKey: string, blockLabel: string, content: string): string {
  const cleaned = stripHtml(content)
  const base = (instruction: string) =>
    `Eres un asistente de redacción médica profesional. ${instruction} Mantén toda la información clínica intacta — NO inventes datos que no estén en el texto original. Responde en español (Venezuela) y devuelve SOLO el texto mejorado, sin explicaciones, encabezados, ni comillas.\n\nTexto original (${blockLabel}):\n${cleaned}`

  switch (blockKey) {
    case 'chief_complaint':
      return base('Reescribe el motivo de consulta de forma clara, concisa y en lenguaje médico apropiado. Estructura los síntomas con su tiempo de evolución, intensidad y factores asociados cuando estén presentes.')
    case 'history':
      return base('Mejora la redacción de los antecedentes del paciente. Organízalos en categorías (personales, familiares, quirúrgicos, alérgicos, hábitos) cuando aplique, y usa terminología médica estandarizada.')
    case 'physical_exam':
      return base('Mejora la redacción del examen físico. Estructura los hallazgos por sistemas (general, cardiopulmonar, abdominal, neurológico, etc.) y usa terminología semiológica precisa.')
    case 'diagnosis':
      return base('Mejora la redacción del diagnóstico clínico. Sé preciso, usa terminología CIE-10 cuando sea posible, distingue diagnóstico principal de diagnósticos secundarios o diferenciales si los hay.')
    case 'treatment':
      return base('Mejora la redacción del plan terapéutico. Estructura el tratamiento (farmacológico, no farmacológico, medidas generales) de forma clara y organizada.')
    case 'prescription':
      return base('Mejora la redacción de la prescripción. Asegúrate que cada medicamento tenga: nombre genérico, dosis, vía, frecuencia y duración. Mantén el formato profesional de receta médica.')
    case 'rest':
      return base('Mejora la redacción del reposo indicado. Especifica tipo de reposo (absoluto/relativo/laboral), duración y motivo clínico de forma profesional.')
    case 'tasks':
      return base('Mejora la redacción de las tareas terapéuticas para el paciente. Sé claro y específico en lo que el paciente debe hacer, con instrucciones accionables y medibles.')
    case 'nutrition_plan':
      return base('Mejora la redacción del plan alimenticio. Estructura por comidas (desayuno, merienda, almuerzo, cena), enfatiza balance nutricional, porciones, alimentos recomendados y a evitar.')
    case 'exercises':
      return base('Mejora la redacción de la rutina de ejercicios. Especifica tipo de ejercicio, series, repeticiones, frecuencia semanal, progresión y precauciones cuando apliquen.')
    case 'indications':
      return base('Mejora la redacción de las indicaciones generales al paciente. Usa lenguaje claro, lista los puntos cuando sean varios y enfatiza signos de alarma si los hay.')
    case 'recommendations':
      return base('Mejora la redacción de las recomendaciones complementarias. Sé práctico, accionable y prioriza lo más importante para el paciente.')
    case 'requested_exams':
      return base('Mejora la redacción de los exámenes solicitados. Usa el nombre completo y estandarizado de cada estudio (laboratorio, imagen, especiales) y agrupa por tipo cuando aplique.')
    case 'next_followup':
      return base('Mejora la redacción de la próxima cita / control. Especifica fecha aproximada, motivo del control y qué debe traer el paciente si aplica.')
    case 'internal_notes':
      return base('Mejora la redacción de las notas internas del médico. Estas notas son privadas (no se comparten con el paciente) — sé directo, técnico y enfócate en seguimiento, pendientes y consideraciones clínicas.')
    default:
      return base(`Mejora la redacción de este bloque clínico (${blockLabel}). Hazlo más profesional, claro y estructurado.`)
  }
}

export async function POST(req: NextRequest) {
  try {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY
    if (!GEMINI_API_KEY) {
      return NextResponse.json({ error: 'API key de Gemini no configurada. Agrega GEMINI_API_KEY en las variables de entorno.' }, { status: 500 })
    }

    // Create supabase client with user's token for RLS
    const authHeader = req.headers.get('authorization')
    const token = authHeader?.replace('Bearer ', '')
    if (!token) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    )

    // Verify user
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    // AUDIT FIX 2026-04-28 (I-5): rate limit en BD — 10 requests / 60s por usuario.
    // El cache en memoria por sí solo no protege contra prompts distintos.
    {
      const since = new Date(Date.now() - 60_000).toISOString()
      const { count: recent } = await supabase
        .from('ai_request_log')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', since)
      if ((recent ?? 0) >= 10) {
        return NextResponse.json(
          { error: 'Demasiadas solicitudes a la IA. Espera un minuto e inténtalo de nuevo.' },
          { status: 429, headers: { 'Retry-After': '60' } }
        )
      }
      await supabase.from('ai_request_log').insert({ user_id: user.id })
    }

    const body = await req.json()
    // AUDIT FIX 2026-04-29 (IA-blocks): aceptamos block_key + block_label
    // para construir prompts específicos por tipo de bloque.
    // L1 (2026-04-29): nuevos campos `blocks_data` y `blocks_meta` para los modos
    // unificados de IA (resumir informe + historial enriquecido).
    const { action, content, patientId, block_key, block_label, blocks_data, blocks_meta, legacy } = body as {
      action: AIAction
      content?: string
      patientId?: string
      block_key?: string
      block_label?: string
      blocks_data?: Record<string, unknown>
      blocks_meta?: Array<{ key: string; label: string; printable?: boolean }>
      legacy?: { chief_complaint?: string | null; notes?: string | null; diagnosis?: string | null; treatment?: string | null }
    }

    let prompt = ''

    switch (action) {
      case 'summarize': {
        if (!content) return NextResponse.json({ error: 'Contenido requerido' }, { status: 400 })
        prompt = `Eres un asistente médico. Resume el siguiente informe médico en un párrafo claro y conciso para que el paciente pueda entenderlo fácilmente. Usa lenguaje sencillo, evita jerga médica cuando sea posible, y mantén los datos importantes. Responde en español.\n\nInforme:\n${stripHtml(content)}`
        break
      }

      case 'improve': {
        if (!content) return NextResponse.json({ error: 'Contenido requerido' }, { status: 400 })
        prompt = `Eres un asistente de redacción médica profesional. Mejora la redacción del siguiente texto médico: corrige gramática, mejora la estructura, hazlo más profesional y claro, pero mantén toda la información médica intacta. Responde en español y devuelve SOLO el texto mejorado, sin explicaciones adicionales.\n\nTexto original:\n${stripHtml(content)}`
        break
      }

      case 'improve_block': {
        // AUDIT FIX 2026-04-29 (IA-blocks): mejora con prompt específico
        // por tipo de bloque (diagnosis vs nutrition_plan vs exercises, etc).
        if (!content || !content.trim()) {
          return NextResponse.json({ error: 'El bloque está vacío. Escribe algo antes de mejorar con IA.' }, { status: 400 })
        }
        if (!block_key) {
          return NextResponse.json({ error: 'block_key requerido' }, { status: 400 })
        }
        prompt = buildBlockPrompt(block_key, block_label || block_key, content)
        break
      }

      case 'patient_history': {
        if (!patientId) return NextResponse.json({ error: 'ID de paciente requerido' }, { status: 400 })

        // L1 (2026-04-29): incluir blocks_data + blocks_snapshot en el contexto.
        // Antes solo leiamos 5 campos legacy, ahora la IA tambien recibe el contenido
        // de los bloques dinamicos (15+ tipos: examen fisico, plan nutricional, ejercicios, etc.).
        const { data: consultations, error: consultErr } = await supabase
          .from('consultations')
          .select('consultation_date, chief_complaint, diagnosis, treatment, notes, blocks_data, blocks_snapshot')
          .eq('doctor_id', user.id)
          .eq('patient_id', patientId)
          .order('consultation_date', { ascending: false })
          .limit(20)

        if (consultErr) {
          console.error('Error fetching consultations:', consultErr)
        }

        // Fetch patient info
        const { data: patient } = await supabase
          .from('patients')
          .select('full_name, age, sex, blood_type, allergies, chronic_conditions')
          .eq('id', patientId)
          .eq('doctor_id', user.id)
          .single()

        if (!consultations || consultations.length === 0) {
          return NextResponse.json({ result: 'Este paciente no tiene consultas anteriores registradas.' })
        }

        const patientInfo = patient ? `Paciente: ${patient.full_name}${patient.age ? `, ${patient.age} años` : ''}${patient.sex ? `, ${patient.sex === 'male' ? 'masculino' : patient.sex === 'female' ? 'femenino' : patient.sex}` : ''}${patient.blood_type ? `, tipo de sangre ${patient.blood_type}` : ''}${patient.allergies ? `\nAlergias: ${patient.allergies}` : ''}${patient.chronic_conditions ? `\nCondiciones crónicas: ${patient.chronic_conditions}` : ''}` : ''

        const historyText = consultations.map((c: any, i: number) => {
          const date = new Date(c.consultation_date).toLocaleDateString('es-VE', { year: 'numeric', month: 'long', day: 'numeric' })
          let txt = `--- Consulta ${i + 1} (${date}) ---\nMotivo: ${stripHtml(c.chief_complaint || 'No registrado')}\nDiagnóstico: ${stripHtml(c.diagnosis || 'No registrado')}\nTratamiento: ${stripHtml(c.treatment || 'No registrado')}\nNotas: ${stripHtml(c.notes || 'Sin notas')}`
          // L1 (2026-04-29): serializar bloques dinamicos (blocks_data + blocks_snapshot)
          // para que la IA tenga acceso al examen fisico, plan nutricional, ejercicios, etc.
          const bd = c.blocks_data && typeof c.blocks_data === 'object' ? c.blocks_data as Record<string, unknown> : null
          const snap = Array.isArray(c.blocks_snapshot) ? c.blocks_snapshot as Array<{ key: string; label: string }> : null
          if (bd && Object.keys(bd).length > 0) {
            const labels: Record<string, string> = {}
            if (snap) snap.forEach(b => { labels[b.key] = b.label })
            const SKIP = new Set(['chief_complaint', 'diagnosis', 'treatment', 'notes', 'internal_notes'])
            const dynLines: string[] = []
            for (const [key, val] of Object.entries(bd)) {
              if (SKIP.has(key)) continue
              const label = labels[key] || key
              let serialized = ''
              if (typeof val === 'string') serialized = stripHtml(val)
              else if (Array.isArray(val)) serialized = val.map(v => `- ${typeof v === 'string' ? stripHtml(v) : JSON.stringify(v)}`).join('\n')
              else if (val && typeof val === 'object') serialized = JSON.stringify(val)
              else if (val != null) serialized = String(val)
              if (serialized.trim()) dynLines.push(`${label}: ${serialized}`)
            }
            if (dynLines.length > 0) txt += `\n${dynLines.join('\n')}`
          }
          return txt
        }).join('\n\n')

        prompt = `Eres un asistente médico. Analiza el historial integral de consultas de este paciente (incluyendo bloques dinámicos como examen físico, plan nutricional, ejercicios, indicaciones, etc.) y genera un resumen ejecutivo útil para el médico. Incluye: patrones relevantes, evolución del paciente, diagnósticos recurrentes, y cualquier dato que el médico debe tener presente para la consulta actual. Sé conciso y práctico. Responde en español.\n\n${patientInfo}\n\nHistorial de consultas (${consultations.length} consultas):\n${historyText}`
        break
      }

      case 'summarize_report': {
        // L1 (2026-04-29): nuevo modo "Resumir informe" — toma TODOS los bloques
        // de la consulta actual + chief_complaint/notes/diagnosis/treatment y arma
        // un resumen coherente para el médico.
        const sections: string[] = []
        if (legacy?.chief_complaint) sections.push(`Motivo de consulta: ${stripHtml(legacy.chief_complaint)}`)
        if (legacy?.diagnosis) sections.push(`Diagnóstico: ${stripHtml(legacy.diagnosis)}`)
        if (legacy?.treatment) sections.push(`Tratamiento: ${stripHtml(legacy.treatment)}`)
        if (legacy?.notes) sections.push(`Notas: ${stripHtml(legacy.notes)}`)
        if (blocks_data && typeof blocks_data === 'object') {
          const labels: Record<string, string> = {}
          if (Array.isArray(blocks_meta)) blocks_meta.forEach(b => { labels[b.key] = b.label })
          const SKIP = new Set(['chief_complaint', 'diagnosis', 'treatment', 'notes'])
          for (const [key, val] of Object.entries(blocks_data)) {
            if (SKIP.has(key)) continue
            const label = labels[key] || key
            let serialized = ''
            if (typeof val === 'string') serialized = stripHtml(val)
            else if (Array.isArray(val)) serialized = val.map(v => `- ${typeof v === 'string' ? stripHtml(v) : JSON.stringify(v)}`).join('\n')
            else if (val && typeof val === 'object') serialized = JSON.stringify(val)
            else if (val != null) serialized = String(val)
            if (serialized.trim()) sections.push(`${label}: ${serialized}`)
          }
        }
        if (sections.length === 0) {
          return NextResponse.json({ error: 'No hay contenido en la consulta para resumir.' }, { status: 400 })
        }
        prompt = `Eres un asistente médico. A continuación tienes el contenido completo de una consulta médica (motivo, diagnóstico, tratamiento, notas y bloques especializados). Genera un resumen coherente y profesional del informe en uno o dos párrafos, manteniendo todos los datos clínicos relevantes y usando lenguaje médico apropiado. Responde en español, sin encabezados ni listas — solo prosa profesional.\n\nContenido de la consulta:\n${sections.join('\n\n')}`
        break
      }

      default:
        return NextResponse.json({ error: 'Acción no válida' }, { status: 400 })
    }

    // Cache hit?
    // AUDIT FIX 2026-04-29 (IA-blocks): incluir block_key en la key para que
    // el mismo content bajo distintos bloques no colisione en el cache.
    const cacheKey = `${action}:${block_key || ''}:${(content || patientId || '').slice(0, 200)}`
    const cached = getCached(cacheKey)
    if (cached) {
      return NextResponse.json({ result: cached, cached: true })
    }

    // Llamar Gemini con retry + fallback automático a otro modelo si 429
    const callResult = await callGeminiWithRetry(GEMINI_API_KEY, prompt)

    if (!callResult.ok) {
      let errMsg = `Error de Gemini (${callResult.status})`
      if (callResult.status === 404) errMsg = `Modelo no encontrado. Probar otro modelo.`
      else if (callResult.status === 403) errMsg = 'API key de Gemini inválida o sin permisos.'
      else if (callResult.status === 429) errMsg = 'Cuota gratuita de Gemini agotada (1500 requests/día). Espera unos minutos o habilita facturación en Google AI Studio.'
      else if (callResult.status === 400) errMsg = 'Solicitud inválida a Gemini.'
      return NextResponse.json({ error: errMsg, debug: callResult.body.slice(0, 200) }, { status: 500 })
    }

    setCached(cacheKey, callResult.text)
    return NextResponse.json({ result: callResult.text })
  } catch (err: any) {
    console.error('AI route error:', err?.message || err)
    return NextResponse.json({ error: `Error interno: ${err?.message || 'desconocido'}` }, { status: 500 })
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()
}
