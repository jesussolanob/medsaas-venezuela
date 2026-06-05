'use client'

/**
 * NewAppointmentFlow — componente ÚNICO para crear citas desde cualquier punto
 * de entrada (dashboard doctor, agenda, ficha paciente, admin).
 *
 * MIGRADO (sin Supabase):
 *   - supabase.auth.getUser()       → DEV_DOCTOR_UUID fallback (Etapa 1)
 *   - supabase.from('patients')     → fetch /api/patients (thin-proxy → NestJS)
 *   - supabase.from('pricing_plans')→ degradado a plan genérico estático
 *   - supabase.from('doctor_offices')→ degradado a horarios genéricos
 *   - supabase.from('appointments') → degradado (sin precarga de slots ocupados)
 *   - supabase.from('patient_packages')→ fetch /api/doctor/patient-packages
 *   - supabase.storage (receipts)   → degradado (receiptUrl siempre null; el doctor
 *     sube el comprobante por otra vía hasta que exista un endpoint de storage)
 *   - supabase.auth.getSession()    → removido (no necesario para /api/book)
 *
 * FASE futura: cuando existan thin-proxy handlers para:
 *   GET /api/doctor/offices  → restaurar carga real de consultorios
 *   GET /api/doctor/services → restaurar carga real de planes de precio
 *   GET /api/appointments    → restaurar precarga de slots ocupados
 *   POST /api/storage/upload → restaurar upload de comprobante
 *
 * Estilo acordeón: todas las secciones visibles, se expanden al completar la anterior.
 */

import { useEffect, useState } from 'react'
import {
  X, Loader2, Search, UserPlus, Calendar, CheckCircle2, AlertCircle,
  Check, Clock, Upload, FileText, User, Pill, MapPin, CreditCard,
  ChevronLeft, ChevronRight,
} from 'lucide-react'
import CedulaInput from '@/components/shared/CedulaInput'
import PhoneInput from '@/components/shared/PhoneInput'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type AppointmentOrigin =
  | 'dashboard_btn'
  | 'agenda_slot'
  | 'agenda_btn'
  | 'patient_sheet'
  | 'admin_panel'

export type AppointmentContext = {
  patientId?: string
  doctorId?: string
  slotStart?: string
  packageId?: string
  origin: AppointmentOrigin
}

type Props = {
  open: boolean
  onClose: () => void
  onSuccess?: (appointmentId: string) => void
  initialContext: AppointmentContext
}

type PatientLookup = {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  cedula: string | null
}

type PricingPlan = {
  id: string
  name: string
  price_usd: number
  duration_minutes: number | null
  sessions_count: number
}

type PatientPackageInfo = {
  id: string
  plan_name: string
  total_sessions: number
  used_sessions: number
}

type ScheduleDay = { day: number; start: string; end: string; enabled: boolean }
type DoctorOffice = {
  id: string
  name: string
  address: string
  schedule?: ScheduleDay[] | null
  slot_duration?: number | null
  buffer_minutes?: number | null
}

// Fallback doctor UUID (Etapa 1 dev-stub).
// When initialContext.doctorId is not provided, the server-side BFF attaches
// the real doctor ID via the x-dev-user-id header on each request.
const FALLBACK_DEV_DOCTOR_UUID = '00000000-0000-4000-8000-000000000001';

// BD usa day=0→lunes … day=6→domingo; Date.getDay() usa 0=domingo.
function jsDayToScheduleDay(jsDay: number): number {
  return jsDay === 0 ? 6 : jsDay - 1
}

function generateTimeSlots(start: string, end: string, intervalMin: number): string[] {
  const out: string[] = []
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  if (isNaN(sh) || isNaN(eh)) return []
  const startTotal = sh * 60 + (sm || 0)
  const endTotal = eh * 60 + (em || 0)
  const step = Math.max(15, intervalMin || 30)
  for (let t = startTotal; t < endTotal; t += step) {
    const h = String(Math.floor(t / 60)).padStart(2, '0')
    const m = String(t % 60).padStart(2, '0')
    out.push(`${h}:${m}`)
  }
  return out
}

const GENERIC_TIMES = [
  '08:00','08:30','09:00','09:30','10:00','10:30','11:00','11:30',
  '14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30',
]

// Plan genérico de fallback cuando el backend no devuelve planes configurados.
const GENERIC_PLAN: PricingPlan = {
  id: 'generic',
  name: 'Consulta General',
  price_usd: 20,
  duration_minutes: 30,
  sessions_count: 1,
}

const METHODS_WITH_RECEIPT = ['pago_movil', 'transferencia', 'zelle', 'binance']

// ---------------------------------------------------------------------------
// AccordionSection
// ---------------------------------------------------------------------------

function AccordionSection({
  step, currentStep, title, icon: Icon, summary, completed, onOpen, children,
}: {
  step: number
  currentStep: number
  title: string
  icon: React.ComponentType<{ className?: string }>
  summary?: string
  completed: boolean
  onOpen: () => void
  children: React.ReactNode
}) {
  const isOpen = currentStep === step
  const isPast = completed && !isOpen
  const isFuture = !completed && !isOpen

  return (
    <div className={`rounded-xl overflow-hidden transition-all ${
      isOpen ? 'shadow-md bg-white ring-2 ring-teal-400'
      : isPast ? 'bg-white ring-1 ring-emerald-200'
      : 'bg-slate-50 ring-1 ring-slate-200'
    }`}>
      <button
        type="button"
        onClick={isPast || isOpen ? onOpen : undefined}
        disabled={isFuture}
        className={`w-full flex items-center gap-3 px-4 py-3 text-left ${
          isPast ? 'cursor-pointer hover:bg-emerald-50/50' : isFuture ? 'cursor-default opacity-50' : ''
        }`}
      >
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
          isPast ? 'bg-emerald-500' : isOpen ? 'bg-teal-500' : 'bg-slate-200'
        }`}>
          {isPast
            ? <Check className="w-4 h-4 text-white" />
            : <Icon className={`w-4 h-4 ${isOpen ? 'text-white' : 'text-slate-400'}`} />
          }
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${isPast ? 'text-emerald-700' : isOpen ? 'text-slate-900' : 'text-slate-400'}`}>
            {step}. {title}
          </p>
          {summary && (isPast || isOpen) && (
            <p className="text-xs text-slate-500 mt-0.5 truncate">{summary}</p>
          )}
        </div>
        {isPast && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
      </button>
      {isOpen && <div className="px-4 pb-4 pt-1 border-t border-slate-100">{children}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function NewAppointmentFlow({ open, onClose, onSuccess, initialContext }: Props) {
  const [currentStep, setCurrentStep] = useState(1)
  const [doctorId, setDoctorId] = useState(initialContext.doctorId || '')
  const [submitting, setSubmitting] = useState(false)
  const [globalError, setGlobalError] = useState<string | null>(null)

  // Step 1: Paciente
  const [patientQuery, setPatientQuery] = useState('')
  const [patientResults, setPatientResults] = useState<PatientLookup[]>([])
  const [selectedPatient, setSelectedPatient] = useState<PatientLookup | null>(null)
  const [searchingPatients, setSearchingPatients] = useState(false)
  const [showInlineCreator, setShowInlineCreator] = useState(false)
  const [newPatient, setNewPatient] = useState({
    full_name: '', cedula: '', email: '', phone: '', birth_date: '', sex: '',
  })
  const [creatingPatient, setCreatingPatient] = useState(false)

  // Step 2: Fecha y hora
  const [scheduledAt, setScheduledAt] = useState(initialContext.slotStart || '')
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [selectedTime, setSelectedTime] = useState<string>('')
  const [weekOffset, setWeekOffset] = useState<number>(0)
  // FASE futura: precargar slots ocupados via GET /api/appointments
  const bookedSlots = new Set<string>()

  // Step 3: Modalidad
  const [mode, setMode] = useState<'presencial' | 'online'>('presencial')
  // FASE futura: cargar consultorios via GET /api/doctor/offices
  const offices: DoctorOffice[] = []
  const selectedOffice: DoctorOffice | null = null

  // Step 4: Motivo
  const [chiefComplaint, setChiefComplaint] = useState('')

  // Step 5: Plan + paquete
  // FASE futura: cargar planes via GET /api/doctor/services
  const pricingPlans: PricingPlan[] = [GENERIC_PLAN]
  const [selectedPlan, setSelectedPlan] = useState<PricingPlan | null>(GENERIC_PLAN)
  const [packages, setPackages] = useState<PatientPackageInfo[]>([])
  const [usePackage, setUsePackage] = useState<string | null>(initialContext.packageId || null)

  // Step 6: Pago
  const [paymentMethod, setPaymentMethod] = useState('efectivo')
  const [paymentReference, setPaymentReference] = useState('')
  // FASE futura: upload a /api/storage/upload cuando exista el endpoint
  const [receiptFile, setReceiptFile] = useState<File | null>(null)

  // ── Inicialización ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    setCurrentStep(1)
    setGlobalError(null)

    // Resolver doctorId: usar el del contexto, o el fallback dev UUID.
    // En Etapa 1, el servidor aplica el doctor real vía x-dev-user-id header.
    if (!doctorId) {
      setDoctorId(initialContext.doctorId || FALLBACK_DEV_DOCTOR_UUID)
    }

    if (initialContext.patientId) {
      // Cargar paciente pre-seleccionado desde el backend
      fetch(`/api/patients/${initialContext.patientId}`)
        .then(r => r.ok ? r.json() : null)
        .then(json => {
          if (json?.data) {
            setSelectedPatient(json.data as PatientLookup)
            setCurrentStep(2)
          }
        })
        .catch(() => {
          // Degradar: si falla, el usuario busca manualmente
        })
    }
  }, [open])

  // ── Cuando cambia date/time → sincroniza scheduledAt ──────────────────────
  useEffect(() => {
    if (!selectedDate || !selectedTime) return
    const [y, mo, d] = selectedDate.split('-').map(Number)
    const [h, mi] = selectedTime.split(':').map(Number)
    const local = new Date(y, mo - 1, d, h, mi, 0, 0)
    setScheduledAt(local.toISOString())
  }, [selectedDate, selectedTime])

  // ── Paquetes del paciente ──────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedPatient || !open) return
    fetch(`/api/doctor/patient-packages?patient_id=${selectedPatient.id}`)
      .then(r => r.ok ? r.json() : { data: [] })
      .then(json => {
        const list: PatientPackageInfo[] = (json.data || []).filter(
          (p: PatientPackageInfo) => p.used_sessions < p.total_sessions
        )
        setPackages(list)
      })
      .catch(() => setPackages([]))
  }, [selectedPatient, open])

  // ── Búsqueda de pacientes debounced ───────────────────────────────────────
  useEffect(() => {
    if (!patientQuery || patientQuery.length < 2) {
      setPatientResults([])
      return
    }
    setSearchingPatients(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/patients?search=${encodeURIComponent(patientQuery)}&limit=8`)
        const json = res.ok ? await res.json() : {}
        // Backend devuelve { data: { patients: [...], meta: { total } } } o similar
        const patients: PatientLookup[] =
          json?.data?.patients || json?.data || json?.patients || []
        setPatientResults(patients)
      } catch {
        setPatientResults([])
      } finally {
        setSearchingPatients(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [patientQuery])

  if (!open) return null

  // ── Crear paciente inline ──────────────────────────────────────────────────
  async function createPatientInline(e: React.FormEvent) {
    e.preventDefault()
    setCreatingPatient(true)
    setGlobalError(null)
    try {
      const res = await fetch('/api/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: newPatient.full_name,
          cedula: newPatient.cedula || undefined,
          email: newPatient.email || undefined,
          phone: newPatient.phone || undefined,
          birth_date: newPatient.birth_date || undefined,
          sex: newPatient.sex || undefined,
          source: 'inline_booking',
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        // Si el backend retorna un paciente existente (409 duplicate / 200 upsert)
        if (json?.data) {
          const p = json.data as PatientLookup
          setSelectedPatient(p)
          setShowInlineCreator(false)
          setCurrentStep(2)
          setGlobalError(`Usando paciente existente: ${p.full_name}`)
          return
        }
        throw new Error(json?.error?.message || json?.message || 'Error al crear paciente')
      }
      const created = json?.data as PatientLookup
      if (!created) throw new Error('Respuesta inesperada del servidor')
      setSelectedPatient(created)
      setShowInlineCreator(false)
      setCurrentStep(2)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al crear paciente'
      setGlobalError(msg)
    } finally {
      setCreatingPatient(false)
    }
  }

  // ── Submit final ────────────────────────────────────────────────────────────
  async function submit() {
    if (!selectedPatient || !scheduledAt) {
      setGlobalError('Faltan datos obligatorios')
      return
    }
    setSubmitting(true)
    setGlobalError(null)
    try {
      // FASE futura: upload del comprobante a /api/storage/upload cuando exista.
      // Por ahora, receiptUrl siempre es null — el doctor anota la referencia textual.
      const receiptUrl: string | null = null
      if (receiptFile) {
        // Notificamos al usuario que el upload no está disponible aún.
        // No bloqueamos la creación de la cita.
        console.warn('[NewAppointmentFlow] Receipt upload pendiente backend storage — ignorando archivo')
      }

      // Crear la cita via /api/book (guest mode: envía patientName + patientEmail)
      const r = await fetch('/api/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctorId,
          // No enviamos accessToken — usamos guest mode con nombre+email
          patientName: selectedPatient.full_name,
          patientPhone: selectedPatient.phone,
          patientEmail: selectedPatient.email,
          patientCedula: selectedPatient.cedula,
          scheduledAt,
          chiefComplaint,
          planName: selectedPlan?.name || GENERIC_PLAN.name,
          planPrice: usePackage ? 0 : (selectedPlan?.price_usd ?? GENERIC_PLAN.price_usd),
          sessionsCount: selectedPlan?.sessions_count ?? GENERIC_PLAN.sessions_count,
          paymentMethod: usePackage ? 'package' : paymentMethod,
          paymentReference: usePackage ? null : (paymentReference || null),
          receiptUrl,
          appointmentMode: mode,
          packageId: usePackage,
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Error al crear cita')
      onSuccess?.(j.appointmentId)
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido'
      setGlobalError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  // ── Helpers derivados ──────────────────────────────────────────────────────
  const step1Done = !!selectedPatient
  const step2Done = !!scheduledAt
  const step3Done = mode === 'online' || (mode === 'presencial' && (offices.length === 0 || !!selectedOffice))
  const step4Done = step3Done
  const step5Done = !!selectedPlan || !!usePackage
  const step6Done =
    (!!usePackage || !!paymentMethod) &&
    (!METHODS_WITH_RECEIPT.includes(paymentMethod) || !!usePackage || !!paymentReference)

  const canSubmit = step1Done && step2Done && step3Done && step5Done && step6Done

  const fmtDateTime = (iso: string) => {
    if (!iso) return ''
    return new Date(iso).toLocaleString('es-VE', { dateStyle: 'medium', timeStyle: 'short' })
  }

  // Generar 60 días para el selector de fechas
  const days: Array<{
    date: string; weekday: string; dayNum: string; month: string; enabled: boolean
  }> = []
  const today = new Date()
  for (let i = 0; i < 60; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    days.push({
      date: `${yyyy}-${mm}-${dd}`,
      weekday: d.toLocaleDateString('es-VE', { weekday: 'short' }).toUpperCase(),
      dayNum: String(d.getDate()),
      month: d.toLocaleDateString('es-VE', { month: 'short' }).toUpperCase(),
      enabled: true, // sin config de consultorio: todos los días habilitados
    })
  }
  const PAGE_SIZE = 5
  const visibleDays = days.slice(weekOffset * PAGE_SIZE, weekOffset * PAGE_SIZE + PAGE_SIZE)
  const canPrev = weekOffset > 0
  const canNext = (weekOffset + 1) * PAGE_SIZE < days.length
  const rangeLabel = visibleDays.length > 0
    ? `${visibleDays[0].dayNum} ${visibleDays[0].month} — ${visibleDays[visibleDays.length - 1].dayNum} ${visibleDays[visibleDays.length - 1].month}`
    : ''

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-50 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
        style={{ fontFamily: "'Inter', sans-serif" }}
      >
        {/* Header */}
        <div
          className="sticky top-0 z-10 px-5 py-4 flex items-center justify-between text-white"
          style={{ background: 'linear-gradient(135deg, #06B6D4 0%, #0891b2 50%, #0E7490 100%)' }}
        >
          <div className="flex items-center gap-3">
            <svg width="28" height="28" viewBox="0 0 200 200" fill="none">
              <path d="M125 40 C75 25, 25 65, 30 120 C35 165, 75 190, 120 175" stroke="#ffffff" strokeWidth="26" strokeLinecap="round" fill="none"/>
              <path d="M145 155 C170 120, 170 70, 140 45" stroke="#FF8A65" strokeWidth="26" strokeLinecap="round" fill="none"/>
            </svg>
            <div>
              <h2 className="text-lg font-bold">Nueva consulta</h2>
              <p className="text-xs text-white/80">Completa los pasos para agendar</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/15 rounded transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {globalError && (
          <div className="mx-5 mt-4 px-3 py-2 bg-red-50 text-red-700 rounded-lg text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> {globalError}
          </div>
        )}

        <div className="p-4 space-y-3">

          {/* ── PASO 1: Paciente ────────────────────────────────────────────── */}
          <AccordionSection
            step={1} currentStep={currentStep}
            title="Paciente"
            icon={User}
            completed={step1Done}
            summary={selectedPatient?.full_name}
            onOpen={() => setCurrentStep(1)}
          >
            {!showInlineCreator ? (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar por nombre, cédula, teléfono o email..."
                    value={patientQuery}
                    onChange={e => setPatientQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm"
                    autoFocus
                  />
                </div>
                {searchingPatients && <p className="text-xs text-slate-400 mt-2">Buscando...</p>}
                {patientResults.length > 0 && (
                  <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-52 overflow-y-auto mt-2">
                    {patientResults.map(p => (
                      <button
                        key={p.id}
                        onClick={() => { setSelectedPatient(p); setCurrentStep(2) }}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center justify-between"
                      >
                        <div>
                          <p className="text-sm font-medium text-slate-900">{p.full_name}</p>
                          <p className="text-xs text-slate-500">{p.email || p.phone || p.cedula || '—'}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {patientQuery.length >= 2 && !searchingPatients && patientResults.length === 0 && (
                  <div className="text-center py-4 mt-2 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                    <p className="text-sm text-slate-500 mb-3">No se encontró ningún paciente</p>
                    <button
                      onClick={() => { setShowInlineCreator(true); setNewPatient(p => ({ ...p, full_name: patientQuery })) }}
                      className="inline-flex items-center gap-2 px-3 py-1.5 bg-teal-500 hover:bg-teal-600 text-white text-xs font-semibold rounded-lg"
                    >
                      <UserPlus className="w-3.5 h-3.5" /> Crear nuevo paciente
                    </button>
                  </div>
                )}
                <button
                  onClick={() => setShowInlineCreator(true)}
                  className="mt-3 text-xs text-teal-600 hover:text-teal-700 font-semibold inline-flex items-center gap-1"
                >
                  <UserPlus className="w-3.5 h-3.5" /> Crear paciente nuevo
                </button>
              </>
            ) : (
              <form onSubmit={createPatientInline} className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">Nuevo paciente</h3>
                  <button
                    type="button"
                    onClick={() => setShowInlineCreator(false)}
                    className="text-xs text-slate-500 hover:text-slate-700"
                  >
                    ← Volver al buscador
                  </button>
                </div>
                <input
                  required
                  placeholder="Nombre completo *"
                  value={newPatient.full_name}
                  onChange={e => setNewPatient({ ...newPatient, full_name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                />
                <div className="grid grid-cols-2 gap-2">
                  <CedulaInput
                    value={newPatient.cedula}
                    onChange={v => setNewPatient({ ...newPatient, cedula: v })}
                  />
                  <PhoneInput
                    value={newPatient.phone}
                    onChange={v => setNewPatient({ ...newPatient, phone: v })}
                  />
                  <input
                    type="email"
                    placeholder="Email"
                    value={newPatient.email}
                    onChange={e => setNewPatient({ ...newPatient, email: e.target.value })}
                    className="px-3 py-2 border border-slate-200 rounded-lg text-sm col-span-2"
                  />
                  <input
                    type="date"
                    value={newPatient.birth_date}
                    onChange={e => setNewPatient({ ...newPatient, birth_date: e.target.value })}
                    className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                  <select
                    value={newPatient.sex}
                    onChange={e => setNewPatient({ ...newPatient, sex: e.target.value })}
                    className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  >
                    <option value="">Sexo</option>
                    <option value="masculino">Masculino</option>
                    <option value="femenino">Femenino</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={creatingPatient}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
                >
                  {creatingPatient
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <UserPlus className="w-4 h-4" />
                  }
                  Crear paciente y continuar
                </button>
              </form>
            )}
          </AccordionSection>

          {/* ── PASO 2: Fecha y hora ─────────────────────────────────────────── */}
          <AccordionSection
            step={2} currentStep={currentStep}
            title="Fecha y hora"
            icon={Calendar}
            completed={step2Done}
            summary={scheduledAt ? fmtDateTime(scheduledAt) : undefined}
            onOpen={() => step1Done && setCurrentStep(2)}
          >
            <div className="space-y-3">
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 flex items-start gap-2 text-xs text-blue-800">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>
                  Horarios genéricos (8am–12pm y 2pm–6pm). Configura tu consultorio en{' '}
                  <a href="/doctor/offices" className="font-bold underline">Consultorio</a>{' '}
                  para personalizarlos.
                </span>
              </div>

              {/* Selector de fecha paginado */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Selecciona el día</p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setWeekOffset(Math.max(0, weekOffset - 1))}
                      disabled={!canPrev}
                      className="w-8 h-8 rounded-xl bg-white border border-slate-200 hover:border-teal-300 hover:bg-teal-50 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                      aria-label="Semana anterior"
                    >
                      <ChevronLeft className="w-3.5 h-3.5 text-slate-600" />
                    </button>
                    <span className="text-xs font-semibold text-slate-600 min-w-[7rem] text-center">{rangeLabel}</span>
                    <button
                      type="button"
                      onClick={() => setWeekOffset(weekOffset + 1)}
                      disabled={!canNext}
                      className="w-8 h-8 rounded-xl bg-white border border-slate-200 hover:border-teal-300 hover:bg-teal-50 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                      aria-label="Semana siguiente"
                    >
                      <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {visibleDays.map(d => {
                    const isActive = selectedDate === d.date
                    return (
                      <button
                        key={d.date}
                        type="button"
                        onClick={() => { setSelectedDate(d.date); setSelectedTime('') }}
                        className={`flex flex-col items-center justify-center h-20 rounded-xl border-2 transition-all ${
                          isActive
                            ? 'bg-teal-500 text-white border-teal-500 shadow-md'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-teal-300'
                        }`}
                      >
                        <span className={`text-[10px] font-bold ${isActive ? 'text-teal-100' : 'text-slate-500'}`}>{d.weekday}</span>
                        <span className="text-2xl font-bold">{d.dayNum}</span>
                        <span className={`text-[10px] ${isActive ? 'text-teal-100' : 'text-slate-500'}`}>{d.month}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Selector de hora */}
              {selectedDate && (
                <div>
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                    Hora disponible
                  </p>
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
                    {GENERIC_TIMES.map(t => {
                      const slotKey = `${selectedDate} ${t}`
                      const isOccupied = bookedSlots.has(slotKey)
                      const isActive = selectedTime === t
                      return (
                        <button
                          key={t}
                          type="button"
                          disabled={isOccupied}
                          onClick={() => setSelectedTime(t)}
                          className={`px-2 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                            isOccupied
                              ? 'bg-slate-100 text-slate-400 border-slate-200 line-through cursor-not-allowed'
                              : isActive
                                ? 'bg-teal-500 text-white border-teal-500'
                                : 'bg-white text-slate-700 border-slate-200 hover:border-teal-300'
                          }`}
                        >
                          {t}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {scheduledAt && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="text-xs font-semibold text-emerald-800">{fmtDateTime(scheduledAt)}</span>
                </div>
              )}
              <div className="flex justify-end">
                <button
                  onClick={() => setCurrentStep(3)}
                  disabled={!scheduledAt}
                  className="px-3 py-1.5 bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
                >
                  Continuar →
                </button>
              </div>
            </div>
          </AccordionSection>

          {/* ── PASO 3: Modalidad ────────────────────────────────────────────── */}
          <AccordionSection
            step={3} currentStep={currentStep}
            title="Modalidad"
            icon={MapPin}
            completed={step3Done}
            summary={mode === 'online' ? 'Online' : 'Presencial'}
            onOpen={() => step2Done && setCurrentStep(3)}
          >
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setMode('presencial')}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold ${mode === 'presencial' ? 'bg-teal-500 text-white' : 'bg-slate-100 text-slate-600'}`}
              >
                Presencial
              </button>
              <button
                onClick={() => setMode('online')}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold ${mode === 'online' ? 'bg-teal-500 text-white' : 'bg-slate-100 text-slate-600'}`}
              >
                Online
              </button>
            </div>
            <div className="flex justify-end mt-3">
              <button
                onClick={() => setCurrentStep(4)}
                className="px-3 py-1.5 bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold rounded-lg"
              >
                Continuar →
              </button>
            </div>
          </AccordionSection>

          {/* ── PASO 4: Motivo ───────────────────────────────────────────────── */}
          <AccordionSection
            step={4} currentStep={currentStep}
            title="Motivo de consulta"
            icon={FileText}
            completed={step4Done && currentStep > 4}
            summary={chiefComplaint ? chiefComplaint.slice(0, 60) + (chiefComplaint.length > 60 ? '...' : '') : undefined}
            onOpen={() => step3Done && setCurrentStep(4)}
          >
            <textarea
              value={chiefComplaint}
              onChange={e => setChiefComplaint(e.target.value)}
              placeholder="¿Qué trae al paciente? (opcional)"
              rows={3}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none"
            />
            <div className="flex justify-end mt-3">
              <button
                onClick={() => setCurrentStep(5)}
                className="px-3 py-1.5 bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold rounded-lg"
              >
                Continuar →
              </button>
            </div>
          </AccordionSection>

          {/* ── PASO 5: Plan / paquete ───────────────────────────────────────── */}
          <AccordionSection
            step={5} currentStep={currentStep}
            title="Plan de consulta"
            icon={Pill}
            completed={step5Done && currentStep > 5}
            summary={usePackage ? 'Con paquete' : selectedPlan ? `${selectedPlan.name} — $${selectedPlan.price_usd}` : undefined}
            onOpen={() => step4Done && setCurrentStep(5)}
          >
            {packages.length > 0 && (
              <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 mb-3 space-y-2">
                <p className="text-xs font-semibold text-violet-800 uppercase tracking-wider">Paquete activo</p>
                {packages.map(p => (
                  <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={usePackage === p.id}
                      onChange={() => setUsePackage(usePackage === p.id ? null : p.id)}
                      className="accent-violet-600"
                    />
                    <span className="text-sm text-slate-900">
                      {p.plan_name} — queda {p.total_sessions - p.used_sessions} de {p.total_sessions}
                    </span>
                  </label>
                ))}
              </div>
            )}
            {!usePackage && (
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Tipo de consulta</label>
                <select
                  value={selectedPlan?.id || ''}
                  onChange={e => setSelectedPlan(pricingPlans.find(p => p.id === e.target.value) || GENERIC_PLAN)}
                  className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm"
                >
                  {pricingPlans.map(p => (
                    <option key={p.id} value={p.id}>{p.name} — ${p.price_usd}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex justify-end mt-3">
              <button
                onClick={() => setCurrentStep(6)}
                disabled={!step5Done}
                className="px-3 py-1.5 bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
              >
                Continuar →
              </button>
            </div>
          </AccordionSection>

          {/* ── PASO 6: Pago + comprobante ───────────────────────────────────── */}
          <AccordionSection
            step={6} currentStep={currentStep}
            title="Método de pago"
            icon={CreditCard}
            completed={step6Done && currentStep > 6}
            summary={usePackage ? 'Cubierto por paquete' : paymentMethod + (paymentReference ? ` · ${paymentReference}` : '')}
            onOpen={() => step5Done && setCurrentStep(6)}
          >
            {usePackage ? (
              <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 text-sm text-violet-800">
                Esta consulta está cubierta por el paquete prepagado. No requiere pago adicional.
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Método</label>
                  <select
                    value={paymentMethod}
                    onChange={e => setPaymentMethod(e.target.value)}
                    className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  >
                    <option value="efectivo">Efectivo</option>
                    <option value="pos">Punto de venta</option>
                    <option value="pago_movil">Pago Móvil</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="zelle">Zelle</option>
                    <option value="binance">Binance / USDT</option>
                    <option value="courtesy">Cortesía</option>
                  </select>
                </div>

                {METHODS_WITH_RECEIPT.includes(paymentMethod) && (
                  <>
                    <div>
                      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Referencia del pago</label>
                      <input
                        type="text"
                        value={paymentReference}
                        onChange={e => setPaymentReference(e.target.value)}
                        placeholder="Nº de referencia o hash"
                        className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                        Comprobante (foto o PDF)
                      </label>
                      <label className="mt-1 flex items-center gap-2 px-3 py-2 border-2 border-dashed border-slate-200 rounded-lg text-sm text-slate-600 cursor-pointer hover:bg-slate-50">
                        <Upload className="w-4 h-4" />
                        {receiptFile ? receiptFile.name : 'Subir comprobante...'}
                        <input
                          type="file"
                          accept="image/*,application/pdf"
                          className="hidden"
                          onChange={e => setReceiptFile(e.target.files?.[0] || null)}
                        />
                      </label>
                      {receiptFile && (
                        <>
                          <p className="text-[10px] text-amber-600 mt-1">
                            El upload de comprobante está pendiente de integración. La referencia textual se guardará.
                          </p>
                          <button
                            type="button"
                            onClick={() => setReceiptFile(null)}
                            className="text-xs text-red-500 mt-1"
                          >
                            Quitar archivo
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="flex justify-end mt-4 gap-2">
              <button
                onClick={submit}
                disabled={submitting || !canSubmit}
                className="px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50 flex items-center gap-2"
              >
                {submitting
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <CheckCircle2 className="w-4 h-4" />
                }
                Crear consulta
              </button>
            </div>
          </AccordionSection>
        </div>
      </div>
    </div>
  )
}
