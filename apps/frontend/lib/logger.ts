// AUDIT FIX 2026-04-28 (I-8): logger con scrub de IDs/PII para producción.
// Reemplazo de console.* que lekean datos del paciente (cedula, phone, email,
// patient_id, auth_user_id) en logs de Vercel/CloudWatch.
//
// Uso:
//   import { log } from '@/lib/logger'
//   log.info('saveRecipe insertando', { consultationId, patientId })
//
// En producción los valores se redactan; en desarrollo se muestran completos.

const SENSITIVE_KEYS = new Set([
  'patient_id',
  'patientId',
  'auth_user_id',
  'authUserId',
  'cedula',
  'phone',
  'email',
  'patient_email',
  'patient_phone',
  'patient_cedula',
  'doctor_id',
  'doctorId',
])

const isProd = process.env.NODE_ENV === 'production'

function maskId(value: unknown): unknown {
  if (typeof value !== 'string') return value
  if (value.length <= 8) return '***'
  return `${value.slice(0, 4)}…${value.slice(-2)}`
}

function maskScalar(key: string, value: unknown): unknown {
  if (!SENSITIVE_KEYS.has(key)) return value
  return maskId(value)
}

function scrub(input: unknown): unknown {
  if (input === null || input === undefined) return input
  if (Array.isArray(input)) return input.map(scrub)
  if (typeof input === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.has(k) ? maskScalar(k, v) : scrub(v)
    }
    return out
  }
  return input
}

function emit(level: 'log' | 'warn' | 'error' | 'info', label: string, payload?: unknown) {
  const data = isProd && payload !== undefined ? scrub(payload) : payload
  if (payload === undefined) {
    console[level](label)
  } else {
    console[level](label, data)
  }
}

export const log = {
  info: (label: string, payload?: unknown) => emit('info', label, payload),
  warn: (label: string, payload?: unknown) => emit('warn', label, payload),
  error: (label: string, payload?: unknown) => emit('error', label, payload),
  debug: (label: string, payload?: unknown) => {
    if (!isProd) emit('log', label, payload)
  },
}
