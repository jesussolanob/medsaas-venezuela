'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  X, Loader2, Search, UserPlus, Calendar, CheckCircle2, AlertCircle,
  ChevronDown, Check, Clock, Upload, FileText, User, Pill, MapPin, CreditCard,
  ChevronLeft, ChevronRight,
} from 'lucide-react'

/**
 * NewAppointmentFlow — componente ÚNICO para crear citas desde cualquier punto
 * de entrada (dashboard doctor, agenda, ficha paciente, admin).
 *
 * Estilo acordeón: todas las secciones visibles, se expanden al completar la anterior.
 * Cada sección muestra un resumen cuando está completa.
 */

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

// RONDA 20: ahora cargamos tambien la configuracion de horarios del consultorio
// para construir el calendario y los slots dinamicamente.
type ScheduleDay = { day: number; start: string; end: string; enabled: boolean }
type DoctorOffice = {
  id: string
  name: string
  address: string
  schedule?: ScheduleDay[] | null
  slot_duration?: number | null   // minutos entre slots
  buffer_minutes?: number | null  // espacio entre citas
}

// El schedule en BD usa day=0 → lunes, ..., day=6 → domingo.
// Date.getDay() usa 0=domingo, 1=lunes, ..., 6=sabado.
// Esta funcion convierte de Date.getDay() al indice usado en la BD.
function jsDayToScheduleDay(jsDay: number): number {
  return jsDay === 0 ? 6 : jsDay - 1
}

// Genera horarios entre start y end con incrementos de minutos.
// Ej: ('08:00', '12:00', 30) → ['08:00','08:30','09:00',...,'11:30']
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

// Horarios genericos de fallback cuando NO hay consultorio configurado.
const GENERIC_TIMES = [
  '08:00','08:30','09:00','09:30','10:00','10:30','11:00','11:30',
  '14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30',
]

// Métodos de pago que requieren comprobante
const METHODS_WITH_RECEIPT = ['pago_movil', 'transferencia', 'zelle', 'binance']

// ─── Componente de sección acordeón ─────────────────────────────────────────
function AccordionSection({
  step, currentStep, title, icon: Icon, summary, completed, onOpen, children,
}: {
  step: number
  currentStep: number
  title: string
  icon: any
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
          {isPast ? <Check className="w-4 h-4 text-white" /> : <Icon className={`w-4 h-4 ${isOpen ? 'text-white' : 'text-slate-400'}`} />}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${isPast ? 'text-emerald-700' : isOpen ? 'text-slate-900' : 'text-slate-400'}`}>
            {step}. {title}
          </p>
          {summary && (isPast || isOpen) && (
            <p className="text-xs text-slate-500 mt-0.5 truncate">{summary}</p>
          )}
        </div>
        {isPast && <ChevronDown className="w-4 h-4 text-emerald-400 shrink-0" />}
      </button>
      {isOpen && <div className="px-4 pb-4 pt-1 border-t border-slate-100">{children}</div>}
    </div>
  )
}

// ─── Componente principal ──────────────────────────────────────────────────
export default function NewAppointmentFlow({ open, onClose, onSuccess, initialContext }: Props) {
  const supabase = createClient()

  // Step control — 6 pasos
  const [currentStep, setCurrentStep] = useState(1)

  // Global
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

  // Step 2: Fecha y hora — selector tipo booking público
  const [scheduledAt, setScheduledAt] = useState(initialContext.slotStart || '')
  const [selectedDate, setSelectedDate] = useState<string>('')   // 'YYYY-MM-DD'
  const [selectedTime, setSelectedTime] = useState<string>('')   // 'HH:MM'
  // RONDA 41: paginacion semanal del selector de fechas (5 dias por pagina)
  const [weekOffset, setWeekOffset] = useState<number>(0)
  const [bookedSlots, setBookedSlots] = useState<Set<string>>(new Set()) // 'YYYY-MM-DD HH:MM'

  // Step 3: Modalidad
  const [mode, setMode] = useState<'presencial' | 'online'>('presencial')
  const [offices, setOffices] = useState<DoctorOffice[]>([])
  const [selectedOffice, setSelectedOffice] = useState<DoctorOffice | null>(null)

  // Step 4: Motivo
  const [chiefComplaint, setChiefComplaint] = useState('')

  // Step 5: Plan + paquete
  const [pricingPlans, setPricingPlans] = useState<PricingPlan[]>([])
  const [selectedPlan, setSelectedPlan] = useState<PricingPlan | null>(null)
  const [packages, setPackages] = useState<PatientPackageInfo[]>([])
  const [usePackage, setUsePackage] = useState<string | null>(initialContext.packageId || null)

  // Step 6: Pago
  const [paymentMethod, setPaymentMethod] = useState('efectivo')
  const [paymentReference, setPaymentReference] = useState('')
  const [receiptFile, setReceiptFile] = useState<File | null>(null)

  // ── Inicialización ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    setCurrentStep(1)
    setGlobalError(null)

    if (!doctorId) {
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (user) setDoctorId(user.id)
      })
    }

    if (initialContext.patientId) {
      supabase
        .from('patients')
        .select('id, full_name, email, phone, cedula')
        .eq('id', initialContext.patientId)
        .single()
        .then(({ data }) => {
          if (data) {
            setSelectedPatient(data as PatientLookup)
            setCurrentStep(2)
          }
        })
    }
  }, [open])

  // ── Carga de pricing plans y oficinas al tener doctorId ─────────────────
  useEffect(() => {
    if (!doctorId || !open) return
    ;(async () => {
      const [{ data: plans }, { data: offs }] = await Promise.all([
        supabase.from('pricing_plans')
          .select('id, name, price_usd, duration_minutes, sessions_count')
          .eq('doctor_id', doctorId).eq('is_active', true).order('price_usd'),
        supabase.from('doctor_offices')
          // RONDA 20: traer tambien schedule + slot_duration + buffer_minutes
          .select('id, name, address, schedule, slot_duration, buffer_minutes')
          .eq('doctor_id', doctorId).eq('is_active', true),
      ])
      setPricingPlans(plans || [])
      if (plans && plans.length > 0 && !selectedPlan) setSelectedPlan(plans[0])
      setOffices((offs as DoctorOffice[]) || [])
      if (offs && offs.length > 0 && !selectedOffice) setSelectedOffice(offs[0] as DoctorOffice)
    })()
  }, [doctorId, open])

  // ── Cargar slots ocupados (próximos 21 días) ───────────────────────────
  useEffect(() => {
    if (!doctorId || !open) return
    ;(async () => {
      const start = new Date()
      const end = new Date()
      end.setDate(end.getDate() + 22)
      const { data } = await supabase
        .from('appointments')
        .select('scheduled_at')
        .eq('doctor_id', doctorId)
        .in('status', ['scheduled', 'confirmed'])
        .gte('scheduled_at', start.toISOString())
        .lte('scheduled_at', end.toISOString())
      const set = new Set<string>()
      ;(data || []).forEach(a => {
        const d = new Date(a.scheduled_at)
        const yyyy = d.getFullYear()
        const mm = String(d.getMonth() + 1).padStart(2, '0')
        const dd = String(d.getDate()).padStart(2, '0')
        const hh = String(d.getHours()).padStart(2, '0')
        const mi = String(d.getMinutes()).padStart(2, '0')
        set.add(`${yyyy}-${mm}-${dd} ${hh}:${mi}`)
      })
      setBookedSlots(set)
    })()
  }, [doctorId, open])

  // ── Cuando cambia date/time, sincroniza scheduledAt ────────────────────
  useEffect(() => {
    if (!selectedDate || !selectedTime) return
    // Construir Date local (sin UTC) y convertir a ISO
    const [y, mo, d] = selectedDate.split('-').map(Number)
    const [h, mi] = selectedTime.split(':').map(Number)
    const local = new Date(y, mo - 1, d, h, mi, 0, 0)
    setScheduledAt(local.toISOString())
  }, [selectedDate, selectedTime])

  // ── Paquetes del paciente ───────────────────────────────────────────────
  useEffect(() => {
    if (!selectedPatient || !doctorId || !open) return
    ;(async () => {
      const { data } = await supabase
        .from('patient_packages')
        .select('id, plan_name, total_sessions, used_sessions')
        .eq('doctor_id', doctorId).eq('patient_id', selectedPatient.id).eq('status', 'active')
      setPackages((data || []).filter(p => p.used_sessions < p.total_sessions))
    })()
  }, [selectedPatient, doctorId, open])

  // ── Búsqueda de pacientes debounced ─────────────────────────────────────
  useEffect(() => {
    if (!patientQuery || patientQuery.length < 2 || !doctorId) {
      setPatientResults([])
      return
    }
    setSearchingPatients(true)
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('patients')
        .select('id, full_name, email, phone, cedula')
        .eq('doctor_id', doctorId)
        .or(`full_name.ilike.%${patientQuery}%,email.ilike.%${patientQuery}%,cedula.ilike.%${patientQuery}%,phone.ilike.%${patientQuery}%`)
        .limit(8)
      setPatientResults(data || [])
      setSearchingPatients(false)
    }, 250)
    return () => clearTimeout(t)
  }, [patientQuery, doctorId])

  if (!open) return null

  // ── Crear paciente inline ──────────────────────────────────────────────
  async function createPatientInline(e: React.FormEvent) {
    e.preventDefault()
    if (!doctorId) return
    setCreatingPatient(true); setGlobalError(null)
    try {
      // Detect duplicados
      if (newPatient.cedula || newPatient.email) {
        const { data: existing } = await supabase
          .from('patients')
          .select('id, full_name, email, cedula')
          .eq('doctor_id', doctorId)
          .or(`cedula.eq.${newPatient.cedula || '__none__'},email.eq.${newPatient.email || '__none__'}`)
          .limit(1)
        if (existing && existing.length > 0) {
          if (confirm(`Ya existe un paciente con esta cédula o email: ${existing[0].full_name}. ¿Usarlo?`)) {
            setSelectedPatient(existing[0] as PatientLookup)
            setShowInlineCreator(false)
            setCurrentStep(2)
            return
          } else {
            throw new Error('Cancelado')
          }
        }
      }
      const { data: inserted, error } = await supabase
        .from('patients')
        .insert({
          doctor_id: doctorId,
          full_name: newPatient.full_name,
          cedula: newPatient.cedula || null,
          email: newPatient.email || null,
          phone: newPatient.phone || null,
          birth_date: newPatient.birth_date || null,
          sex: newPatient.sex || null,
          source: 'inline_booking',
        })
        .select('id, full_name, email, phone, cedula').single()
      if (error) throw error
      setSelectedPatient(inserted as PatientLookup)
      setShowInlineCreator(false)
      setCurrentStep(2)
    } catch (err: any) {
      setGlobalError(err.message || 'Error al crear paciente')
    } finally {
      setCreatingPatient(false)
    }
  }

  // ── Submit final ────────────────────────────────────────────────────────
  async function submit() {
    if (!selectedPatient || !doctorId || !scheduledAt) {
      setGlobalError('Faltan datos obligatorios')
      return
    }
    setSubmitting(true); setGlobalError(null)
    try {
      // 1) Upload del comprobante si aplica
      let receiptUrl: string | null = null
      if (receiptFile && METHODS_WITH_RECEIPT.includes(paymentMethod)) {
        const ext = receiptFile.name.split('.').pop() || 'jpg'
        const path = `receipts/${doctorId}/${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage.from('payment-receipts').upload(path, receiptFile, { upsert: true })
        if (upErr) throw new Error(`No se pudo subir el comprobante: ${upErr.message}`)
        const { data } = supabase.storage.from('payment-receipts').getPublicUrl(path)
        receiptUrl = data.publicUrl
      }

      // 2) Crear la cita
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctorId,
          accessToken: session?.access_token,
          patientName: selectedPatient.full_name,
          patientPhone: selectedPatient.phone,
          patientEmail: selectedPatient.email,
          patientCedula: selectedPatient.cedula,
          scheduledAt,
          chiefComplaint,
          planName: selectedPlan?.name || 'Consulta General',
          planPrice: usePackage ? 0 : (selectedPlan?.price_usd || 20),
          sessionsCount: selectedPlan?.sessions_count || 1,
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
    } catch (err: any) {
      setGlobalError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // ── Helpers derivados ──────────────────────────────────────────────────
  const step1Done = !!selectedPatient
  const step2Done = !!scheduledAt
  const step3Done = mode === 'online' || (mode === 'presencial' && (offices.length === 0 || !!selectedOffice))
  const step4Done = step3Done
  const step5Done = !!selectedPlan || !!usePackage
  const step6Done = (usePackage ? true : !!paymentMethod) &&
                     (!METHODS_WITH_RECEIPT.includes(paymentMethod) || usePackage || !!receiptFile)

  const canSubmit = step1Done && step2Done && step3Done && step5Done && step6Done

  const fmtDateTime = (iso: string) => {
    if (!iso) return ''
    const d = new Date(iso)
    return d.toLocaleString('es-VE', { dateStyle: 'medium', timeStyle: 'short' })
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-slate-50 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()} style={{ fontFamily: "'Inter', sans-serif" }}>
        {/* Header tipo booking público — mismo gradient brand */}
        <div className="sticky top-0 z-10 px-5 py-4 flex items-center justify-between text-white" style={{ background: 'linear-gradient(135deg, #06B6D4 0%, #0891b2 50%, #0E7490 100%)' }}>
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
          <button onClick={onClose} className="p-1 hover:bg-white/15 rounded transition-colors"><X className="w-5 h-5" /></button>
        </div>

        {globalError && (
          <div className="mx-5 mt-4 px-3 py-2 bg-red-50 text-red-700 rounded-lg text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> {globalError}
          </div>
        )}

        <div className="p-4 space-y-3">
          {/* ── PASO 1: Paciente ─────────────────────────────────────────── */}
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
                      <button key={p.id} onClick={() => { setSelectedPatient(p); setCurrentStep(2) }}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center justify-between">
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
                    <button onClick={() => { setShowInlineCreator(true); setNewPatient(p => ({ ...p, full_name: patientQuery })) }}
                      className="inline-flex items-center gap-2 px-3 py-1.5 bg-teal-500 hover:bg-teal-600 text-white text-xs font-semibold rounded-lg">
                      <UserPlus className="w-3.5 h-3.5" /> Crear nuevo paciente
                    </button>
                  </div>
                )}
                <button onClick={() => setShowInlineCreator(true)}
                  className="mt-3 text-xs text-teal-600 hover:text-teal-700 font-semibold inline-flex items-center gap-1">
                  <UserPlus className="w-3.5 h-3.5" /> Crear paciente nuevo
                </button>
              </>
            ) : (
              <form onSubmit={createPatientInline} className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">Nuevo paciente</h3>
                  <button type="button" onClick={() => setShowInlineCreator(false)} className="text-xs text-slate-500 hover:text-slate-700">← Volver al buscador</button>
                </div>
                <input required placeholder="Nombre completo *" value={newPatient.full_name}
                  onChange={e => setNewPatient({ ...newPatient, full_name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                <div className="grid grid-cols-2 gap-2">
                  <input placeholder="Cédula" value={newPatient.cedula}
                    onChange={e => setNewPatient({ ...newPatient, cedula: e.target.value })}
                    className="px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                  <input type="tel" placeholder="Teléfono" value={newPatient.phone}
                    onChange={e => setNewPatient({ ...newPatient, phone: e.target.value })}
                    className="px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                  <input type="email" placeholder="Email" value={newPatient.email}
                    onChange={e => setNewPatient({ ...newPatient, email: e.target.value })}
                    className="px-3 py-2 border border-slate-200 rounded-lg text-sm col-span-2" />
                  <input type="date" value={newPatient.birth_date}
                    onChange={e => setNewPatient({ ...newPatient, birth_date: e.target.value })}
                    className="px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                  <select value={newPatient.sex}
                    onChange={e => setNewPatient({ ...newPatient, sex: e.target.value })}
                    className="px-3 py-2 border border-slate-200 rounded-lg text-sm">
                    <option value="">Sexo</option>
                    <option value="masculino">Masculino</option>
                    <option value="femenino">Femenino</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
                <button type="submit" disabled={creatingPatient}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
                  {creatingPatient ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  Crear paciente y continuar
                </button>
              </form>
            )}
          </AccordionSection>

          {/* ── PASO 2: Fecha y hora — slots tipo booking público ─────────── */}
          <AccordionSection
            step={2} currentStep={currentStep}
            title="Fecha y hora"
            icon={Calendar}
            completed={step2Done}
            summary={scheduledAt ? fmtDateTime(scheduledAt) : undefined}
            onOpen={() => step1Done && setCurrentStep(2)}
          >
            {(() => {
              // RONDA 20: configuracion del consultorio (si existe) decide
              // que dias estan habilitados y que slots se muestran.
              const office = selectedOffice
              const hasOfficeConfig = !!office?.schedule && Array.isArray(office.schedule) && office.schedule.length > 0
              const interval = (office?.slot_duration ?? 30)

              // RONDA 41: generar 60 dias (~12 semanas paginadas de a 5).
              // Antes solo 22 dias con scroll horizontal: el usuario no podia
              // agendar mas alla de ~3 semanas porque la UI no permitia scroll claro.
              const days: Array<{ date: string; label: string; weekday: string; dayNum: string; month: string; enabled: boolean }> = []
              const today = new Date()
              for (let i = 0; i < 60; i++) {
                const d = new Date(today)
                d.setDate(today.getDate() + i)
                const yyyy = d.getFullYear()
                const mm = String(d.getMonth() + 1).padStart(2, '0')
                const dd = String(d.getDate()).padStart(2, '0')
                let enabled = true
                if (hasOfficeConfig) {
                  const schedDay = office!.schedule!.find(s => s.day === jsDayToScheduleDay(d.getDay()))
                  enabled = schedDay?.enabled ?? false
                }
                days.push({
                  date: `${yyyy}-${mm}-${dd}`,
                  label: d.toLocaleDateString('es-VE', { weekday: 'short', day: 'numeric', month: 'short' }),
                  weekday: d.toLocaleDateString('es-VE', { weekday: 'short' }).toUpperCase(),
                  dayNum: String(d.getDate()),
                  month: d.toLocaleDateString('es-VE', { month: 'short' }).toUpperCase(),
                  enabled,
                })
              }
              // Pagina actual: 5 dias visibles
              const PAGE_SIZE = 5
              const visibleDays = days.slice(weekOffset * PAGE_SIZE, weekOffset * PAGE_SIZE + PAGE_SIZE)
              const canPrev = weekOffset > 0
              const canNext = (weekOffset + 1) * PAGE_SIZE < days.length
              const rangeLabel = visibleDays.length > 0
                ? `${visibleDays[0].dayNum} ${visibleDays[0].month} — ${visibleDays[visibleDays.length - 1].dayNum} ${visibleDays[visibleDays.length - 1].month}`
                : ''

              // Generar slots horarios:
              // - Con config: usa schedule[selectedDay].start/end + slot_duration
              // - Sin config o sin selectedDate: usa GENERIC_TIMES
              let times: string[] = GENERIC_TIMES
              if (hasOfficeConfig && selectedDate) {
                const [y, mo, da] = selectedDate.split('-').map(Number)
                const sd = new Date(y, mo - 1, da)
                const schedDay = office!.schedule!.find(s => s.day === jsDayToScheduleDay(sd.getDay()))
                if (schedDay?.enabled) {
                  times = generateTimeSlots(schedDay.start, schedDay.end, interval)
                } else {
                  times = []  // ese dia no se atiende
                }
              }
              return (
                <div className="space-y-3">
                  {/* RONDA 22 — mensaje informativo si no hay consultorio.
                      Ruta corregida: la sección se llama "Consultorio" en el sidebar
                      y vive en /doctor/offices */}
                  {!hasOfficeConfig && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 flex items-start gap-2 text-xs text-blue-800">
                      <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                      <span>
                        No tienes un consultorio configurado, se usarán horarios genéricos (8am-12pm y 2pm-6pm, todos los días).
                        Configura tu consultorio en <a href="/doctor/offices" className="font-bold underline underline-offset-2 hover:text-blue-900">Consultorio → Consultorio</a> para personalizar tus horarios.
                      </span>
                    </div>
                  )}

                  {/* RONDA 41: Selector de fecha paginado (5 dias por pagina + chevrons),
                      mismo patron que /book/[doctorId] para consistencia visual. */}
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
                        const isDisabled = !d.enabled
                        return (
                          <button
                            key={d.date}
                            type="button"
                            disabled={isDisabled}
                            onClick={() => { if (!isDisabled) { setSelectedDate(d.date); setSelectedTime('') } }}
                            title={isDisabled ? 'Tu consultorio no atiende este día' : ''}
                            className={`flex flex-col items-center justify-center h-20 rounded-xl border-2 transition-all ${
                              isDisabled
                                ? 'bg-slate-50 text-slate-300 border-slate-200 cursor-not-allowed'
                                : isActive
                                ? 'bg-teal-500 text-white border-teal-500 shadow-md'
                                : 'bg-white text-slate-700 border-slate-200 hover:border-teal-300'
                            }`}
                          >
                            <span className={`text-[10px] font-bold ${isActive ? 'text-teal-100' : isDisabled ? 'text-slate-300' : 'text-slate-500'}`}>{d.weekday}</span>
                            <span className="text-2xl font-bold">{d.dayNum}</span>
                            <span className={`text-[10px] ${isActive ? 'text-teal-100' : isDisabled ? 'text-slate-300' : 'text-slate-500'}`}>{d.month}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Selector de hora — RONDA 20: dropdown de slots dinamicos */}
                  {selectedDate && times.length === 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                      Tu consultorio no atiende este día. Selecciona otro día disponible.
                    </div>
                  )}
                  {selectedDate && times.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                        Hora disponible {hasOfficeConfig && <span className="font-normal text-slate-400 normal-case">· cada {interval} min</span>}
                      </p>
                      <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
                        {times.map(t => {
                          const slotKey = `${selectedDate} ${t}`
                          const isOccupied = bookedSlots.has(slotKey)
                          const isActive = selectedTime === t
                          return (
                            <button
                              key={t}
                              type="button"
                              disabled={isOccupied}
                              onClick={() => setSelectedTime(t)}
                              title={isOccupied ? 'Slot ocupado' : ''}
                              className={`px-2 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                                isOccupied ? 'bg-slate-100 text-slate-400 border-slate-200 line-through cursor-not-allowed'
                                : isActive ? 'bg-teal-500 text-white border-teal-500'
                                : 'bg-white text-slate-700 border-slate-200 hover:border-teal-300'
                              }`}
                            >
                              {t}
                            </button>
                          )
                        })}
                      </div>
                      {bookedSlots.size > 0 && (
                        <p className="text-[10px] text-slate-500 mt-1.5">Los horarios tachados ya tienen una cita.</p>
                      )}
                    </div>
                  )}

                  {/* Resumen + botón continuar */}
                  {scheduledAt && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      <span className="text-xs font-semibold text-emerald-800">{fmtDateTime(scheduledAt)}</span>
                    </div>
                  )}
                  <div className="flex justify-end">
                    <button onClick={() => setCurrentStep(3)} disabled={!scheduledAt}
                      className="px-3 py-1.5 bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
                      Continuar →
                    </button>
                  </div>
                </div>
              )
            })()}
          </AccordionSection>

          {/* ── PASO 3: Modalidad y ubicación ────────────────────────────── */}
          <AccordionSection
            step={3} currentStep={currentStep}
            title="Modalidad"
            icon={MapPin}
            completed={step3Done}
            summary={mode === 'online' ? 'Online' : selectedOffice ? `Presencial · ${selectedOffice.name}` : 'Presencial'}
            onOpen={() => step2Done && setCurrentStep(3)}
          >
            <div className="flex gap-2 mb-3">
              <button onClick={() => setMode('presencial')}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold ${mode === 'presencial' ? 'bg-teal-500 text-white' : 'bg-slate-100 text-slate-600'}`}>
                Presencial
              </button>
              <button onClick={() => setMode('online')}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold ${mode === 'online' ? 'bg-teal-500 text-white' : 'bg-slate-100 text-slate-600'}`}>
                Online
              </button>
            </div>
            {mode === 'presencial' && offices.length > 0 && (
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Consultorio</label>
                <select value={selectedOffice?.id || ''}
                  onChange={e => setSelectedOffice(offices.find(o => o.id === e.target.value) || null)}
                  className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm">
                  {offices.map(o => <option key={o.id} value={o.id}>{o.name} — {o.address}</option>)}
                </select>
              </div>
            )}
            <div className="flex justify-end mt-3">
              <button onClick={() => setCurrentStep(4)}
                className="px-3 py-1.5 bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold rounded-lg">
                Continuar →
              </button>
            </div>
          </AccordionSection>

          {/* ── PASO 4: Motivo ───────────────────────────────────────────── */}
          <AccordionSection
            step={4} currentStep={currentStep}
            title="Motivo de consulta"
            icon={FileText}
            completed={step4Done && currentStep > 4}
            summary={chiefComplaint ? chiefComplaint.slice(0, 60) + (chiefComplaint.length > 60 ? '...' : '') : undefined}
            onOpen={() => step3Done && setCurrentStep(4)}
          >
            <textarea value={chiefComplaint} onChange={e => setChiefComplaint(e.target.value)}
              placeholder="¿Qué trae al paciente? (opcional)" rows={3}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none" />
            <div className="flex justify-end mt-3">
              <button onClick={() => setCurrentStep(5)}
                className="px-3 py-1.5 bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold rounded-lg">
                Continuar →
              </button>
            </div>
          </AccordionSection>

          {/* ── PASO 5: Plan / paquete ────────────────────────────────────── */}
          <AccordionSection
            step={5} currentStep={currentStep}
            title="Plan de consulta"
            icon={Pill}
            completed={step5Done && currentStep > 5}
            summary={usePackage ? '✨ Con paquete' : selectedPlan ? `${selectedPlan.name} — $${selectedPlan.price_usd}` : undefined}
            onOpen={() => step4Done && setCurrentStep(5)}
          >
            {packages.length > 0 && (
              <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 mb-3 space-y-2">
                <p className="text-xs font-semibold text-violet-800 uppercase tracking-wider">Paquete activo</p>
                {packages.map(p => (
                  <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={usePackage === p.id}
                      onChange={() => setUsePackage(usePackage === p.id ? null : p.id)}
                      className="accent-violet-600" />
                    <span className="text-sm text-slate-900">{p.plan_name} — queda {p.total_sessions - p.used_sessions} de {p.total_sessions}</span>
                  </label>
                ))}
              </div>
            )}
            {!usePackage && (
              <div>
                <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Tipo de consulta</label>
                <select value={selectedPlan?.id || ''}
                  onChange={e => setSelectedPlan(pricingPlans.find(p => p.id === e.target.value) || null)}
                  className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm">
                  {pricingPlans.length === 0 && <option value="">Consulta General — $20</option>}
                  {pricingPlans.map(p => (
                    <option key={p.id} value={p.id}>{p.name} — ${p.price_usd}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex justify-end mt-3">
              <button onClick={() => setCurrentStep(6)} disabled={!step5Done}
                className="px-3 py-1.5 bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
                Continuar →
              </button>
            </div>
          </AccordionSection>

          {/* ── PASO 6: Pago + comprobante ────────────────────────────────── */}
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
                  <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
                    className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm">
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
                      <input type="text" value={paymentReference}
                        onChange={e => setPaymentReference(e.target.value)}
                        placeholder="Nº de referencia o hash"
                        className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Comprobante (foto o PDF)</label>
                      <label className="mt-1 flex items-center gap-2 px-3 py-2 border-2 border-dashed border-slate-200 rounded-lg text-sm text-slate-600 cursor-pointer hover:bg-slate-50">
                        <Upload className="w-4 h-4" />
                        {receiptFile ? receiptFile.name : 'Subir comprobante...'}
                        <input type="file" accept="image/*,application/pdf" className="hidden"
                          onChange={e => setReceiptFile(e.target.files?.[0] || null)} />
                      </label>
                      {receiptFile && (
                        <button type="button" onClick={() => setReceiptFile(null)}
                          className="text-xs text-red-500 mt-1">Quitar archivo</button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="flex justify-end mt-4 gap-2">
              <button onClick={submit} disabled={submitting || !canSubmit}
                className="px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50 flex items-center gap-2">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Crear consulta
              </button>
            </div>
          </AccordionSection>
        </div>
      </div>
    </div>
  )
}
