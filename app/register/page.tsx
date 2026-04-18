'use client'

export const dynamic = 'force-dynamic'

import { useState, useTransition, useRef, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  Activity, ArrowRight, Eye, EyeOff, Upload, CheckCircle2,
  Loader2, X, Stethoscope, Zap, ChevronLeft, Image, AlertCircle,
  TrendingUp, RefreshCw, Building2, Mail,
} from 'lucide-react'
import { registerDoctor, registerClinic, uploadPaymentReceipt, getPaymentAccounts, getBCVRate, getActivePlans, type PaymentAccount, type BCVRateResult, type PlanConfigPublic } from './actions'

const ESPECIALIDADES = [
  'Cardiología','Dermatología','Endocrinología','Gastroenterología',
  'Ginecología y Obstetricia','Medicina General','Medicina Interna',
  'Nefrología','Neurología','Oftalmología','Ortopedia y Traumatología',
  'Otorrinolaringología','Pediatría','Psicología','Psiquiatría',
  'Reumatología','Urología','Otra',
]

const PROFESSIONAL_TITLES = [
  { value: 'Dr.',  label: 'Doctor (Dr.)' },
  { value: 'Dra.', label: 'Doctora (Dra.)' },
  { value: 'Lic.', label: 'Licenciado/a (Lic.)' },
  { value: 'Psic.', label: 'Psicólogo/a (Psic.)' },
  { value: 'Odont.', label: 'Odontólogo/a (Odont.)' },
  { value: 'Nutr.', label: 'Nutricionista (Nutr.)' },
  { value: 'Fisio.', label: 'Fisioterapeuta (Fisio.)' },
]

type PlanType = 'trial' | 'basic' | 'professional' | 'clinic'

type FormData = {
  full_name: string; cedula: string; email: string
  password: string; confirmPassword: string
  specialty: string; phone: string; plan: PlanType
  sex: string; professional_title: string
  clinic_name: string; clinic_address: string; clinic_city: string
  clinic_state: string; clinic_phone: string; clinic_email: string
  clinic_specialty: string
}
type FormErrors = Partial<Record<keyof FormData, string>>

const defaultForm: FormData = {
  full_name: '', cedula: '', email: '',
  password: '', confirmPassword: '',
  specialty: '', phone: '', plan: 'trial', sex: '', professional_title: 'Dr.',
  clinic_name: '', clinic_address: '', clinic_city: '', clinic_state: '',
  clinic_phone: '', clinic_email: '', clinic_specialty: '',
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <RegisterInner />
    </Suspense>
  )
}

function RegisterInner() {
  const searchParams = useSearchParams()
  const planParam = searchParams.get('plan') as PlanType | null

  const [step, setStep] = useState(1) // Always start at form
  const [form, setForm] = useState<FormData>({ ...defaultForm, plan: planParam ?? 'trial' })
  const [activePlans, setActivePlans] = useState<PlanConfigPublic[]>([])
  const [plansLoaded, setPlansLoaded] = useState(false)

  // Load active plans from DB
  useEffect(() => {
    getActivePlans().then(plans => {
      setActivePlans(plans)
      setPlansLoaded(true)
      // If current plan is not active, default to first active plan
      if (plans.length > 0 && !plans.find(p => p.plan_key === form.plan)) {
        setForm(prev => ({ ...prev, plan: plans[0].plan_key as PlanType }))
      }
    })
  }, [])
  const [errors, setErrors] = useState<FormErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [doctorId, setDoctorId] = useState<string | null>(null)
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null)
  const [paymentAccounts, setPaymentAccounts] = useState<PaymentAccount[]>([])
  const [loadingAccounts, setLoadingAccounts] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [showConf, setShowConf] = useState(false)
  const [bcvRate, setBcvRate] = useState<BCVRateResult>(null)
  const [loadingBCV, setLoadingBCV] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isClinic = form.plan === 'clinic'
  const isPro = form.plan === 'professional'
  const isBasic = form.plan === 'basic'
  const isTrial = form.plan === 'trial'
  const currentPlanConfig = activePlans.find(p => p.plan_key === form.plan)
  const planPrice = currentPlanConfig?.price ?? (isClinic ? 100 : isPro ? 30 : isBasic ? 10 : 0)
  const needsPayment = planPrice > 0

  // Steps: 1=Form, 2=Payment (pro/clinic only), 3=Success
  const totalSteps = needsPayment ? 3 : 2
  const progress = Math.round((step / totalSteps) * 100)

  // Fetch BCV rate when on payment step
  useEffect(() => {
    if (step === 2 && needsPayment) {
      setLoadingBCV(true)
      getBCVRate().then(r => { setBcvRate(r); setLoadingBCV(false) })
    }
  }, [step, needsPayment])

  function change(field: keyof FormData, value: string) {
    setForm(p => ({ ...p, [field]: value }))
    if (errors[field]) setErrors(p => ({ ...p, [field]: undefined }))
  }

  function validateForm(): boolean {
    const e: FormErrors = {}
    if (!form.full_name.trim()) e.full_name = 'El nombre es obligatorio'
    if (!form.cedula.trim()) e.cedula = 'La cédula es obligatoria'
    else if (!/^[VEve]-?\d{6,8}$/.test(form.cedula.trim())) e.cedula = 'Formato: V-12345678'
    if (!form.email.trim()) e.email = 'El email es obligatorio'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Email inválido'
    if (!form.sex) e.sex = 'Selecciona el sexo'
    if (!form.password) e.password = 'La contraseña es obligatoria'
    else if (form.password.length < 8) e.password = 'Mínimo 8 caracteres'
    if (!form.confirmPassword) e.confirmPassword = 'Confirma la contraseña'
    else if (form.password !== form.confirmPassword) e.confirmPassword = 'Las contraseñas no coinciden'
    if (isClinic && !form.clinic_name.trim()) e.clinic_name = 'El nombre de la clínica es obligatorio'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function handleSubmitForm(e: React.FormEvent) {
    e.preventDefault()
    if (!validateForm()) return
    setServerError(null)

    startTransition(async () => {
      let result
      if (isClinic) {
        result = await registerClinic({
          full_name: form.full_name,
          cedula: form.cedula,
          email: form.email,
          password: form.password,
          specialty: form.specialty,
          phone: form.phone,
          sex: form.sex,
          professional_title: form.professional_title,
          clinic_name: form.clinic_name,
          clinic_address: form.clinic_address,
          clinic_city: form.clinic_city,
          clinic_state: form.clinic_state,
          clinic_phone: form.clinic_phone,
          clinic_email: form.clinic_email || form.email,
          clinic_specialty: form.clinic_specialty,
        })
      } else {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { confirmPassword, ...input } = form
        result = await registerDoctor(input)
      }

      if (!result.success) { setServerError(result.error); return }
      setDoctorId(result.doctorId)

      if (needsPayment) {
        // Go to payment step
        setLoadingAccounts(true)
        const accounts = await getPaymentAccounts()
        setPaymentAccounts(accounts)
        setLoadingAccounts(false)
        setStep(2)
      } else {
        // Basic plan → success
        setStep(needsPayment ? 3 : 2)
      }
    })
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { setServerError('El archivo no puede superar los 10 MB'); return }
    setReceiptFile(file)
    const reader = new FileReader()
    reader.onload = (ev) => setReceiptPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  function handleSubmitReceipt(e: React.FormEvent) {
    e.preventDefault()
    if (!receiptFile || !doctorId) { setServerError('Debes adjuntar el comprobante de pago'); return }
    setServerError(null)
    startTransition(async () => {
      const reader = new FileReader()
      reader.onload = async (ev) => {
        const base64 = (ev.target?.result as string).split(',')[1]
        const result = await uploadPaymentReceipt(doctorId, base64, receiptFile.name, receiptFile.type, planPrice)
        if (!result.success) { setServerError(result.error); return }
        setStep(3)
      }
      reader.readAsDataURL(receiptFile)
    })
  }

  const bsAmount = bcvRate ? (planPrice * bcvRate.rate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : null
  const successStep = needsPayment ? 3 : 2

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');.g-bg{background:linear-gradient(135deg,#00C4CC 0%,#0891b2 100%)}.g-text{background:linear-gradient(135deg,#00C4CC 0%,#0891b2 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}.sex-btn{transition:all .15s}.sex-btn.active{border-color:#00C4CC;background:rgba(0,196,204,0.06);color:#0891b2}.g-clinic{background:linear-gradient(135deg,#8b5cf6 0%,#6d28d9 100%)}.plan-card{transition:all .15s;cursor:pointer}.plan-card.selected{border-color:#00C4CC;background:rgba(0,196,204,0.04);box-shadow:0 0 0 3px rgba(0,196,204,0.15)}.plan-card.selected-clinic{border-color:#8b5cf6;background:rgba(139,92,246,0.04);box-shadow:0 0 0 3px rgba(139,92,246,0.15)}`}</style>

      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center g-bg">
            <Activity className="w-4 h-4 text-white" />
          </div>
          <div className="leading-none">
            <span className="font-bold text-slate-900 tracking-tight">Delta</span>
            <span className="text-[10px] text-slate-400 block font-semibold tracking-wider uppercase">Medical CRM</span>
          </div>
        </Link>
        <Link href="/login" className="text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors">
          ¿Ya tienes cuenta? <span className="font-bold" style={{ color: '#00C4CC' }}>Inicia sesión</span>
        </Link>
      </header>

      {/* Progress bar */}
      <div className="bg-white border-b border-slate-100 px-6 py-3">
        <div className="max-w-lg mx-auto space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-slate-400">
            <span>Paso {step} de {totalSteps}</span>
            <span>{progress}% completado</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-500 ${isClinic ? 'g-clinic' : 'g-bg'}`} style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>

      <main className="flex-1 flex items-start justify-center px-4 py-8">
        <div className="w-full max-w-lg">

          {/* ── STEP 1: Formulario único ── */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="text-center space-y-1">
                <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Crea tu cuenta</h1>
                <p className="text-sm text-slate-500 font-medium">Elige tu plan y completa tus datos para comenzar</p>
              </div>

              <form onSubmit={handleSubmitForm} className="space-y-5">
                {serverError && (
                  <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-3">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-600">{serverError}</p>
                  </div>
                )}

                {/* ── Plan Selector (dynamic from DB) ── */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Plan <span className="text-red-400 ml-0.5">*</span>
                  </label>
                  {!plansLoaded ? (
                    <div className="flex items-center gap-2 py-4 text-sm text-slate-400">
                      <Loader2 className="w-4 h-4 animate-spin" /> Cargando planes...
                    </div>
                  ) : (
                    <>
                      <div className={`grid gap-2 ${activePlans.length <= 2 ? 'grid-cols-2' : activePlans.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                        {activePlans.map(plan => {
                          const isSelected = form.plan === plan.plan_key
                          const isClinicPlan = plan.plan_key === 'clinic'
                          const isProfessionalPlan = plan.plan_key === 'professional'
                          const Icon = isClinicPlan ? Building2 : isProfessionalPlan ? Zap : Stethoscope
                          return (
                            <button
                              key={plan.plan_key}
                              type="button"
                              onClick={() => change('plan', plan.plan_key)}
                              className={`plan-card rounded-xl border-2 p-3 text-left relative ${isSelected ? (isClinicPlan ? 'selected-clinic' : 'selected') : 'border-slate-200 hover:border-slate-300'}`}
                            >
                              {isProfessionalPlan && (
                                <span className="absolute -top-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ background: '#00C4CC' }}>Popular</span>
                              )}
                              <Icon className={`w-4 h-4 mb-1.5 ${isSelected ? (isClinicPlan ? 'text-violet-500' : 'text-teal-500') : 'text-slate-400'}`} />
                              <p className="text-xs font-bold text-slate-900">{plan.name}</p>
                              <p className="text-xs text-slate-500 mt-0.5">
                                {plan.price > 0 ? `$${plan.price} USD/mes` : `Gratis · ${plan.trial_days} días`}
                              </p>
                            </button>
                          )
                        })}
                      </div>

                      {/* Plan description */}
                      {(() => {
                        const currentPlan = activePlans.find(p => p.plan_key === form.plan)
                        return currentPlan?.description ? (
                          <div className={`mt-2 px-3 py-2 rounded-lg text-xs ${isClinic ? 'bg-violet-50 text-violet-700 border border-violet-100' : 'bg-teal-50 text-teal-700 border border-teal-100'}`}>
                            {currentPlan.description}
                          </div>
                        ) : null
                      })()}
                    </>
                  )}
                </div>

                {/* ── Datos personales ── */}
                <div className="space-y-4">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Datos personales</p>

                  <Field label="Título profesional" required>
                    <select value={form.professional_title} onChange={e => change('professional_title', e.target.value)} className={inp(false)}>
                      {PROFESSIONAL_TITLES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </Field>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Nombre completo" required error={errors.full_name}>
                      <input type="text" value={form.full_name} onChange={e => change('full_name', e.target.value)} placeholder="Carlos Ramírez" className={inp(!!errors.full_name)} />
                    </Field>
                    <Field label="Cédula" required error={errors.cedula}>
                      <input type="text" value={form.cedula} onChange={e => change('cedula', e.target.value)} placeholder="V-12345678" className={inp(!!errors.cedula)} />
                    </Field>
                  </div>

                  <Field label="Email" required error={errors.email}>
                    <input type="email" value={form.email} onChange={e => change('email', e.target.value)} placeholder="doctor@ejemplo.com" className={inp(!!errors.email)} />
                  </Field>

                  <Field label="Sexo" required error={errors.sex}>
                    <div className="grid grid-cols-2 gap-3">
                      {[{ v: 'female', label: '♀ Femenino' }, { v: 'male', label: '♂ Masculino' }].map(opt => (
                        <button
                          key={opt.v} type="button"
                          onClick={() => change('sex', opt.v)}
                          className={`sex-btn px-4 py-2.5 rounded-xl border-2 text-sm font-semibold text-left transition-all ${form.sex === opt.v ? 'active border-cyan-400' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </Field>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Especialidad">
                      <select value={form.specialty} onChange={e => change('specialty', e.target.value)} className={inp(false)}>
                        <option value="">Seleccionar...</option>
                        {ESPECIALIDADES.map(e => <option key={e} value={e}>{e}</option>)}
                      </select>
                    </Field>
                    <Field label="Teléfono">
                      <input type="tel" value={form.phone} onChange={e => change('phone', e.target.value)} placeholder="+58 412 000 0000" className={inp(false)} />
                    </Field>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Contraseña" required error={errors.password}>
                      <div className="relative">
                        <input type={showPass ? 'text' : 'password'} value={form.password} onChange={e => change('password', e.target.value)} placeholder="Mínimo 8 caracteres" className={inp(!!errors.password) + ' pr-10'} />
                        <button type="button" onClick={() => setShowPass(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" tabIndex={-1}>
                          {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </Field>
                    <Field label="Confirmar" required error={errors.confirmPassword}>
                      <div className="relative">
                        <input type={showConf ? 'text' : 'password'} value={form.confirmPassword} onChange={e => change('confirmPassword', e.target.value)} placeholder="Repetir contraseña" className={inp(!!errors.confirmPassword) + ' pr-10'} />
                        <button type="button" onClick={() => setShowConf(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" tabIndex={-1}>
                          {showConf ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </Field>
                  </div>
                </div>

                {/* ── Datos de clínica (solo si plan = clinic) ── */}
                {isClinic && (
                  <div className="space-y-4 border-t border-slate-200 pt-5">
                    <p className="text-xs font-bold text-violet-500 uppercase tracking-widest">Datos del Centro de Salud</p>

                    <Field label="Nombre de la clínica" required error={errors.clinic_name}>
                      <input type="text" value={form.clinic_name} onChange={e => change('clinic_name', e.target.value)} placeholder="Centro Médico Metropolitano" className={inp(!!errors.clinic_name)} />
                    </Field>

                    <Field label="Especialidad principal">
                      <input type="text" value={form.clinic_specialty} onChange={e => change('clinic_specialty', e.target.value)} placeholder="Ej: Odontología, Multiespecialidad" className={inp(false)} />
                    </Field>

                    <Field label="Dirección">
                      <input type="text" value={form.clinic_address} onChange={e => change('clinic_address', e.target.value)} placeholder="Torre Médica, Piso 3, Local 301" className={inp(false)} />
                    </Field>

                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Ciudad">
                        <input type="text" value={form.clinic_city} onChange={e => change('clinic_city', e.target.value)} placeholder="Caracas" className={inp(false)} />
                      </Field>
                      <Field label="Estado">
                        <input type="text" value={form.clinic_state} onChange={e => change('clinic_state', e.target.value)} placeholder="Distrito Capital" className={inp(false)} />
                      </Field>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Teléfono de la clínica">
                        <input type="tel" value={form.clinic_phone} onChange={e => change('clinic_phone', e.target.value)} placeholder="+58 212 1234567" className={inp(false)} />
                      </Field>
                      <Field label="Email de la clínica">
                        <input type="email" value={form.clinic_email} onChange={e => change('clinic_email', e.target.value)} placeholder="contacto@clinica.com" className={inp(false)} />
                      </Field>
                    </div>
                  </div>
                )}

                <button type="submit" disabled={isPending} className={`w-full flex items-center justify-center gap-2 font-bold py-3.5 rounded-2xl text-sm text-white transition-all hover:opacity-90 active:scale-[.99] disabled:opacity-60 shadow-lg ${isClinic ? 'g-clinic shadow-violet-500/25' : 'g-bg shadow-cyan-500/25'}`}>
                  {isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Creando cuenta...</> :
                    needsPayment ? <>Continuar al pago <ArrowRight className="w-4 h-4" /></> :
                    <>Crear mi cuenta <ArrowRight className="w-4 h-4" /></>}
                </button>

                <p className="text-center text-xs text-slate-400">
                  Al registrarte aceptas nuestros <a href="#" className="underline hover:text-slate-600">Términos de Servicio</a> y <a href="#" className="underline hover:text-slate-600">Política de Privacidad</a>
                </p>
              </form>
            </div>
          )}

          {/* ── STEP 2: Pago (solo pro/clinic) ── */}
          {step === 2 && needsPayment && (
            <div className="space-y-6">
              <div className="space-y-1">
                <button onClick={() => setStep(1)} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-700 mb-4 transition-colors">
                  <ChevronLeft className="w-4 h-4" /> Volver
                </button>
                <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Adjunta el comprobante</h1>
                <p className="text-sm text-slate-500 font-medium">Realiza el pago de ${planPrice} USD y sube el comprobante para activar tu {isClinic ? 'Centro de Salud' : 'Plan Professional'}.</p>
              </div>

              {/* BCV Rate Box */}
              <div className={`${isClinic ? 'g-clinic' : 'g-bg'} rounded-2xl p-5 text-white relative overflow-hidden`}>
                <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-white/10 blur-xl pointer-events-none" />
                <div className="flex items-start justify-between relative z-10">
                  <div>
                    <p className="text-white/70 text-xs font-semibold uppercase tracking-widest mb-2 flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5" /> Tasa BCV Oficial
                    </p>
                    {loadingBCV ? (
                      <div className="flex items-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin text-white/70" />
                        <span className="text-sm text-white/70">Consultando tasa del día...</span>
                      </div>
                    ) : bcvRate ? (
                      <>
                        <div className="flex items-end gap-3">
                          <div>
                            <p className="text-2xl font-extrabold text-white">Bs.S {bcvRate.rate.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</p>
                            <p className="text-white/60 text-xs">por 1 USD</p>
                          </div>
                          <div className="pb-1 text-white/50 text-lg font-light">→</div>
                          <div>
                            <p className="text-2xl font-extrabold text-cyan-200">Bs.S {bsAmount}</p>
                            <p className="text-white/60 text-xs">equivalente a ${planPrice} USD</p>
                          </div>
                        </div>
                        <p className="text-white/50 text-xs mt-2">Actualizado: {bcvRate.updated}</p>
                      </>
                    ) : (
                      <p className="text-white/70 text-sm">${planPrice} USD equivalente en Bs. al cambio del día BCV</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Payment accounts */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Datos de pago</p>
                {loadingAccounts ? (
                  <div className="flex items-center gap-2 py-3">
                    <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                    <span className="text-sm text-slate-400">Cargando cuentas...</span>
                  </div>
                ) : paymentAccounts.length === 0 ? (
                  <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-sm text-amber-700">
                    Las cuentas de pago están siendo configuradas. Contáctanos por WhatsApp para recibir los datos.
                  </div>
                ) : (
                  paymentAccounts.map(acc => (
                    <div key={acc.id} className="border border-slate-100 rounded-xl p-4 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{acc.type?.replace('_', ' ')}</span>
                        {acc.bank_name && <span className="text-xs text-slate-400">— {acc.bank_name}</span>}
                      </div>
                      {acc.account_holder && <p className="text-sm font-semibold text-slate-800">{acc.account_holder}</p>}
                      {acc.phone && <p className="text-sm text-slate-600 font-mono">{acc.phone}</p>}
                      {acc.rif && <p className="text-xs text-slate-400">RIF/CI: {acc.rif}</p>}
                      {acc.notes && <p className="text-xs text-slate-400">{acc.notes}</p>}
                    </div>
                  ))
                )}
                <div className="pt-1 bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <p className="text-xs font-semibold text-slate-600">
                    Monto a pagar: <strong className="text-slate-800">${planPrice} USD</strong>
                    {bsAmount && <span className="text-teal-600"> = Bs.S {bsAmount} (tasa BCV)</span>}
                  </p>
                </div>
              </div>

              <form onSubmit={handleSubmitReceipt} className="space-y-4">
                {serverError && (
                  <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-3">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-600">{serverError}</p>
                  </div>
                )}

                <div>
                  <p className="text-sm font-medium text-slate-700 mb-2">Comprobante de pago <span className="text-red-400">*</span></p>
                  {receiptPreview ? (
                    <div className="relative rounded-2xl overflow-hidden border border-slate-200">
                      {receiptFile?.type.startsWith('image/') ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={receiptPreview} alt="Comprobante" className="w-full max-h-56 object-cover" />
                      ) : (
                        <div className="flex items-center gap-3 bg-slate-50 px-4 py-4">
                          <Image className="w-6 h-6 text-slate-400" />
                          <span className="text-sm font-medium text-slate-700 truncate">{receiptFile?.name}</span>
                        </div>
                      )}
                      <button type="button" onClick={() => { setReceiptFile(null); setReceiptPreview(null) }} className="absolute top-2 right-2 w-7 h-7 bg-white rounded-full shadow flex items-center justify-center hover:bg-red-50 transition-colors">
                        <X className="w-3.5 h-3.5 text-slate-500" />
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="w-full border-2 border-dashed border-slate-200 rounded-2xl py-10 flex flex-col items-center gap-3 hover:border-cyan-300 hover:bg-cyan-50/30 transition-all">
                      <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
                        <Upload className="w-5 h-5 text-slate-400" />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-semibold text-slate-700">Subir captura del pago</p>
                        <p className="text-xs text-slate-400 mt-1">JPG, PNG o PDF · Máx. 10 MB</p>
                      </div>
                    </button>
                  )}
                  <input ref={fileInputRef} type="file" accept="image/*,.pdf" onChange={handleFileChange} className="hidden" />
                </div>

                <button type="submit" disabled={isPending || !receiptFile} className={`w-full flex items-center justify-center gap-2 font-bold py-3.5 rounded-2xl text-sm text-white transition-all hover:opacity-90 active:scale-[.99] disabled:opacity-60 shadow-lg ${isClinic ? 'g-clinic shadow-violet-500/25' : 'g-bg shadow-cyan-500/25'}`}>
                  {isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Enviando...</> : <>Enviar comprobante <ArrowRight className="w-4 h-4" /></>}
                </button>
                <p className="text-xs text-slate-400 text-center leading-relaxed">
                  Tu cuenta será activada por el administrador en un plazo de 24 horas hábiles.
                </p>
              </form>
            </div>
          )}

          {/* ── SUCCESS STEP ── */}
          {step === successStep && (
            <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center space-y-6 shadow-sm">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto bg-teal-50">
                <Mail className="w-8 h-8 text-teal-500" />
              </div>
              <div className="space-y-2">
                <h1 className="text-2xl font-extrabold text-slate-900">¡Cuenta creada!</h1>
                <p className="text-slate-500 font-medium">
                  Hemos enviado un enlace de confirmación a <strong className="text-slate-700">{form.email}</strong>
                </p>
              </div>

              <div className="bg-teal-50 border border-teal-100 rounded-2xl p-4 space-y-2 text-left">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-teal-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-teal-800">Revisa tu bandeja de entrada</p>
                    <p className="text-xs text-teal-600 mt-1">Haz clic en el enlace del email para verificar tu cuenta. Si no lo ves, revisa la carpeta de spam.</p>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 rounded-2xl p-4 text-left space-y-3">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Resumen</p>
                <div className="grid grid-cols-2 gap-y-2 text-sm">
                  <span className="text-slate-400">Email</span>
                  <span className="font-medium text-slate-700 text-right truncate">{form.email}</span>
                  <span className="text-slate-400">Plan</span>
                  <span className="text-right">
                    <span className="text-xs font-bold px-2 py-1 rounded-full" style={{
                      background: isClinic ? 'rgba(139,92,246,0.1)' : 'rgba(0,196,204,0.1)',
                      color: isClinic ? '#8b5cf6' : '#00C4CC'
                    }}>
                      {currentPlanConfig ? `${currentPlanConfig.name} · ${currentPlanConfig.price > 0 ? `$${currentPlanConfig.price}/mes` : `${currentPlanConfig.trial_days} días gratis`}` : form.plan}
                    </span>
                  </span>
                  {isClinic && (
                    <>
                      <span className="text-slate-400">Clínica</span>
                      <span className="font-medium text-slate-700 text-right truncate">{form.clinic_name}</span>
                    </>
                  )}
                  <span className="text-slate-400">Estado</span>
                  <span className="text-right">
                    {needsPayment ?
                      <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-full">Pago pendiente</span> :
                      <span className="text-xs font-bold text-teal-600 bg-teal-50 px-2 py-1 rounded-full">Trial activo</span>
                    }
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <Link href="/login" className={`w-full flex items-center justify-center gap-2 font-bold py-3.5 rounded-2xl text-sm text-white shadow-lg hover:opacity-90 transition-all ${isClinic ? 'g-clinic shadow-violet-500/25' : 'g-bg shadow-cyan-500/25'}`}>
                  Ir a iniciar sesión <ArrowRight className="w-4 h-4" />
                </Link>
                {needsPayment && (
                  <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-sm text-amber-700 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <p>Tu comprobante será verificado en máximo 24 horas. Mientras tanto, recibirás acceso con funciones limitadas.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  )
}

function inp(hasError: boolean): string {
  return `w-full px-3 py-2 text-sm rounded-xl border outline-none transition-colors focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 ${hasError ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white'}`
}
