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

type AIAction = 'summarize' | 'improve' | 'patient_history'

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

    const body = await req.json()
    const { action, content, patientId } = body as {
      action: AIAction
      content?: string
      patientId?: string
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

      case 'patient_history': {
        if (!patientId) return NextResponse.json({ error: 'ID de paciente requerido' }, { status: 400 })

        // Fetch patient's consultation history (uses RLS with doctor's token)
        const { data: consultations, error: consultErr } = await supabase
          .from('consultations')
          .select('consultation_date, chief_complaint, diagnosis, treatment, notes')
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

        const historyText = consultations.map((c, i) => {
          const date = new Date(c.consultation_date).toLocaleDateString('es-VE', { year: 'numeric', month: 'long', day: 'numeric' })
          return `--- Consulta ${i + 1} (${date}) ---\nMotivo: ${c.chief_complaint || 'No registrado'}\nDiagnóstico: ${stripHtml(c.diagnosis || 'No registrado')}\nTratamiento: ${stripHtml(c.treatment || 'No registrado')}\nNotas: ${stripHtml(c.notes || 'Sin notas')}`
        }).join('\n\n')

        prompt = `Eres un asistente médico. Analiza el historial de consultas de este paciente y genera un resumen ejecutivo útil para el médico. Incluye: patrones relevantes, evolución del paciente, diagnósticos recurrentes, y cualquier dato que el médico debe tener presente para la consulta actual. Sé conciso y práctico. Responde en español.\n\n${patientInfo}\n\nHistorial de consultas (${consultations.length} consultas):\n${historyText}`
        break
      }

      default:
        return NextResponse.json({ error: 'Acción no válida' }, { status: 400 })
    }

    // Cache hit?
    const cacheKey = `${action}:${(content || patientId || '').slice(0, 200)}`
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
