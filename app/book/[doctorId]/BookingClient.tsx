'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Calendar, Clock, User, Phone, Mail, CheckCircle, Activity,
  ChevronLeft, ChevronRight, ChevronDown, Upload, Video, MapPin,
  CreditCard, FileText, Shield, Check, LogIn, UserPlus
} from 'lucide-react'
import { getProfessionalTitle } from '@/lib/professional-title'

// ── Types ──────────────────────────────────────────────────────────────────
type DoctorProfile = { id: string; full_name: string; specialty: string; phone: string; avatar_url: string | null; professional_title?: string; state?: string | null; city?: string | null; country?: string; office_address?: string | null; allows_online?: boolean }
type PricingPlan = { id: string; name: string; price_usd: number; duration_minutes: number; sessions_count?: number }
type Slot = { date: string; time: string; label: string }
type PaymentMethod = 'pago_movil' | 'transferencia' | 'zelle' | 'binance' | 'cash_usd' | 'cash_bs' | 'pos'
type ActivePackage = { id: string; plan_name: string; total_sessions: number; used_sessions: number }

// ── Helpers ────────────────────────────────────────────────────────────────
function generateSlots(): Slot[] {
  const slots: Slot[] = []
  const times = ['08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
                 '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30']
  const today = new Date()
  for (let d = 1; d <= 21; d++) {
    const date = new Date(today)
    date.setDate(today.getDate() + d)
    if (date.getDay() === 0) continue
    const dateStr = date.toISOString().split('T')[0]
    const dayLabel = date.toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'short' })
    times.forEach(t => slots.push({ date: dateStr, time: t, label: dayLabel }))
  }
  return slots
}

function groupByDate(slots: Slot[]) {
  const map: Record<string, Slot[]> = {}
  slots.forEach(s => { if (!map[s.date]) map[s.date] = []; map[s.date].push(s) })
  return map
}

const fi = 'w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 bg-white transition-colors'

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
    <div className={`border rounded-xl overflow-hidden transition-all ${
      isOpen ? 'border-teal-400 shadow-md bg-white' :
      isPast ? 'border-emerald-200 bg-emerald-50/50' :
      'border-slate-200 bg-slate-50/50'
    }`}>
      <button
        type="button"
        onClick={isPast ? onOpen : undefined}
        className={`w-full flex items-center gap-3 px-5 py-4 text-left transition-colors ${
          isPast ? 'cursor-pointer hover:bg-emerald-50' : isFuture ? 'cursor-default opacity-50' : ''
        }`}
      >
        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
          isPast ? 'bg-emerald-500' : isOpen ? 'bg-teal-500' : 'bg-slate-200'
        }`}>
          {isPast ? <Check className="w-4 h-4 text-white" /> : <Icon className={`w-4 h-4 ${isOpen ? 'text-white' : 'text-slate-400'}`} />}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${isPast ? 'text-emerald-700' : isOpen ? 'text-slate-900' : 'text-slate-400'}`}>
            {step}. {title}
          </p>
          {isPast && summary && (
            <p className="text-xs text-emerald-600 mt-0.5 truncate">{summary}</p>
          )}
        </div>
        {isPast && (
          <ChevronDown className="w-4 h-4 text-emerald-400 shrink-0" />
        )}
      </button>
      {isOpen && (
        <div className="px-5 pb-5 pt-1">
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
  // Auth state
  const [authUser, setAuthUser] = useState<any>(null)
  const [authReady, setAuthReady] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'register' | null>(null)

  // Accordion step (1-7)
  const [activeStep, setActiveStep] = useState(1)
  const [guestMode, setGuestMode] = useState(false)

  // Active package (prepaid sessions)
  const [activePackage, setActivePackage] = useState<ActivePackage | null>(null)
  const [usingPackage, setUsingPackage] = useState(false)

  // Selections
  const [selectedPlan, setSelectedPlan] = useState<PricingPlan | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
  const [appointmentMode, setAppointmentMode] = useState<'presencial' | 'online' | ''>('')
  const [useInsurance, setUseInsurance] = useState(false)
  const [selectedInsurance, setSelectedInsurance] = useState('')
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod | ''>('')
  const [paymentFile, setPaymentFile] = useState<File | null>(null)

  // Form
  const [form, setForm] = useState({ full_name: '', phone: '', email: '', cedula: '', notes: '', password: '', passwordConfirm: '' })
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  // Slot navigation
  const [weekOffset, setWeekOffset] = useState(0)
  const mockInsurances = ['Seguros Mercantil', 'Mapfre', 'La Previsora', 'ABA Seguros']

  const allSlots = generateSlots()
  const grouped = groupByDate(allSlots)
  const dates = Object.keys(grouped).sort()
  const weekDates = dates.slice(weekOffset * 5, weekOffset * 5 + 5)

  const isSlotBooked = (date: string, time: string): boolean => {
    const slotISO = new Date(`${date}T${time}:00`).toISOString()
    const slotTime = new Date(slotISO).getTime()
    const bufferMs = 30 * 60 * 1000
    return bookedSlots.some(bookedISO => {
      const bookedTime = new Date(bookedISO).getTime()
      return Math.abs(bookedTime - slotTime) < bufferMs
    })
  }

  // Fetch active packages for this doctor
  const fetchActivePackages = async (userId: string) => {
    try {
      const supabase = createClient()
      const { data: pkgs } = await supabase
        .from('patient_packages')
        .select('id, plan_name, total_sessions, used_sessions')
        .eq('auth_user_id', userId)
        .eq('doctor_id', doctor.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (pkgs && pkgs.used_sessions < pkgs.total_sessions) {
        setActivePackage(pkgs)
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
      setAuthUser(data.user)
    } catch (err: any) {
      setError(err?.message || 'Error al registrarse')
    }
    setSubmitting(false)
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    setError('')

    if (!selectedSlot) { setError('Selecciona una fecha y hora'); return }
    if (!appointmentMode) { setError('Selecciona modalidad de consulta'); return }
    if (!usingPackage && !useInsurance && !selectedPaymentMethod) { setError('Selecciona un método de pago'); return }
    if (!usingPackage && useInsurance && !selectedInsurance) { setError('Selecciona tu seguro'); return }

    // Guest validation
    if (!authUser && (!form.full_name.trim() || !form.email.trim())) {
      setError('Nombre y email son requeridos'); return
    }

    setSubmitting(true)
    try {
      const supabase = createClient()
      let accessToken: string | null = null
      let sessionEmail: string | null = null

      // Get access token only if authenticated
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

      // Upload receipt if needed (skip if using package)
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

      const dateTime = new Date(`${selectedSlot.date}T${selectedSlot.time}:00`)
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
          planPrice: selectedPlan?.price_usd ?? 20,
          sessionsCount: selectedPlan?.sessions_count || 1,
          paymentMethod: usingPackage ? 'package' : useInsurance ? 'insurance' : selectedPaymentMethod,
          insuranceName: useInsurance ? selectedInsurance : null,
          receiptUrl,
          appointmentMode: appointmentMode || 'presencial',
          packageId: usingPackage ? activePackage?.id : null,
        }),
      })

      const result = await res.json()
      if (!res.ok || result.error) {
        setError(result.error || 'Error al agendar cita')
        setSubmitting(false)
        return
      }

      // Update package state after successful booking
      if (usingPackage && activePackage) {
        const newUsed = activePackage.used_sessions + 1
        if (newUsed >= activePackage.total_sessions) {
          setActivePackage(null)
        } else {
          setActivePackage({ ...activePackage, used_sessions: newUsed })
        }
      }

      setDone(true)
    } catch (err: any) {
      setError(err?.message || 'Error inesperado')
    }
    setSubmitting(false)
  }

  // ── Success View ──────────────────────────────────────────────────────────
  if (done) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');* { font-family: 'Inter', sans-serif; }.g-bg{background:linear-gradient(135deg,#00C4CC 0%,#0891b2 100%)}`}</style>
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-8 h-8 text-emerald-500" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">¡Cita agendada!</h2>
        <p className="text-sm text-slate-500 mb-4">
          Tu consulta con <strong>{getProfessionalTitle(doctor.professional_title, doctor.specialty)} {doctor.full_name}</strong> fue registrada.
        </p>
        <div className="bg-slate-50 rounded-xl p-4 text-left space-y-1.5 mb-5">
          <p className="text-xs text-slate-500"><span className="font-semibold">Fecha:</span> {selectedSlot?.label} a las {selectedSlot?.time}</p>
          {selectedPlan && (
            <p className="text-xs text-slate-500">
              <span className="font-semibold">Plan:</span> {selectedPlan.name}
              {usingPackage ? ' (paquete prepagado)' : ` — $${selectedPlan.price_usd} USD`}
            </p>
          )}
          <p className="text-xs text-slate-500"><span className="font-semibold">Modalidad:</span> {appointmentMode === 'online' ? 'Videoconsulta' : 'Presencial'}</p>
          {appointmentMode === 'presencial' && doctor.office_address && (
            <p className="text-xs text-slate-500"><span className="font-semibold">Dirección:</span> {doctor.office_address}</p>
          )}
        </div>
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
        <p className="text-xs text-slate-400 mb-4">El médico confirmará tu cita y se pondrá en contacto contigo.</p>
        {authUser ? (
          <a href="/patient/dashboard" className="inline-block g-bg px-6 py-2 rounded-lg text-white text-sm font-semibold hover:opacity-90">
            Ir a mi dashboard
          </a>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">¿Quieres crear una cuenta para ver tu historial?</p>
            <a href="/patient/register" className="inline-block g-bg px-6 py-2 rounded-lg text-white text-sm font-semibold hover:opacity-90">
              Crear cuenta
            </a>
          </div>
        )}
      </div>
    </div>
  )

  // ── Auth Gate ─────────────────────────────────────────────────────────────
  if (!authReady) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');* { font-family: 'Inter', sans-serif; }`}</style>
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
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');* { font-family: 'Inter', sans-serif; }.g-bg{background:linear-gradient(135deg,#00C4CC 0%,#0891b2 100%)}`}</style>

      <div className="min-h-screen bg-slate-50">
        {/* Compact Header */}
        <div className="g-bg">
          <div className="max-w-lg mx-auto px-4 py-5">
            <div className="flex items-center gap-4 text-white">
              <div className="w-14 h-14 rounded-full bg-white/20 overflow-hidden flex items-center justify-center shrink-0 border-2 border-white/30">
                {doctor.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={doctor.avatar_url} alt={doctor.full_name} className="w-full h-full object-cover" />
                ) : (
                  <Activity className="w-6 h-6 text-white" />
                )}
              </div>
              <div>
                <h1 className="text-lg font-bold">{getProfessionalTitle(doctor.professional_title, doctor.specialty)} {doctor.full_name}</h1>
                <p className="text-sm text-white/70">{doctor.specialty || 'Médico especialista'}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-lg mx-auto px-4 py-6 space-y-3">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</div>
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
                : selectedPlan ? `${selectedPlan.name} — $${selectedPlan.price_usd} USD` : undefined
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
                    usingPackage ? 'border-violet-500 bg-violet-50' : 'border-violet-300 bg-violet-50/50 hover:border-violet-500'
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
                      isSelected ? 'border-2 border-teal-500 bg-teal-50' :
                      isMiddle ? 'border-2 border-teal-300 bg-white' :
                      'border-2 border-slate-200 bg-white hover:border-teal-300'
                    }`}
                  >
                    {isMiddle && !isSelected && <span className="absolute -top-2.5 left-3 text-[10px] font-bold text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">Más elegido</span>}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold text-slate-900">{plan.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <p className="text-xs text-slate-500">{plan.duration_minutes} min</p>
                          {plan.sessions_count && plan.sessions_count > 1 && (
                            <span className="text-[10px] font-bold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">
                              {plan.sessions_count} sesiones
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-2xl font-extrabold text-teal-600">${plan.price_usd}</p>
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
              <div className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                <button onClick={() => setWeekOffset(Math.max(0, weekOffset - 1))} disabled={weekOffset === 0}
                  className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center disabled:opacity-30">
                  <ChevronLeft className="w-3.5 h-3.5 text-slate-500" />
                </button>
                <span className="text-xs font-semibold text-slate-600">
                  {weekDates.length > 0 && `${new Date(weekDates[0]+'T12:00:00').toLocaleDateString('es-VE', { day: 'numeric', month: 'short' })} — ${new Date(weekDates[weekDates.length - 1]+'T12:00:00').toLocaleDateString('es-VE', { day: 'numeric', month: 'short' })}`}
                </span>
                <button onClick={() => setWeekOffset(weekOffset + 1)} disabled={(weekOffset + 1) * 5 >= dates.length}
                  className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center disabled:opacity-30">
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
                        setSelectedSlot(null) // reset time when changing date
                      }}
                      className={`rounded-xl p-2.5 text-center transition-all ${
                        isSel ? 'bg-teal-500 text-white shadow-md' :
                        availCount === 0 ? 'bg-slate-100 text-slate-300 cursor-not-allowed' :
                        'bg-white border border-slate-200 hover:border-teal-300 text-slate-700'
                      }`}
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
                          className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                            booked ? 'bg-slate-100 text-slate-300 cursor-not-allowed line-through' :
                            isSel ? 'bg-teal-500 text-white shadow-md' :
                            'bg-white border border-slate-200 text-slate-700 hover:border-teal-400 hover:text-teal-600'
                          }`}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={() => { setAppointmentMode('presencial'); setActiveStep(4) }}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  appointmentMode === 'presencial' ? 'border-teal-500 bg-teal-50' : 'border-slate-200 bg-white hover:border-teal-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center shrink-0">
                    <MapPin className="w-5 h-5 text-teal-600" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-900">Presencial</p>
                    <p className="text-xs text-slate-500">En el consultorio</p>
                    {doctor.office_address && <p className="text-[10px] text-slate-400 mt-0.5">{doctor.office_address}</p>}
                  </div>
                </div>
              </button>

              {doctor.allows_online !== false && (
                <button
                  onClick={() => { setAppointmentMode('online'); setActiveStep(4) }}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    appointmentMode === 'online' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:border-blue-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                      <Video className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">Online</p>
                      <p className="text-xs text-slate-500">Videollamada</p>
                    </div>
                  </div>
                </button>
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
                /* Already authenticated — show summary and continue */
                <div className="space-y-3">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                        <Check className="w-4 h-4 text-emerald-600" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-emerald-800">Sesión iniciada</p>
                        <p className="text-xs text-emerald-600">{authUser.email}</p>
                      </div>
                    </div>
                    <div className="space-y-1 ml-11">
                      <p className="text-xs text-slate-600"><span className="font-semibold">Nombre:</span> {form.full_name || authUser.user_metadata?.full_name}</p>
                      {(form.phone || authUser.user_metadata?.phone) && (
                        <p className="text-xs text-slate-600"><span className="font-semibold">Teléfono:</span> {form.phone || authUser.user_metadata?.phone}</p>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveStep(usingPackage ? 6 : 5)}
                    className="w-full bg-teal-500 hover:bg-teal-600 text-white py-2.5 rounded-xl text-sm font-bold transition-colors"
                  >
                    Continuar
                  </button>
                </div>
              ) : !guestMode && !authMode ? (
                /* Choice: login or continue as guest */
                <div className="space-y-3">
                  <p className="text-sm text-slate-600">Puedes iniciar sesión para acceder a tus paquetes prepagados, o continuar como invitado.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setAuthMode('login')}
                      className="p-4 rounded-xl border-2 border-teal-300 bg-white hover:border-teal-500 text-left transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center shrink-0">
                          <LogIn className="w-5 h-5 text-teal-600" />
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">Iniciar sesión</p>
                          <p className="text-xs text-slate-500">Accede a tus paquetes</p>
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setGuestMode(true)}
                      className="p-4 rounded-xl border-2 border-slate-200 bg-white hover:border-teal-300 text-left transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                          <UserPlus className="w-5 h-5 text-slate-500" />
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">Continuar como invitado</p>
                          <p className="text-xs text-slate-500">Sin crear cuenta</p>
                        </div>
                      </div>
                    </button>
                  </div>
                </div>
              ) : authMode === 'login' ? (
                /* Login form */
                <form onSubmit={handleAuthLogin} className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Email</label>
                    <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={fi} required placeholder="tu@email.com" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Contraseña</label>
                    <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} className={fi} required placeholder="••••••••" />
                  </div>
                  <button type="submit" disabled={submitting} className="w-full bg-teal-500 hover:bg-teal-600 text-white py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-60">
                    {submitting ? 'Verificando...' : 'Iniciar sesión'}
                  </button>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setAuthMode('register')} className="text-xs text-teal-600 hover:underline">Crear cuenta nueva</button>
                    <span className="text-xs text-slate-300">|</span>
                    <button type="button" onClick={() => { setAuthMode(null); setGuestMode(true) }} className="text-xs text-slate-500 hover:underline">Continuar sin cuenta</button>
                  </div>
                </form>
              ) : authMode === 'register' ? (
                /* Register form */
                <form onSubmit={handleAuthRegister} className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre completo</label>
                    <input type="text" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} className={fi} required placeholder="Tu nombre" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Cédula</label>
                    <input type="text" value={form.cedula} onChange={e => setForm(f => ({ ...f, cedula: e.target.value }))} className={fi} placeholder="V-12345678" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Teléfono</label>
                    <input type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className={fi} placeholder="0412-1234567" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Email</label>
                    <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={fi} required placeholder="tu@email.com" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Contraseña</label>
                    <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} className={fi} required placeholder="Mínimo 6 caracteres" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Confirmar contraseña</label>
                    <input type="password" value={form.passwordConfirm} onChange={e => setForm(f => ({ ...f, passwordConfirm: e.target.value }))} className={fi} required placeholder="Repite tu contraseña" />
                  </div>
                  <button type="submit" disabled={submitting} className="w-full bg-teal-500 hover:bg-teal-600 text-white py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-60">
                    {submitting ? 'Registrando...' : 'Crear cuenta y continuar'}
                  </button>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setAuthMode('login')} className="text-xs text-teal-600 hover:underline">Ya tengo cuenta</button>
                    <span className="text-xs text-slate-300">|</span>
                    <button type="button" onClick={() => { setAuthMode(null); setGuestMode(true) }} className="text-xs text-slate-500 hover:underline">Continuar sin cuenta</button>
                  </div>
                </form>
              ) : (
                /* Guest form */
                <div className="space-y-3">
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <p className="text-xs text-amber-700"><span className="font-semibold">Nota:</span> Como invitado no podrás usar paquetes prepagados ni ver tu historial.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre completo <span className="text-red-500">*</span></label>
                    <input type="text" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} className={fi} required placeholder="Tu nombre completo" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Email <span className="text-red-500">*</span></label>
                    <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={fi} required placeholder="tu@email.com" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Teléfono</label>
                    <input type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className={fi} placeholder="0412-1234567" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Cédula</label>
                    <input type="text" value={form.cedula} onChange={e => setForm(f => ({ ...f, cedula: e.target.value }))} className={fi} placeholder="V-12345678" />
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
                    className="w-full bg-teal-500 hover:bg-teal-600 text-white py-2.5 rounded-xl text-sm font-bold transition-colors"
                  >
                    Continuar
                  </button>
                  <button type="button" onClick={() => { setGuestMode(false); setAuthMode('login') }} className="text-xs text-teal-600 hover:underline">
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
              {/* Toggle: Pago directo vs Seguro */}
              <div className="grid grid-cols-2 gap-2">
                <button type="button"
                  onClick={() => { setUseInsurance(false); setSelectedPaymentMethod('') }}
                  className={`p-3 rounded-lg border-2 text-sm font-semibold transition-all ${!useInsurance ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                  💵 Pago directo
                </button>
                <button type="button"
                  onClick={() => { setUseInsurance(true); setSelectedPaymentMethod('') }}
                  className={`p-3 rounded-lg border-2 text-sm font-semibold transition-all ${useInsurance ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                  🏥 Seguro médico
                </button>
              </div>

              {/* Payment methods */}
              {!useInsurance && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    {(paymentMethods.length > 0
                      ? paymentMethods
                      : ['pago_movil', 'transferencia', 'zelle', 'cash_usd']
                    ).map(method => (
                      <button key={method} type="button"
                        onClick={() => setSelectedPaymentMethod(method as PaymentMethod)}
                        className={`p-3 rounded-lg border-2 text-left text-sm font-semibold transition-all ${
                          selectedPaymentMethod === method ? 'border-teal-500 bg-teal-50' : 'border-slate-200 bg-white hover:border-teal-300'
                        }`}>
                        {PAYMENT_LABELS[method as PaymentMethod] || method}
                      </button>
                    ))}
                  </div>

                  {/* Show payment details for transfer methods */}
                  {selectedPaymentMethod && requiresReceipt(selectedPaymentMethod as PaymentMethod) && paymentDetails?.[selectedPaymentMethod] && (
                    <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 space-y-1 text-xs">
                      <p className="font-bold text-slate-700">Datos para transferencia:</p>
                      {Object.entries(paymentDetails[selectedPaymentMethod] || {}).map(([key, val]) => (
                        val ? <p key={key} className="text-slate-600"><span className="font-semibold capitalize">{key}:</span> {String(val)}</p> : null
                      ))}
                    </div>
                  )}

                  {/* Receipt upload */}
                  {selectedPaymentMethod && requiresReceipt(selectedPaymentMethod as PaymentMethod) && (
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 space-y-2">
                      <p className="text-sm font-medium text-slate-700">Comprobante de pago <span className="text-red-500">*</span></p>
                      <label className="flex items-center justify-center border-2 border-dashed border-orange-300 rounded-lg p-4 cursor-pointer hover:bg-orange-100 transition-colors">
                        <input type="file" accept="image/*,application/pdf" onChange={e => setPaymentFile(e.target.files?.[0] || null)} className="hidden" />
                        <div className="text-center">
                          <Upload className="w-5 h-5 text-orange-500 mx-auto mb-1" />
                          <p className="text-sm font-medium text-slate-700">{paymentFile ? paymentFile.name : 'Sube comprobante (JPG, PNG, PDF)'}</p>
                        </div>
                      </label>
                      {paymentFile && <p className="text-xs text-slate-500">{paymentFile.name} ({(paymentFile.size / 1024 / 1024).toFixed(2)} MB)</p>}
                    </div>
                  )}

                  {/* Cash note */}
                  {selectedPaymentMethod && !requiresReceipt(selectedPaymentMethod as PaymentMethod) && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                      <p className="text-xs text-green-700"><span className="font-semibold">Nota:</span> Pagarás el día de la consulta ({PAYMENT_LABELS[selectedPaymentMethod as PaymentMethod]})</p>
                    </div>
                  )}
                </div>
              )}

              {/* Insurance */}
              {useInsurance && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Selecciona tu seguro</label>
                  <select value={selectedInsurance} onChange={e => setSelectedInsurance(e.target.value)} className={fi}>
                    <option value="">-- Seleccionar seguro --</option>
                    {mockInsurances.map(ins => <option key={ins} value={ins}>{ins}</option>)}
                  </select>
                </div>
              )}

              {/* Continue button */}
              {(selectedPaymentMethod || (useInsurance && selectedInsurance)) && (
                <button
                  type="button"
                  onClick={() => setActiveStep(6)}
                  className="w-full bg-teal-500 hover:bg-teal-600 text-white py-2.5 rounded-xl text-sm font-bold transition-colors"
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
              <div className={`rounded-xl p-4 space-y-2 text-sm border ${usingPackage ? 'bg-violet-50 border-violet-200' : 'bg-teal-50 border-teal-200'}`}>
                <div className="flex items-center justify-between">
                  <span className={`font-semibold ${usingPackage ? 'text-violet-700' : 'text-teal-700'}`}>{selectedPlan?.name}</span>
                  {usingPackage && activePackage ? (
                    <span className="text-xs font-bold text-violet-700 bg-violet-100 px-2.5 py-1 rounded-full">
                      Paquete ({activePackage.used_sessions + 1}/{activePackage.total_sessions})
                    </span>
                  ) : (
                    <span className="text-teal-800 font-bold">${selectedPlan?.price_usd} USD</span>
                  )}
                </div>
                <div className={`flex items-center gap-2 text-xs ${usingPackage ? 'text-violet-600' : 'text-teal-600'}`}>
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{selectedSlot?.label} a las {selectedSlot?.time}</span>
                </div>
                <div className={`flex items-center gap-2 text-xs font-semibold px-2.5 py-1 rounded-lg w-fit ${
                  appointmentMode === 'online' ? 'bg-blue-100 text-blue-700' : usingPackage ? 'bg-violet-100 text-violet-700' : 'bg-teal-100 text-teal-700'
                }`}>
                  {appointmentMode === 'online' ? <Video className="w-3 h-3" /> : <MapPin className="w-3 h-3" />}
                  {appointmentMode === 'online' ? 'Videoconsulta' : 'Presencial'}
                </div>
                {!usingPackage && (
                  <div className="flex items-center gap-2 text-xs text-teal-600">
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>{useInsurance ? `Seguro: ${selectedInsurance}` : PAYMENT_LABELS[selectedPaymentMethod as PaymentMethod]}</span>
                  </div>
                )}
                {usingPackage && (
                  <p className="text-xs text-violet-600">Ya pagado con tu paquete activo</p>
                )}
              </div>

              {/* Patient info */}
              <div className="bg-slate-50 rounded-lg p-3 space-y-1">
                <p className="text-xs text-slate-500"><span className="font-semibold">Paciente:</span> {form.full_name || authUser?.user_metadata?.full_name}</p>
                <p className="text-xs text-slate-500"><span className="font-semibold">Email:</span> {authUser?.email || form.email}</p>
                {(form.phone || authUser?.user_metadata?.phone) && (
                  <p className="text-xs text-slate-500"><span className="font-semibold">Teléfono:</span> {form.phone || authUser?.user_metadata?.phone}</p>
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
                disabled={submitting}
                className="w-full g-bg py-3 rounded-xl text-sm font-bold text-white hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
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
        </div>
      </div>
    </>
  )
}
