import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type AIAction = 'summarize' | 'improve' | 'patient_history'

export async function POST(req: NextRequest) {
  try {
    if (!GEMINI_API_KEY) {
      return NextResponse.json({ error: 'API key de Gemini no configurada' }, { status: 500 })
    }

    // Verify authenticated doctor
    const authHeader = req.headers.get('authorization')
    const token = authHeader?.replace('Bearer ', '')
    if (!token) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token)
    if (authErr || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const body = await req.json()
    const { action, content, patientId, consultationId } = body as {
      action: AIAction
      content?: string
      patientId?: string
      consultationId?: string
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

        // Fetch patient's consultation history
        const { data: consultations } = await supabaseAdmin
          .from('consultations')
          .select('consultation_date, chief_complaint, diagnosis, treatment, notes')
          .eq('doctor_id', user.id)
          .eq('patient_id', patientId)
          .order('consultation_date', { ascending: false })
          .limit(20)

        // Fetch patient info
        const { data: patient } = await supabaseAdmin
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

    // Call Gemini API
    const geminiRes = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 2048,
        },
      }),
    })

    if (!geminiRes.ok) {
      const errText = await geminiRes.text()
      console.error('Gemini API error:', errText)
      return NextResponse.json({ error: 'Error al conectar con Gemini' }, { status: 500 })
    }

    const geminiData = await geminiRes.json()
    const result = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || 'Sin respuesta de la IA'

    return NextResponse.json({ result })
  } catch (err) {
    console.error('AI route error:', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
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
