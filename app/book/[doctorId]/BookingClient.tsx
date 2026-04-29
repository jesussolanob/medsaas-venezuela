'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Calendar, Clock, User, Phone, Mail, CheckCircle, Activity, AlertCircle,
  ChevronLeft, ChevronRight, ChevronDown, Upload, Video, MapPin,
  CreditCard, FileText, Shield, Check, LogIn, UserPlus, Stethoscope
} from 'lucide-react'
import { getProfessionalTitle } from '@/lib/professional-title'
import { useBcvRate } from '@/lib/useBcvRate'
// L6 (2026-04-29): inputs canonicos para cedula y telefono venezolano
import CedulaInput from '@/components/shared/CedulaInput'
import PhoneInput from '@/components/shared/PhoneInput'

// ── Brand Tokens ──────────────────────────────────────────────────────────
const BRAND = {
  turquoise: '#06B6D4',
  coral: '#FF8A65',
  ink: '#0F1A2A',
  bone: '#FAFBFC',
  gradient: 'linear-gradient(135deg, #06B6D4 0%, #0891b2 50%, #0E7490 100%)',
}

// ── Delta Isotipo ─────────────────────────────────────────────────────────
function DeltaIsotipo({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none" className={className}>
      <path d="M125 40 C75 25, 25 65, 30 120 C35 165, 75 190, 120 175" stroke="#06B6D4" strokeWidth="26" strokeLinecap="round" fill="none"/>
      <path d="M145 155 C170 120, 170 70, 140 45" stroke="#FF8A65" strokeWidth="26" strokeLinecap="round" fill="none"/>
    </svg>
  )
}

// ── Types ──────────────────────────────────────────────────────────────────
type DoctorProfile = { id: string; full_name: string; specialty: string; phone: string; avatar_url: string | null; professional_title?: string; state?: string | null; city?: string | null; country?: string; office_address?: string | null; allows_online?: boolean }
type PricingPlan = { id: string; name: string; price_usd: number; duration_minutes: number; sessions_count?: number }
type Slot = { date: string; time: string; label: string }
type PaymentMethod = 'pago_movil' | 'transferencia' | 'zelle' | 'binance' | 'cash_usd' | 'cash_bs' | 'pos'
type ActivePackage = { id: string; plan_name: string; total_sessions: number; used_sessions: number }
type DoctorOffice = { id: string; name: string; address: string; city: string; phone: string; schedule: { day: number; enabled: boolean; start: string; end: string }[]; slot_duration: number; buffer_minutes: number }

/** Total price for a plan: price_usd is per-session, multiply by sessions_count */
function planTotal(plan: PricingPlan): number {
  return plan.price_usd * (plan.sessions_count && plan.sessions_count > 1 ? plan.sessions_count : 1)
}

// ── Helpers ────────────────────────────────────────────────────────────────

// RONDA 27: genera slots respetando el schedule del consultorio si existe.
// Sin consultorio → comportamiento generico (8-12 + 14-18 cada 30min, todos los dias menos domingo).
// Con consultorio(s) → usa schedule[day].enabled / start / end + slot_duration + buffer_minutes
//   y combina TODOS los offices habilitados ese dia (ej. doctor con 2 sedes).
const GENERIC_TIMES = ['08:00','08:30','09:00','09:30','10:00','10:30','11:00','11:30',
                       '14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30']

// Helper para generar slots HH:MM entre start-end con paso (slot_duration + buffer)
function timesBetween(start: string, end: string, slotMin: number, bufferMin: number): string[] {
  const out: string[] = []
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  if (isNaN(sh) || isNaN(eh)) return []
  const startTotal = sh * 60 + (sm || 0)
  const endTotal = eh * 60 + (em || 0)
  const step = Math.max(15, (slotMin || 30) + (bufferMin || 0))
  for (let t = startTotal; t + (slotMin || 30) <= endTotal; t += step) {
    const h = String(Math.floor(t / 60)).padStart(2, '0')
    const m = String(t % 60).padStart(2, '0')
    out.push(`${h}:${m}`)
  }
  return out
}

function generateSlots(offices: DoctorOffice[] = []): Slot[] {
  const slots: Slot[] = []
  const today = new Date()
  const hasOffices = offices.length > 0

  for (let d = 1; d <= 21; d++) {
    const date = new Date(today)
    date.setDate(today.getDate() + d)
    const jsDay = date.getDay()                          // 0=dom, 1=lun..6=sab
    const scheduleDay = jsDay === 0 ? 6 : jsDay - 1      // formato BD: 0=lun..6=dom
    // RONDA 28: dateStr en formato YYYY-MM-DD usando Caracas, NO UTC.
    // Antes usaba date.toISOString() que daba el dia UTC y corria fechas
    // cuando se generaba en horarios nocturnos (ej. 23h Caracas = 03h UTC dia siguiente).
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    const dayLabel = date.toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'short' })

    if (hasOffices) {
      // Buscar TODOS los offices que atienden ese dia y unir sus slots
      const enabledOffices = offices.filter(o =>
        o.schedule?.some(s => s.day === scheduleDay && s.enabled)
      )
      if (enabledOffices.length === 0) continue   // ningun consultorio atiende ese dia

      const dayTimes = new Set<string>()
      for (const off of enabledOffices) {
        const sched = off.schedule!.find(s => s.day === scheduleDay && s.enabled)!
        const tt = timesBetween(sched.start, sched.end, off.slot_duration ?? 30, off.buffer_minutes ?? 0)
        tt.forEach(t => dayTimes.add(t))
      }
      Array.from(dayTimes).sort().forEach(t => slots.push({ date: dateStr, time: t, label: dayLabel }))
    } else {
      // RONDA 28: sin consultorio → TODOS los 7 dias de la semana habilitados
      // (antes excluia domingo por default — quitado a peticion del usuario).
      // El doctor puede crear su consultorio para limitar horarios.
      GENERIC_TIMES.forEach(t => slots.push({ date: dateStr, time: t, label: dayLabel }))
    }
  }
  return slots
}

function groupByDate(slots: Slot[]) {
  const map: Record<string, Slot[]> = {}
  slots.forEach(s => { if (!map[s.date]) map[s.date] = []; map[s.date].push(s) })
  return map
}

const fi = 'w-full px-4 py-3 text-sm border border-slate-200 rounded-xl outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/10 bg-white transition-colors'

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  pago_movil: '📱 Pago Móvil',
  transferencia: '🏦 Transferencia',
  zelle: '💳 Zelle',
  binance: '₿ Binance',
  cash_usd: '💵 Efectivo (USD)',
  cash_bs: '💵 Efectivo (Bs)',
  pos: '🛒 Punto de venta'
}

const requiresReceipt = (method: PaymentMethod) => !['cash_usd', 'cash_bs', 'pos'].includes(method)

// ── Accordion Section Component ─────────────────────────────────────────────
function AccordionSection({
  step,
  currentStep,
  title,
  icon: Icon,
  summary,
  completed,
  onOpen,
  children,
}: {
  step: number
  currentStep: number
  title: string
  icon: React.ElementType
  summary?: string
  completed: boolean
  onOpen: () => void
  children: React.ReactNode
}) {
  const isOpen = currentStep === step
  const isPast = completed
  const isFuture = !completed && !isOpen

  return (
    <div className={`rounded-2xl overflow-hidden transition-all duration-300 ${
      isOpen ? 'shadow-lg shadow-cyan-500/10 bg-white ring-1 ring-cyan-400/50' :
      isPast ? 'bg-white ring-1 ring-emerald-200' :
      'bg-white/60 ring-1 ring-slate-200/80'
    }`}>
      <button
        type="button"
        onClick={isPast ? onOpen : undefined}
        className={`w-full flex items-center gap-3.5 px-5 py-4 text-left transition-colors ${
          isPast ? 'cursor-pointer hover:bg-emerald-50/50' : isFuture ? 'cursor-default opacity-40' : ''
        }`}
      >
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
          isPast ? 'bg-emerald-500' : isOpen ? 'bg-cyan-500' : 'bg-slate-100'
        }`}>
          {isPast ? <Check className="w-4 h-4 text-white" /> : <Icon className={`w-4 h-4 ${isOpen ? 'text-white' : 'text-slate-400'}`} />}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${isPast ? 'text-emerald-700' : isOpen ? 'text-slate-900' : 'text-slate-400'}`}>
            {step}. {title}
          </p>
          {isPast && summary && (
            <p className="text-xs text-emerald-600/80 mt-0.5 truncate">{summary}</p>
          )}
        </div>
        {isPast && (
          <ChevronDown className="w-4 h-4 text-emerald-400 shrink-0" />
        )}
      </button>
      {isOpen && (
        <div className="px-5 pb-5 pt-1 animate-in fade-in duration-200">
          {children}
        </div>
      )}
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────────────────────
export default function BookingClient({
  doctor,
  plans,
  paymentMethods = [],
  paymentDetails = {},
  bookedSlots = []
}: {
  doctor: DoctorProfile
  plans: PricingPlan[]
  paymentMethods?: string[]
  paymentDetails?: Record<string, any>
  bookedSlots?: string[]
}) {
  // BCV rate for dual currency
  const { rate: bcvRate, toBs } = useBcvRate()

  // Auth state
  const [authUser, setAuthUser] = useState<any>(null)
  // RONDA 19a: bloqueo de UI cuando el usuario logueado es el mismo doctor o un admin
  const [authRole, setAuthRole] = useState<string | null>(null)
  const isOwnerDoctor = !!authUser && authUser.id === doctor.id
  const isAdmin = authRole === 'admin' || authRole === 'super_admin'
  const previewModeBlocked = isOwnerDoctor || isAdmin
  const [authReady, setAuthReady] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'register' | null>(null)

  // Accordion step (1-7)
  const [activeStep, setActiveStep] = useState(1)
  const [guestMode, setGuestMode] = useState(false)

  // Active package (prepaid sessions)
  const [activePackage, setActivePackage] = useState<ActivePackage | null>(null)
  const [usingPackage, setUsingPackage] = useState(false)

  // Doctor offices
  const [doctorOffices, setDoctorOffices] = useState<DoctorOffice[]>([])
  const [selectedOffice, setSelectedOffice] = useState<DoctorOffice | null>(null)

  // Selections
  const [selectedPlan, setSelectedPlan] = useState<PricingPlan | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
  const [appointmentMode, setAppointmentMode] = useState<'presencial' | 'online' | ''>('')
  const [useInsurance, setUseInsurance] = useState(false)
  const [selectedInsurance, setSelectedInsurance] = useState('')
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod | ''>('')
  const [paymentFile, setPaymentFile] = useState<File | null>(null)

  // Form — RONDA 33: ampliado con datos clinicos opcionales para zero-friction onboarding.
  // El paciente puede saltar los opcionales y completarlos despues en su perfil.
  const [form, setForm] = useState({
    full_name: '', phone: '', email: '', cedula: '', notes: '',
    password: '', passwordConfirm: '',
    // Datos clinicos opcionales (se guardan en patients al completar el booking)
    birth_date: '', sex: '' as '' | 'male' | 'female' | 'other',
    blood_type: '', allergies: '', chronic_conditions: '',
    emergency_contact_name: '', emergency_contact_phone: '',
    address: '', city: '',
  })
  const [submitting, setSubmitting] = useState(false)
  // RONDA 24: ref sincrono para bloquear double-click antes de que el render propague.
  // Se mantiene sincronizado con `submitting` via useEffect mas abajo.
  const submittingRef = useRef(false)
  const [done, setDone] = useState(false)
  const [bookedCode, setBookedCode] = useState<string>('')
  const [error, setError] = useState('')

  // RONDA 24: cualquier cambio de `submitting` libera el ref automaticamente.
  // Asi no hay que repetir submittingRef.current = false en los 5 setSubmitting(false).
  useEffect(() => { submittingRef.current = submitting }, [submitting])

  // Slot navigation
  const [weekOffset, setWeekOffset] = useState(0)

  // RONDA 27: pasamos los offices del doctor para que generateSlots respete
  // sus dias habilitados, horarios y duracion entre citas. Sin offices → generic.
  const allSlots = generateSlots(doctorOffices)
  const grouped = groupByDate(allSlots)
  const dates = Object.keys(grouped).sort()
  const weekDates = dates.slice(weekOffset * 5, weekOffset * 5 + 5)

  const isSlotBooked = (date: string, time: string): boolean => {
    // RONDA 28: forzar Caracas para comparar correctamente con bookedSlots de BD
    const slotISO = new Date(`${date}T${time}:00-04:00`).toISOString()
    const slotTime = new Date(slotISO).getTime()
    const bufferMs = 30 * 60 * 1000
    return bookedSlots.some(bookedISO => {
      const bookedTime = new Date(bookedISO).getTime()
      return Math.abs(bookedTime - slotTime) < bufferMs
    })
  }

  // Fetch active packages for this doctor (try auth_user_id first, then patient_id)
  const fetchActivePackages = async (userId: string) => {
    try {
      const supabase = createClient()

      // Try by auth_user_id first
      const { data: pkgByAuth } = await supabase
        .from('patient_packages')
        .select('id, plan_name, total_sessions, used_sessions')
        .eq('auth_user_id', userId)
        .eq('doctor_id', doctor.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (pkgByAuth && pkgByAuth.used_sessions < pkgByAuth.total_sessions) {
        setActivePackage(pkgByAuth)
        return
      }

      // Fallback: find patient record by auth_user_id and query by patient_id
      const { data: patientRecord } = await supabase
        .from('patients')
        .select('id')
        .eq('auth_user_id', userId)
        .eq('doctor_id', doctor.id)
        .maybeSingle()

      if (patientRecord) {
        const { data: pkgByPatient } = await supabase
          .from('patient_packages')
          .select('id, plan_name, total_sessions, used_sessions')
          .eq('patient_id', patientRecord.id)
          .eq('doctor_id', doctor.id)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (pkgByPatient && pkgByPatient.used_sessions < pkgByPatient.total_sessions) {
          setActivePackage(pkgByPatient)
        }
      }
    } catch (err) {
      console.error('Error fetching packages:', err)
    }
  }

  // Check auth on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          setAuthUser(user)
          // RONDA 19a: leer role para detectar doctores/admins en preview mode
          const { data: prof } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .maybeSingle()
          setAuthRole(prof?.role ?? null)
          setForm(f => ({
            ...f,
            full_name: user.user_metadata?.full_name || f.full_name,
            email: user.email || f.email,
            phone: user.user_metadata?.phone || f.phone,
            cedula: user.user_metadata?.cedula || f.cedula,
          }))
          fetchActivePackages(user.id)
        }
      } catch (err) {
        console.error('Auth check error:', err)
      }
      setAuthReady(true)
    }
    checkAuth()
  }, [])

  // Fetch doctor offices on mount
  useEffect(() => {
    const fetchOffices = async () => {
      try {
        const supabase = createClient()
        const { data } = await supabase
          .from('doctor_offices')
          .select('id, name, address, city, phone, schedule, slot_duration, buffer_minutes')
          .eq('doctor_id', doctor.id)
          .eq('is_active', true)
        setDoctorOffices((data || []).map(o => ({
          ...o,
          schedule: o.schedule || [],
          slot_duration: o.slot_duration || 30,
          buffer_minutes: o.buffer_minutes || 10,
        })))
      } catch (err) {
        console.error('Error fetching offices:', err)
      }
    }
    fetchOffices()
  }, [doctor.id])

  // When date is selected, find the matching office for that day
  useEffect(() => {
    if (selectedDate && doctorOffices.length > 0) {
      const dateObj = new Date(selectedDate + 'T12:00:00')
      const jsDay = dateObj.getDay()
      const dayIdx = jsDay === 0 ? 6 : jsDay - 1
      const matchingOffice = doctorOffices.find(o =>
        o.schedule.some(s => s.day === dayIdx && s.enabled)
      )
      setSelectedOffice(matchingOffice || null)
    }
  }, [selectedDate, doctorOffices])

  // ── Auth Handlers ─────────────────────────────────────────────────────────
  const handleAuthLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const supabase = createClient()
      const { data, error: authErr } = await supabase.auth.signInWithPassword({
        email: form.email.trim(),
        password: form.password.trim(),
      })
      if (authErr || !data.user) {
        setError(authErr?.message || 'Email o contraseña inválidos')
        setSubmitting(false)
        return
      }
      setAuthUser(data.user)
      setForm(f => ({
        ...f,
        full_name: data.user.user_metadata?.full_name || f.full_name,
        phone: data.user.user_metadata?.phone || f.phone,
        cedula: data.user.user_metadata?.cedula || f.cedula,
      }))
      fetchActivePackages(data.user.id)
    } catch (err: any) {
      setError(err?.message || 'Error al iniciar sesión')
    }
    setSubmitting(false)
  }

  const handleAuthRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (form.password !== form.passwordConfirm) {
      setError('Las contraseñas no coinciden')
      return
    }
    if (!form.full_name.trim() || !form.email.trim() || !form.phone.trim()) {
      setError('Nombre, email y teléfono son obligatorios')
      return
    }
    setSubmitting(true)
    try {
      const supabase = createClient()
      const { data, error: authErr } = await supabase.auth.signUp({
        email: form.email.trim(),
        password: form.password.trim(),
        options: {
          data: {
            full_name: form.full_name.trim(),
            cedula: form.cedula.trim(),
            phone: form.phone.trim(),
            role: 'patient',
          },
        },
      })
      if (authErr || !data.user) {
        setError(authErr?.message || 'Error al registrarse')
        setSubmitting(false)
        return
      }

      // RONDA 33: zero-friction onboarding — UPSERT en profiles con role=patient + phone
      // Asi el callback de auth no manda al usuario al onboarding (ya tiene role + phone).
      // Si el upsert falla (RLS, etc.) no bloqueamos el registro — el onboarding actua de fallback.
      try {
        await supabase.from('profiles').upsert({
          id: data.user.id,
          email: form.email.trim(),
          full_name: form.full_name.trim(),
          phone: form.phone.trim(),
          role: 'patient',
        }, { onConflict: 'id' })
      } catch (profErr) {
        console.warn('[register] profile upsert failed (non-blocking):', profErr)
      }

      setAuthUser(data.user)
    } catch (err: any) {
      setError(err?.message || 'Error al registrarse')
    }
    setSubmitting(false)
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    // RONDA 24: guard SINCRONO contra doble-click. setSubmitting(true) tarda
    // un render en propagar — si el usuario clickea 2 veces rapido, el segundo
    // click ya paso las validaciones antes de ver `submitting=true`.
    // submittingRef se actualiza al instante y bloquea el segundo click.
    if (submittingRef.current) return
    submittingRef.current = true

    setError('')

    if (!selectedSlot) { setError('Selecciona una fecha y hora'); submittingRef.current = false; return }
    if (!appointmentMode) { setError('Selecciona modalidad de consulta'); submittingRef.current = false; return }
    if (!usingPackage && !useInsurance && !selectedPaymentMethod) { setError('Selecciona un método de pago'); submittingRef.current = false; return }
    if (!usingPackage && useInsurance && !selectedInsurance) { setError('Selecciona tu seguro'); submittingRef.current = false; return }

    // Guest validation
    if (!authUser && (!form.full_name.trim() || !form.email.trim())) {
      setError('Nombre y email son requeridos'); submittingRef.current = false; return
    }

    setSubmitting(true)
    try {
      const supabase = createClient()
      let accessToken: string | null = null
      let sessionEmail: string | null = null

      if (authUser) {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) {
          setError('Sesión expirada. Recarga la página.')
          setSubmitting(false)
          return
        }
        accessToken = session.access_token
        sessionEmail = session.user.email || null
      }

      const patientName = (form.full_name.trim() || authUser?.user_metadata?.full_name || 'Paciente').trim()
      const patientPhone = (form.phone.trim() || authUser?.user_metadata?.phone || '').trim()
      const patientCedula = (form.cedula.trim() || authUser?.user_metadata?.cedula || '').trim()
      const patientEmail = sessionEmail || form.email.trim()

      // Upload receipt if needed
      let receiptUrl = null
      if (!usingPackage && !useInsurance && selectedPaymentMethod && requiresReceipt(selectedPaymentMethod as PaymentMethod)) {
        if (!paymentFile) {
          setError(`Comprobante requerido para ${PAYMENT_LABELS[selectedPaymentMethod as PaymentMethod]}`)
          setSubmitting(false)
          return
        }
        try {
          const ext = paymentFile.name.split('.').pop()
          const uploaderId = authUser?.id || 'guest'
          const path = `${doctor.id}/${uploaderId}/${Date.now()}.${ext}`
          const { error: uploadErr } = await supabase.storage.from('payment-receipts').upload(path, paymentFile, { upsert: false })
          if (uploadErr) throw uploadErr
          const { data: publicUrl } = supabase.storage.from('payment-receipts').getPublicUrl(path)
          receiptUrl = publicUrl.publicUrl
        } catch (err: any) {
          setError(`Error al subir comprobante: ${err?.message || 'Contacta al doctor.'}`)
          setSubmitting(false)
          return
        }
      }

      // RONDA 28: forzar Caracas con offset explicito -04:00.
      // Antes usaba `new Date('YYYY-MM-DDTHH:mm:00')` sin offset, que JS interpreta
      // como zona LOCAL del navegador. Si el paciente estaba en otra zona, la cita
      // se guardaba en BD con un dia equivocado (ej. el doctor veia sabado en lugar
      // del domingo seleccionado). Caracas no tiene DST → offset siempre -04:00.
      const dateTime = new Date(`${selectedSlot.date}T${selectedSlot.time}:00-04:00`)
      const res = await fetch('/api/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctorId: doctor.id,
          accessToken,
          patientName,
          patientPhone: patientPhone || null,
          patientEmail,
          patientCedula: patientCedula || null,
          scheduledAt: dateTime.toISOString(),
          chiefComplaint: form.notes.trim() || null,
          planName: selectedPlan?.name ?? 'Consulta General',
          planPrice: selectedPlan ? planTotal(selectedPlan) : 20,
          sessionsCount: selectedPlan?.sessions_count || 1,
          paymentMethod: usingPackage ? 'package' : useInsurance ? 'insurance' : selectedPaymentMethod,
          insuranceName: useInsurance ? selectedInsurance : null,
          receiptUrl,
          appointmentMode: appointmentMode || 'presencial',
          packageId: usingPackage ? activePackage?.id : null,
          // RONDA 33: datos clinicos opcionales para persistir en patients
          patientClinical: {
            birth_date: form.birth_date || null,
            sex: form.sex || null,
            blood_type: form.blood_type || null,
            allergies: form.allergies?.trim() || null,
            chronic_conditions: form.chronic_conditions?.trim() || null,
            address: form.address?.trim() || null,
            city: form.city?.trim() || null,
            emergency_contact_name: form.emergency_contact_name?.trim() || null,
            emergency_contact_phone: form.emergency_contact_phone?.trim() || null,
          },
        }),
      })

      const result = await res.json()
      if (!res.ok || result.error) {
        // RONDA 23: mensaje claro cuando el slot ya esta tomado (code 23505 desde BD)
        if (result.code === 'slot_taken' || res.status === 409) {
          setError('Este horario ya no está disponible, por favor elige otro.')
        } else {
          setError(result.error || 'Error al agendar cita')
        }
        setSubmitting(false)
        return
      }

      if (usingPackage && activePackage) {
        const newUsed = activePackage.used_sessions + 1
        if (newUsed >= activePackage.total_sessions) {
          setActivePackage(null)
        } else {
          setActivePackage({ ...activePackage, used_sessions: newUsed })
        }
      }

      // Guardar codigo de la cita para mostrarlo en el resumen
      setBookedCode(result.appointmentCode || '')
      setDone(true)
    } catch (err: any) {
      setError(err?.message || 'Error inesperado')
    }
    setSubmitting(false)
    submittingRef.current = false  // RONDA 24: liberar guard
  }

  // ── Shared Font Style ────────────────────────────────────────────────────
  const fontStyle = (
    <style>{`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');*{font-family:'Plus Jakarta Sans',sans-serif;}`}</style>
  )

  // ── Success View ──────────────────────────────────────────────────────────
  if (done) return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: BRAND.bone }}>
      {fontStyle}
      <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 p-8 max-w-sm w-full text-center">
        <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-5">
          <CheckCircle className="w-8 h-8 text-emerald-500" />
        </div>
        <h2 className="text-xl font-bold mb-2" style={{ color: BRAND.ink }}>¡Cita agendada!</h2>
        <p className="text-sm text-slate-500 mb-5">
          Tu consulta con <strong>{getProfessionalTitle(doctor.professional_title, doctor.specialty)} {doctor.full_name}</strong> fue registrada.
        </p>
        {/* === Resumen completo de la cita agendada === */}
        <div className="rounded-xl p-4 text-left space-y-2.5 mb-5" style={{ background: BRAND.bone }}>
          {bookedCode && (
            <div className="flex items-center justify-between pb-2 mb-1 border-b border-slate-200">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Código de cita</span>
              <span className="font-mono text-xs font-bold text-slate-800 bg-white px-2 py-0.5 rounded">{bookedCode}</span>
            </div>
          )}
          <p className="text-xs text-slate-600">
            <span className="font-semibold">📅 Fecha:</span> {selectedSlot?.label} a las <span className="font-bold">{selectedSlot?.time}</span>
          </p>
          {selectedPlan && (
            <div className="text-xs text-slate-600">
              <span className="font-semibold">💼 Plan:</span> {selectedPlan.name}
              {usingPackage ? ' (paquete prepagado)' : (
                <>
                  {' — '}<span className="font-bold">${planTotal(selectedPlan)} USD</span>
                  {bcvRate && <span className="text-slate-400 ml-1">({toBs(planTotal(selectedPlan))})</span>}
                </>
              )}
            </div>
          )}
          <p className="text-xs text-slate-600">
            <span className="font-semibold">{appointmentMode === 'online' ? '💻' : '🏥'} Modalidad:</span> {appointmentMode === 'online' ? 'Videoconsulta' : 'Presencial'}
          </p>
          {appointmentMode === 'presencial' && selectedOffice && (
            <>
              <div className="text-xs text-slate-600">
                <span className="font-semibold">📍 Consultorio:</span> {selectedOffice.name}
              </div>
              <div className="text-xs text-slate-600 pl-4">{selectedOffice.address}, {selectedOffice.city}</div>
              {selectedOffice.phone && (
                <div className="text-xs text-slate-600 pl-4">
                  <a href={`tel:${selectedOffice.phone}`} className="text-cyan-600 hover:underline">📞 {selectedOffice.phone}</a>
                </div>
              )}
            </>
          )}
          {appointmentMode === 'presencial' && !selectedOffice && doctor.office_address && (
            <p className="text-xs text-slate-600"><span className="font-semibold">📍 Dirección:</span> {doctor.office_address}</p>
          )}
          {appointmentMode === 'online' && (
            <p className="text-[10px] text-slate-500 italic">Recibirás el link de la videoconsulta por correo o WhatsApp.</p>
          )}
        </div>

        {/* Botón añadir al calendario (genera URL de Google Calendar) */}
        {selectedSlot && (
          <a
            href={(() => {
              const start = new Date(`${selectedSlot.date}T${selectedSlot.time}:00-04:00`)
              const end = new Date(start.getTime() + 30 * 60000)
              const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
              const title = encodeURIComponent(`Consulta con ${doctor.full_name}`)
              const details = encodeURIComponent(
                `Plan: ${selectedPlan?.name || 'Consulta'}\n` +
                (bookedCode ? `Código: ${bookedCode}\n` : '') +
                (selectedOffice ? `Dirección: ${selectedOffice.address}, ${selectedOffice.city}` : '')
              )
              const location = encodeURIComponent(
                appointmentMode === 'online'
                  ? 'Videoconsulta online'
                  : (selectedOffice ? `${selectedOffice.address}, ${selectedOffice.city}` : doctor.office_address || '')
              )
              return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${fmt(start)}/${fmt(end)}&details=${details}&location=${location}`
            })()}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 mb-3"
          >
            📅 Añadir a Google Calendar
          </a>
        )}
        {usingPackage && activePackage && activePackage.total_sessions - activePackage.used_sessions > 0 && (
          <div className="bg-violet-50 border border-violet-200 rounded-xl px-4 py-3 mb-4 text-left">
            <p className="text-xs text-violet-700 font-semibold">
              Te quedan {activePackage.total_sessions - activePackage.used_sessions} cita{activePackage.total_sessions - activePackage.used_sessions !== 1 ? 's' : ''} en tu paquete
            </p>
          </div>
        )}
        {usingPackage && activePackage && activePackage.total_sessions - activePackage.used_sessions <= 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 text-left">
            <p className="text-xs text-amber-700 font-semibold">
              Usaste todas las citas de tu paquete
            </p>
          </div>
        )}
        <p className="text-xs text-slate-400 mb-5">El médico confirmará tu cita y se pondrá en contacto contigo.</p>
        {authUser ? (
          <a href="/patient/dashboard" className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-white text-sm font-bold hover:opacity-90 transition-opacity" style={{ background: BRAND.turquoise }}>
            Ir a mi dashboard
          </a>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">¿Quieres crear una cuenta para ver tu historial?</p>
            <a href="/login" className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-white text-sm font-bold hover:opacity-90 transition-opacity" style={{ background: BRAND.turquoise }}>
              Crear cuenta
            </a>
          </div>
        )}
        <div className="flex items-center justify-center gap-2 mt-6 opacity-40">
          <DeltaIsotipo size={20} />
          <span className="text-[10px] font-semibold text-slate-400">Delta Medical CRM</span>
        </div>
      </div>
    </div>
  )

  // ── Auth Gate ─────────────────────────────────────────────────────────────
  if (!authReady) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: BRAND.bone }}>
      {fontStyle}
      <div className="flex items-center gap-3 text-slate-400">
        <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span className="text-sm">Cargando...</span>
      </div>
    </div>
  )

  // ── Main Accordion View ───────────────────────────────────────────────────
  return (
    <>
      {fontStyle}

      <div className="min-h-screen" style={{ background: BRAND.bone }}>
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="relative overflow-hidden" style={{ background: BRAND.gradient }}>
          {/* Decorative circles */}
          <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full opacity-10" style={{ background: 'white' }} />
          <div className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full opacity-5" style={{ background: 'white' }} />

          <div className="relative max-w-lg mx-auto px-5 py-6">
            {/* Top bar with Delta branding */}
            <div className="flex items-center gap-2 mb-4 opacity-70">
              <DeltaIsotipo size={22} className="brightness-200" />
              <span className="text-[11px] font-semibold text-white/80 tracking-wide">DELTA MEDICAL</span>
            </div>

            <div className="flex items-center gap-4 text-white">
              <div className="w-16 h-16 rounded-2xl bg-white/20 overflow-hidden flex items-center justify-center shrink-0 border-2 border-white/30 backdrop-blur-sm">
                {doctor.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={doctor.avatar_url} alt={doctor.full_name} className="w-full h-full object-cover" />
                ) : (
                  <Stethoscope className="w-7 h-7 text-white/80" />
                )}
              </div>
              <div>
                <h1 className="text-lg font-bold leading-tight">{getProfessionalTitle(doctor.professional_title, doctor.specialty)} {doctor.full_name}</h1>
                <p className="text-sm text-white/70 mt-0.5">{doctor.specialty || 'Médico especialista'}</p>
                {(doctor.city || doctor.state) && (
                  <div className="flex items-center gap-1 mt-1">
                    <MapPin className="w-3 h-3 text-white/50" />
                    <p className="text-xs text-white/50">{[doctor.city, doctor.state].filter(Boolean).join(', ')}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* RONDA 19a — Banner de PREVIEW MODE para doctor dueño / admin */}
        {previewModeBlocked && (
          <div className="max-w-lg mx-auto px-5 pt-4">
            <div className="bg-yellow-100 border border-yellow-300 text-yellow-800 p-4 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0 text-yellow-700" />
              <div className="text-sm">
                <p className="font-bold mb-0.5">
                  {isAdmin ? 'Modo previsualización' : 'Estás viendo tu link público'}
                </p>
                <p className="text-xs leading-relaxed">
                  {isAdmin
                    ? 'Como administrador no puedes generar registros de consulta reales desde el booking público. Esta vista es solo para previsualizar lo que ven tus pacientes.'
                    : 'Como administrador, no puedes agendar citas para ti mismo. Cierra sesión para probarlo como un paciente real, o úsalo solo para previsualizar.'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Steps ──────────────────────────────────────────────────────── */}
        <div className="max-w-lg mx-auto px-4 py-5 space-y-3">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-2">
              <span className="shrink-0 mt-0.5">⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* ── Step 1: Selecciona el plan ─────────────────────────────────── */}
          <AccordionSection
            step={1}
            currentStep={activeStep}
            title="Tipo de consulta"
            icon={FileText}
            summary={
              usingPackage && activePackage
                ? `${activePackage.plan_name} (paquete: ${activePackage.used_sessions}/${activePackage.total_sessions} usadas)`
                : selectedPlan ? `${selectedPlan.name} — $${planTotal(selectedPlan)} USD` : undefined
            }
            completed={!!selectedPlan && activeStep > 1}
            onOpen={() => setActiveStep(1)}
          >
            <div className="space-y-3">
              {/* Active package banner */}
              {activePackage && (
                <button
                  onClick={() => {
                    const matchingPlan = plans.find(p => p.name === activePackage.plan_name)
                    setSelectedPlan(matchingPlan || { id: 'package', name: activePackage.plan_name, price_usd: 0, duration_minutes: 30 })
                    setUsingPackage(true)
                    setActiveStep(2)
                  }}
                  className={`w-full text-left rounded-xl p-4 transition-all border-2 ${
                    usingPackage ? 'border-violet-500 bg-violet-50 shadow-md shadow-violet-100' : 'border-violet-300 bg-violet-50/50 hover:border-violet-500'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-slate-900">{activePackage.plan_name}</p>
                        <span className="text-[10px] font-bold text-violet-700 bg-violet-100 px-2 py-0.5 rounded-full">Paquete activo</span>
                      </div>
                      <p className="text-xs text-violet-600 mt-0.5">
                        Te quedan {activePackage.total_sessions - activePackage.used_sessions} cita{activePackage.total_sessions - activePackage.used_sessions !== 1 ? 's' : ''} — ya pagadas
                      </p>
                    </div>
                    <p className="text-lg font-extrabold text-emerald-600">Gratis</p>
                  </div>
                </button>
              )}

              {plans.map((plan, idx) => {
                const isSelected = selectedPlan?.id === plan.id
                const isMiddle = idx === Math.floor(plans.length / 2) && plans.length > 1
                return (
                  <button
                    key={plan.id}
                    onClick={() => {
                      setSelectedPlan(plan)
                      setUsingPackage(false)
                      setActiveStep(2)
                    }}
                    className={`relative w-full text-left rounded-xl p-4 transition-all ${
                      isSelected ? 'border-2 border-cyan-500 bg-cyan-50/50 shadow-md shadow-cyan-100' :
                      isMiddle ? 'border-2 border-cyan-300 bg-white hover:border-cyan-400' :
                      'border-2 border-slate-200 bg-white hover:border-cyan-300'
                    }`}
                  >
                    {isMiddle && !isSelected && <span className="absolute -top-2.5 left-3 text-[10px] font-bold bg-white px-2 py-0.5 rounded-full border border-cyan-200" style={{ color: BRAND.turquoise }}>Más elegido</span>}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold" style={{ color: BRAND.ink }}>{plan.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <p className="text-xs text-slate-500">{plan.duration_minutes} min</p>
                          {plan.sessions_count && plan.sessions_count > 1 && (
                            <span className="text-[10px] font-bold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">
                              {plan.sessions_count} sesiones
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-extrabold" style={{ color: BRAND.turquoise }}>${planTotal(plan)}</p>
                        {bcvRate && (
                          <p className="text-[11px] text-slate-400 mt-0.5">{toBs(planTotal(plan))}</p>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </AccordionSection>

          {/* ── Step 2: Selecciona el día ──────────────────────────────────── */}
          <AccordionSection
            step={2}
            currentStep={activeStep}
            title="Fecha de la cita"
            icon={Calendar}
            summary={selectedSlot ? selectedSlot.label : undefined}
            completed={!!selectedDate && activeStep > 2}
            onOpen={() => setActiveStep(2)}
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-xl px-3 py-2.5" style={{ background: BRAND.bone }}>
                <button onClick={() => setWeekOffset(Math.max(0, weekOffset - 1))} disabled={weekOffset === 0}
                  className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center disabled:opacity-30 hover:border-cyan-300 transition-colors">
                  <ChevronLeft className="w-3.5 h-3.5 text-slate-500" />
                </button>
                <span className="text-xs font-semibold text-slate-600">
                  {weekDates.length > 0 && `${new Date(weekDates[0]+'T12:00:00').toLocaleDateString('es-VE', { day: 'numeric', month: 'short' })} — ${new Date(weekDates[weekDates.length - 1]+'T12:00:00').toLocaleDateString('es-VE', { day: 'numeric', month: 'short' })}`}
                </span>
                <button onClick={() => setWeekOffset(weekOffset + 1)} disabled={(weekOffset + 1) * 5 >= dates.length}
                  className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center disabled:opacity-30 hover:border-cyan-300 transition-colors">
                  <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                </button>
              </div>

              {/* Date cards */}
              <div className="grid grid-cols-5 gap-2">
                {weekDates.map(date => {
                  const d = new Date(date + 'T12:00:00')
                  const dayName = d.toLocaleDateString('es-VE', { weekday: 'short' })
                  const dayNum = d.getDate()
                  const monthName = d.toLocaleDateString('es-VE', { month: 'short' })
                  const isSel = selectedDate === date
                  const availCount = grouped[date]?.filter(s => !isSlotBooked(s.date, s.time)).length || 0

                  return (
                    <button
                      key={date}
                      onClick={() => {
                        setSelectedDate(date)
                        setSelectedSlot(null)
                      }}
                      className={`rounded-xl p-2.5 text-center transition-all ${
                        isSel ? 'text-white shadow-lg shadow-cyan-500/20' :
                        availCount === 0 ? 'bg-slate-100 text-slate-300 cursor-not-allowed' :
                        'bg-white border border-slate-200 hover:border-cyan-300 text-slate-700'
                      }`}
                      style={isSel ? { background: BRAND.turquoise } : undefined}
                      disabled={availCount === 0}
                    >
                      <p className={`text-[10px] font-semibold uppercase ${isSel ? 'text-white/80' : 'text-slate-400'}`}>{dayName}</p>
                      <p className={`text-lg font-bold ${isSel ? 'text-white' : ''}`}>{dayNum}</p>
                      <p className={`text-[10px] ${isSel ? 'text-white/70' : 'text-slate-400'}`}>{monthName}</p>
                    </button>
                  )
                })}
              </div>

              {/* Time slots for selected date */}
              {selectedDate && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Horarios disponibles — {new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {grouped[selectedDate]?.map(slot => {
                      const booked = isSlotBooked(slot.date, slot.time)
                      const isSel = selectedSlot?.date === slot.date && selectedSlot?.time === slot.time
                      return (
                        <button
                          key={slot.time}
                          onClick={() => {
                            if (!booked) {
                              setSelectedSlot(slot)
                              setActiveStep(3)
                            }
                          }}
                          disabled={booked}
                          className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                            booked ? 'bg-slate-100 text-slate-300 cursor-not-allowed line-through' :
                            isSel ? 'text-white shadow-md shadow-cyan-500/20' :
                            'bg-white border border-slate-200 text-slate-700 hover:border-cyan-400'
                          }`}
                          style={isSel ? { background: BRAND.turquoise } : undefined}
                        >
                          {slot.time}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </AccordionSection>

          {/* ── Step 3: Modalidad ──────────────────────────────────────────── */}
          <AccordionSection
            step={3}
            currentStep={activeStep}
            title="Modalidad"
            icon={MapPin}
            summary={appointmentMode === 'online' ? 'Videoconsulta (online)' : appointmentMode === 'presencial' ? 'Presencial' : undefined}
            completed={!!appointmentMode && activeStep > 3}
            onOpen={() => setActiveStep(3)}
          >
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={() => { setAppointmentMode('presencial'); setActiveStep(4) }}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    appointmentMode === 'presencial' ? 'border-cyan-500 bg-cyan-50/50 shadow-md shadow-cyan-100' : 'border-slate-200 bg-white hover:border-cyan-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: appointmentMode === 'presencial' ? '#06B6D410' : '#f1f5f9' }}>
                      <MapPin className="w-5 h-5" style={{ color: appointmentMode === 'presencial' ? BRAND.turquoise : '#94a3b8' }} />
                    </div>
                    <div>
                      <p className="font-bold" style={{ color: BRAND.ink }}>Presencial</p>
                      <p className="text-xs text-slate-500">En el consultorio</p>
                    </div>
                  </div>
                </button>

                {doctor.allows_online !== false && (
                  <button
                    onClick={() => { setAppointmentMode('online'); setSelectedOffice(null); setActiveStep(4) }}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${
                      appointmentMode === 'online' ? 'border-blue-500 bg-blue-50/50 shadow-md shadow-blue-100' : 'border-slate-200 bg-white hover:border-blue-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: appointmentMode === 'online' ? '#3b82f610' : '#f1f5f9' }}>
                        <Video className="w-5 h-5" style={{ color: appointmentMode === 'online' ? '#3b82f6' : '#94a3b8' }} />
                      </div>
                      <div>
                        <p className="font-bold" style={{ color: BRAND.ink }}>Online</p>
                        <p className="text-xs text-slate-500">Videollamada</p>
                      </div>
                    </div>
                  </button>
                )}
              </div>

              {/* Show assigned office for the selected date */}
              {appointmentMode === 'presencial' && selectedOffice && (
                <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <MapPin className="w-4 h-4 shrink-0 mt-0.5" style={{ color: BRAND.turquoise }} />
                    <div>
                      <p className="text-sm font-bold" style={{ color: BRAND.ink }}>{selectedOffice.name}</p>
                      <p className="text-xs text-cyan-700 mt-0.5">{selectedOffice.address}, {selectedOffice.city}</p>
                      {selectedOffice.phone && <p className="text-xs text-cyan-600 mt-0.5">{selectedOffice.phone}</p>}
                    </div>
                  </div>
                </div>
              )}
              {appointmentMode === 'presencial' && !selectedOffice && selectedDate && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <p className="text-xs text-amber-700">{doctor.office_address || 'Consulta con el médico la dirección del consultorio para este día.'}</p>
                </div>
              )}
            </div>
          </AccordionSection>

          {/* ── Step 4: Tus datos ──────────────────────────────────────────── */}
          <AccordionSection
            step={4}
            currentStep={activeStep}
            title="Tus datos"
            icon={User}
            summary={
              authUser
                ? `${form.full_name || authUser.user_metadata?.full_name || authUser.email} (registrado)`
                : guestMode && form.full_name
                  ? `${form.full_name} (invitado)`
                  : undefined
            }
            completed={(!!authUser || (guestMode && !!form.full_name && !!form.email)) && activeStep > 4}
            onOpen={() => setActiveStep(4)}
          >
            <div className="space-y-4">
              {authUser ? (
                <div className="space-y-3">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center">
                        <Check className="w-4 h-4 text-emerald-600" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-emerald-800">Sesión iniciada</p>
                        <p className="text-xs text-emerald-600">{authUser.email}</p>
                      </div>
                    </div>
                    <div className="space-y-1 ml-12">
                      <p className="text-xs text-slate-600"><span className="font-semibold">Nombre:</span> {form.full_name || authUser.user_metadata?.full_name}</p>
                      {(form.phone || authUser.user_metadata?.phone) && (
                        <p className="text-xs text-slate-600"><span className="font-semibold">Teléfono:</span> {form.phone || authUser.user_metadata?.phone}</p>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveStep(usingPackage ? 6 : 5)}
                    className="w-full py-3 rounded-xl text-sm font-bold transition-all text-white hover:opacity-90"
                    style={{ background: BRAND.turquoise }}
                  >
                    Continuar
                  </button>
                </div>
              ) : !guestMode && !authMode ? (
                <div className="space-y-3">
                  <p className="text-sm text-slate-600">Puedes iniciar sesión para acceder a tus paquetes prepagados, o continuar como invitado.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setAuthMode('login')}
                      className="p-4 rounded-xl border-2 border-cyan-300 bg-white hover:border-cyan-500 text-left transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-xl bg-cyan-50 flex items-center justify-center shrink-0">
                          <LogIn className="w-5 h-5" style={{ color: BRAND.turquoise }} />
                        </div>
                        <div>
                          <p className="font-bold" style={{ color: BRAND.ink }}>Iniciar sesión</p>
                          <p className="text-xs text-slate-500">Accede a tus paquetes</p>
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setGuestMode(true)}
                      className="p-4 rounded-xl border-2 border-slate-200 bg-white hover:border-cyan-300 text-left transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-xl bg-slate-50 flex items-center justify-center shrink-0">
                          <UserPlus className="w-5 h-5 text-slate-400" />
                        </div>
                        <div>
                          <p className="font-bold" style={{ color: BRAND.ink }}>Continuar como invitado</p>
                          <p className="text-xs text-slate-500">Sin crear cuenta</p>
                        </div>
                      </div>
                    </button>
                  </div>
                </div>
              ) : authMode === 'login' ? (
                <form onSubmit={handleAuthLogin} className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Email</label>
                    <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={fi} required placeholder="tu@email.com" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Contraseña</label>
                    <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} className={fi} required placeholder="••••••••" />
                  </div>
                  <button type="submit" disabled={submitting} className="w-full text-white py-3 rounded-xl text-sm font-bold transition-all hover:opacity-90 disabled:opacity-60" style={{ background: BRAND.turquoise }}>
                    {submitting ? 'Verificando...' : 'Iniciar sesión'}
                  </button>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setAuthMode('register')} className="text-xs font-semibold hover:underline" style={{ color: BRAND.turquoise }}>Crear cuenta nueva</button>
                    <span className="text-xs text-slate-300">|</span>
                    <button type="button" onClick={() => { setAuthMode(null); setGuestMode(true) }} className="text-xs text-slate-500 hover:underline">Continuar sin cuenta</button>
                  </div>
                </form>
              ) : authMode === 'register' ? (
                <form onSubmit={handleAuthRegister} className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Nombre completo</label>
                    <input type="text" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} className={fi} required placeholder="Tu nombre" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Cédula</label>
                    {/* L6 (2026-04-29): cedula canonica V-XXXXXXXX */}
                    <CedulaInput value={form.cedula} onChange={v => setForm(f => ({ ...f, cedula: v }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Teléfono</label>
                    {/* L6 (2026-04-29): canonico 584XXXXXXXXX listo para wa.me */}
                    <PhoneInput value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Email</label>
                    <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={fi} required placeholder="tu@email.com" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Contraseña</label>
                    <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} className={fi} required placeholder="Mínimo 6 caracteres" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Confirmar contraseña</label>
                    <input type="password" value={form.passwordConfirm} onChange={e => setForm(f => ({ ...f, passwordConfirm: e.target.value }))} className={fi} required placeholder="Repite tu contraseña" />
                  </div>

                  {/* RONDA 33: Datos clinicos opcionales — colapsable para no saturar el form */}
                  <details className="border border-slate-200 rounded-xl bg-slate-50">
                    <summary className="cursor-pointer px-3 py-2.5 text-xs font-semibold text-slate-700 flex items-center justify-between">
                      <span>Datos clínicos (opcional)</span>
                      <span className="text-slate-400">+ agregar</span>
                    </summary>
                    <div className="p-3 space-y-2.5 bg-white border-t border-slate-200 rounded-b-xl">
                      <p className="text-[11px] text-slate-500">Estos datos ayudan a tu médico. Puedes saltarlos y completarlos más tarde desde tu perfil.</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-600 mb-1">Fecha de nacimiento</label>
                          <input type="date" value={form.birth_date} onChange={e => setForm(f => ({ ...f, birth_date: e.target.value }))} className={fi} />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-600 mb-1">Sexo</label>
                          <select value={form.sex} onChange={e => setForm(f => ({ ...f, sex: e.target.value as any }))} className={fi}>
                            <option value="">Seleccionar…</option>
                            <option value="female">Femenino</option>
                            <option value="male">Masculino</option>
                            <option value="other">Otro</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-600 mb-1">Tipo de sangre</label>
                        <select value={form.blood_type} onChange={e => setForm(f => ({ ...f, blood_type: e.target.value }))} className={fi}>
                          <option value="">No registrado</option>
                          {['O+','O-','A+','A-','B+','B-','AB+','AB-'].map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-600 mb-1">Alergias</label>
                        <textarea rows={2} value={form.allergies} onChange={e => setForm(f => ({ ...f, allergies: e.target.value }))} className={fi + ' resize-none'} placeholder="Penicilina, mariscos…" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-600 mb-1">Antecedentes / Enfermedades crónicas</label>
                        <textarea rows={2} value={form.chronic_conditions} onChange={e => setForm(f => ({ ...f, chronic_conditions: e.target.value }))} className={fi + ' resize-none'} placeholder="Diabetes, hipertensión…" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-600 mb-1">Dirección</label>
                          <input type="text" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className={fi} placeholder="Av. principal…" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-600 mb-1">Ciudad</label>
                          <input type="text" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} className={fi} placeholder="Caracas" />
                        </div>
                      </div>
                      <div className="pt-2 border-t border-slate-100">
                        <p className="text-[10px] font-semibold text-slate-500 uppercase mb-1.5">Contacto de emergencia</p>
                        <div className="grid grid-cols-2 gap-2">
                          <input type="text" value={form.emergency_contact_name} onChange={e => setForm(f => ({ ...f, emergency_contact_name: e.target.value }))} className={fi} placeholder="Nombre" />
                          {/* L6 (2026-04-29): canonico para contacto de emergencia */}
                          <PhoneInput value={form.emergency_contact_phone} onChange={v => setForm(f => ({ ...f, emergency_contact_phone: v }))} />
                        </div>
                      </div>
                    </div>
                  </details>

                  <button type="submit" disabled={submitting} className="w-full text-white py-3 rounded-xl text-sm font-bold transition-all hover:opacity-90 disabled:opacity-60" style={{ background: BRAND.turquoise }}>
                    {submitting ? 'Registrando...' : 'Crear cuenta y continuar'}
                  </button>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setAuthMode('login')} className="text-xs font-semibold hover:underline" style={{ color: BRAND.turquoise }}>Ya tengo cuenta</button>
                    <span className="text-xs text-slate-300">|</span>
                    <button type="button" onClick={() => { setAuthMode(null); setGuestMode(true) }} className="text-xs text-slate-500 hover:underline">Continuar sin cuenta</button>
                  </div>
                </form>
              ) : (
                <div className="space-y-3">
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                    <p className="text-xs text-amber-700"><span className="font-semibold">Nota:</span> Como invitado no podrás usar paquetes prepagados ni ver tu historial.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Nombre completo <span className="text-red-500">*</span></label>
                    <input type="text" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} className={fi} required placeholder="Tu nombre completo" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Email <span className="text-red-500">*</span></label>
                    <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={fi} required placeholder="tu@email.com" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Teléfono</label>
                    {/* L6 (2026-04-29): canonico 584XXXXXXXXX (modo invitado) */}
                    <PhoneInput value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Cédula</label>
                    {/* L6 (2026-04-29): cedula canonica (modo invitado) */}
                    <CedulaInput value={form.cedula} onChange={v => setForm(f => ({ ...f, cedula: v }))} />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!form.full_name.trim() || !form.email.trim()) {
                        setError('Nombre y email son requeridos')
                        return
                      }
                      setError('')
                      setActiveStep(usingPackage ? 6 : 5)
                    }}
                    className="w-full text-white py-3 rounded-xl text-sm font-bold transition-all hover:opacity-90"
                    style={{ background: BRAND.turquoise }}
                  >
                    Continuar
                  </button>
                  <button type="button" onClick={() => { setGuestMode(false); setAuthMode('login') }} className="text-xs font-semibold hover:underline" style={{ color: BRAND.turquoise }}>
                    Prefiero iniciar sesión
                  </button>
                </div>
              )}
            </div>
          </AccordionSection>

          {/* ── Step 5: Método de pago (skip if using package) ─────────────── */}
          {!usingPackage && (
          <AccordionSection
            step={5}
            currentStep={activeStep}
            title="Método de pago"
            icon={CreditCard}
            summary={
              useInsurance ? `Seguro: ${selectedInsurance}` :
              selectedPaymentMethod ? PAYMENT_LABELS[selectedPaymentMethod as PaymentMethod] : undefined
            }
            completed={(!!selectedPaymentMethod || (useInsurance && !!selectedInsurance)) && activeStep > 5}
            onOpen={() => setActiveStep(5)}
          >
            <div className="space-y-4">
              {/* Amount reminder */}
              {selectedPlan && (
                <div className="flex items-center justify-between rounded-xl px-4 py-3" style={{ background: BRAND.bone }}>
                  <span className="text-xs font-semibold text-slate-500">Monto a pagar</span>
                  <div className="text-right">
                    <span className="text-sm font-bold" style={{ color: BRAND.ink }}>${planTotal(selectedPlan)} USD</span>
                    {bcvRate && (
                      <span className="block text-[11px] text-slate-400">{toBs(planTotal(selectedPlan))}</span>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {(paymentMethods.length > 0
                    ? paymentMethods
                    : ['pago_movil', 'transferencia', 'zelle', 'cash_usd']
                  ).map(method => (
                    <button key={method} type="button"
                      onClick={() => setSelectedPaymentMethod(method as PaymentMethod)}
                      className={`p-3 rounded-xl border-2 text-left text-sm font-semibold transition-all ${
                        selectedPaymentMethod === method ? 'border-cyan-500 bg-cyan-50/50 shadow-sm' : 'border-slate-200 bg-white hover:border-cyan-300'
                      }`}>
                      {PAYMENT_LABELS[method as PaymentMethod] || method}
                    </button>
                  ))}
                </div>

                {/* Show payment details for transfer methods */}
                {selectedPaymentMethod && requiresReceipt(selectedPaymentMethod as PaymentMethod) && paymentDetails?.[selectedPaymentMethod] && (
                  <div className="rounded-xl p-3.5 border border-slate-200 space-y-1 text-xs" style={{ background: BRAND.bone }}>
                    <p className="font-bold text-slate-700">Datos para transferencia:</p>
                    {Object.entries(paymentDetails[selectedPaymentMethod] || {}).map(([key, val]) => (
                      val ? <p key={key} className="text-slate-600"><span className="font-semibold capitalize">{key}:</span> {String(val)}</p> : null
                    ))}
                  </div>
                )}

                {/* Receipt upload */}
                {selectedPaymentMethod && requiresReceipt(selectedPaymentMethod as PaymentMethod) && (
                  <div className="border border-dashed border-slate-300 rounded-xl p-4 space-y-2" style={{ background: `${BRAND.coral}08` }}>
                    <p className="text-sm font-medium text-slate-700">Comprobante de pago <span className="text-red-500">*</span></p>
                    <label className="flex items-center justify-center border-2 border-dashed rounded-xl p-4 cursor-pointer hover:bg-white/50 transition-colors" style={{ borderColor: `${BRAND.coral}40` }}>
                      <input type="file" accept="image/*,application/pdf" onChange={e => setPaymentFile(e.target.files?.[0] || null)} className="hidden" />
                      <div className="text-center">
                        <Upload className="w-5 h-5 mx-auto mb-1" style={{ color: BRAND.coral }} />
                        <p className="text-sm font-medium text-slate-700">{paymentFile ? paymentFile.name : 'Sube comprobante (JPG, PNG, PDF)'}</p>
                      </div>
                    </label>
                    {paymentFile && <p className="text-xs text-slate-500">{paymentFile.name} ({(paymentFile.size / 1024 / 1024).toFixed(2)} MB)</p>}
                  </div>
                )}

                {/* Cash note */}
                {selectedPaymentMethod && !requiresReceipt(selectedPaymentMethod as PaymentMethod) && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                    <p className="text-xs text-emerald-700"><span className="font-semibold">Nota:</span> Pagarás el día de la consulta ({PAYMENT_LABELS[selectedPaymentMethod as PaymentMethod]})</p>
                  </div>
                )}
              </div>

              {/* Continue button */}
              {selectedPaymentMethod && (
                <button
                  type="button"
                  onClick={() => setActiveStep(6)}
                  className="w-full text-white py-3 rounded-xl text-sm font-bold transition-all hover:opacity-90"
                  style={{ background: BRAND.turquoise }}
                >
                  Continuar
                </button>
              )}
            </div>
          </AccordionSection>
          )}

          {/* ── Step 6: Motivo y confirmación ──────────────────────────────── */}
          <AccordionSection
            step={6}
            currentStep={activeStep}
            title="Confirmar cita"
            icon={CheckCircle}
            summary={undefined}
            completed={false}
            onOpen={() => {}}
          >
            <div className="space-y-4">
              {/* Summary card */}
              <div className={`rounded-xl p-4 space-y-3 text-sm ${usingPackage ? 'bg-violet-50 border border-violet-200' : 'bg-cyan-50/50 border border-cyan-200'}`}>
                <div className="flex items-center justify-between">
                  <span className={`font-bold ${usingPackage ? 'text-violet-700' : ''}`} style={!usingPackage ? { color: BRAND.ink } : undefined}>{selectedPlan?.name}</span>
                  {usingPackage && activePackage ? (
                    <span className="text-xs font-bold text-violet-700 bg-violet-100 px-2.5 py-1 rounded-full">
                      Paquete ({activePackage.used_sessions + 1}/{activePackage.total_sessions})
                    </span>
                  ) : (
                    <div className="text-right">
                      <span className="font-bold" style={{ color: BRAND.ink }}>${selectedPlan ? planTotal(selectedPlan) : 0} USD</span>
                      {bcvRate && selectedPlan && (
                        <span className="block text-[11px] text-slate-400">{toBs(planTotal(selectedPlan))}</span>
                      )}
                    </div>
                  )}
                </div>
                <div className={`flex items-center gap-2 text-xs ${usingPackage ? 'text-violet-600' : 'text-cyan-700'}`}>
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{selectedSlot?.label} a las {selectedSlot?.time}</span>
                </div>
                <div className={`flex items-center gap-2 text-xs font-semibold px-2.5 py-1.5 rounded-lg w-fit ${
                  appointmentMode === 'online' ? 'bg-blue-100 text-blue-700' : usingPackage ? 'bg-violet-100 text-violet-700' : 'bg-cyan-100 text-cyan-700'
                }`}>
                  {appointmentMode === 'online' ? <Video className="w-3 h-3" /> : <MapPin className="w-3 h-3" />}
                  {appointmentMode === 'online' ? 'Videoconsulta' : 'Presencial'}
                </div>
                {!usingPackage && (
                  <div className="flex items-center gap-2 text-xs text-cyan-700">
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>{useInsurance ? `Seguro: ${selectedInsurance}` : PAYMENT_LABELS[selectedPaymentMethod as PaymentMethod]}</span>
                  </div>
                )}
                {usingPackage && (
                  <p className="text-xs text-violet-600 font-medium">Ya pagado con tu paquete activo</p>
                )}
              </div>

              {/* Patient info */}
              <div className="rounded-xl p-3.5 space-y-1" style={{ background: BRAND.bone }}>
                <p className="text-xs text-slate-600"><span className="font-semibold">Paciente:</span> {form.full_name || authUser?.user_metadata?.full_name}</p>
                <p className="text-xs text-slate-600"><span className="font-semibold">Email:</span> {authUser?.email || form.email}</p>
                {(form.phone || authUser?.user_metadata?.phone) && (
                  <p className="text-xs text-slate-600"><span className="font-semibold">Teléfono:</span> {form.phone || authUser?.user_metadata?.phone}</p>
                )}
                {!authUser && (
                  <p className="text-[10px] text-amber-600 mt-1 font-medium">Agendando como invitado</p>
                )}
              </div>

              {/* Motivo */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Motivo de consulta (opcional)</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  rows={2}
                  placeholder="Describe brevemente tu motivo..."
                  className={fi + ' resize-none'}
                />
              </div>

              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || previewModeBlocked}
                className="w-full py-3.5 rounded-xl text-sm font-bold text-white hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 transition-all"
                style={{ background: previewModeBlocked ? '#94a3b8' : BRAND.gradient }}
              >
                {submitting ? (
                  <>
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Confirmando...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Confirmar cita
                  </>
                )}
              </button>
            </div>
          </AccordionSection>

          {/* ── Footer branding ──────────────────────────────────────────── */}
          <div className="flex items-center justify-center gap-2 py-4 opacity-30">
            <DeltaIsotipo size={18} />
            <span className="text-[10px] font-semibold text-slate-400">Delta Medical CRM</span>
          </div>
        </div>
      </div>
    </>
  )
}
