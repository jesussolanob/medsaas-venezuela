'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  Activity, ArrowRight, Eye, EyeOff, Upload, CheckCircle2,
  Loader2, X, Stethoscope, Zap, ChevronLeft, Image, AlertCircle,
  TrendingUp, RefreshCw,
} from 'lucide-react'
import { registerDoctor, uploadPaymentReceipt, getPaymentAccounts, getBCVRate, type PaymentAccount, type BCVRateResult } from './actions'

const ESPECIALIDADES = [
  'Cardiología','Dermatología','Endocrinología','Gastroenterología',
  'Ginecología y Obstetricia','Medicina General','Medicina Interna',
  'Nefrología','Neurología','Oftalmología','Ortopedia y Traumatología',
  'Otorrinolaringología','Pediatría','Psicología','Psiquiatría',
  'Reumatología','Urología','Otra',
]

type FormData = {
  full_name: string; cedula: string; email: string
  password: string; confirmPassword: string
  specialty: string; phone: string; plan: 'free' | 'pro'
  sex: string
}
type FormErrors = Partial<Record<keyof FormData, string>>

const defaultForm: FormData = {
  full_name: '', cedula: '', email: '',
  password: '', confirmPassword: '',
  specialty: '', phone: '', plan: 'free', sex: '',
}

export default function RegisterPage() {
  const searchParams = useSearchParams()
  const planParam = searchParams.get('plan') as 'free' | 'pro' | null

  const [step, setStep] = useState(planParam ? 1 : 0)
  const [form, setForm] = useState<FormData>({ ...defaultForm, plan: planParam ?? 'free' })
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

  // Fetch BCV rate when on payment step
  useEffect(() => {
    if (step === 2) {
      setLoadingBCV(true)
      getBCVRate().then(r => { setBcvRate(r); setLoadingBCV(false) })
    }
  }, [step])

  function change(field: keyof FormData, value: string) {
    setForm(p => ({ ...p, [field]: value }))
    if (errors[field]) setErrors(p => ({ ...p, [field]: undefined }))
  }

  function selectPlan(plan: 'free' | 'pro') {
    setForm(p => ({ ...p, plan })); setStep(1)
  }

  function validateStep1(): boolean {
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
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function handleSubmitData(e: React.FormEvent) {
    e.preventDefault()
    if (!validateStep1()) return
    setServerError(null)
    startTransition(async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { confirmPassword, ...input } = form
      const result = await registerDoctor(input)
      if (!result.success) { setServerError(result.error); return }
      setDoctorId(result.doctorId)
      if (form.plan === 'free') {
        setStep(3)
      } else {
        setLoadingAccounts(true)
        const accounts = await getPaymentAccounts()
        setPaymentAccounts(accounts)
        setLoadingAccounts(false)
        setStep(2)
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
        const result = await uploadPaymentReceipt(doctorId, base64, receiptFile.name, receiptFile.type)
        if (!result.success) { setServerError(result.error); return }
        setStep(3)
      }
      reader.readAsDataURL(receiptFile)
    })
  }

  const progress = step === 0 ? 0 : step === 1 ? 40 : step === 2 ? 75 : 100
  const bsAmount = bcvRate ? (20 * bcvRate.rate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : null

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');.g-bg{background:linear-gradient(135deg,#00C4CC 0%,#0891b2 100%)}.g-text{background:linear-gradient(135deg,#00C4CC 0%,#0891b2 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}.sex-btn{transition:all .15s}.sex-btn.active{border-color:#00C4CC;background:rgba(0,196,204,0.06);color:#0891b2}`}</style>

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

      {step > 0 && (
        <div className="bg-white border-b border-slate-100 px-6 py-3">
          <div className="max-w-lg mx-auto space-y-2">
            <div className="flex items-center justify-between text-xs font-medium text-slate-400">
              <span>Paso {step} de {form.plan === 'pro' ? 3 : 2}</span>
              <span>{progress}% completado</span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500 g-bg" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 flex items-start justify-center px-4 py-12">
        <div className="w-full max-w-lg">

          {/* ── STEP 0: Plan ── */}
          {step === 0 && (
            <div className="space-y-8">
              <div className="text-center space-y-2">
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Elige tu plan</h1>
                <p className="text-slate-500 font-medium">Comienza gratis o activa el plan Pro desde el primer día.</p>
              </div>
              <div className="grid gap-4">
                <button onClick={() => selectPlan('free')} className="group w-full bg-white rounded-2xl border-2 border-slate-200 hover:border-cyan-300 p-6 text-left transition-all hover:shadow-lg hover:shadow-cyan-500/10 active:scale-[.99]">
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center group-hover:bg-cyan-50 transition-colors">
                      <Stethoscope className="w-5 h-5 text-slate-500 group-hover:text-cyan-500 transition-colors" />
                    </div>
                    <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full">Trial 30 días</span>
                  </div>
                  <p className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-1">Free</p>
                  <div className="flex items-end gap-1.5 mb-2">
                    <span className="text-4xl font-extrabold text-slate-900">$0</span>
                    <span className="text-slate-400 font-medium mb-1">/ mes</span>
                  </div>
                  <p className="text-sm text-slate-500">30 días completos sin tarjeta de crédito. Funcionalidades básicas para comenzar.</p>
                  <div className="mt-4 flex items-center gap-2 text-sm font-semibold" style={{ color: '#00C4CC' }}>
                    Comenzar gratis <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                </button>

                <button onClick={() => selectPlan('pro')} className="group w-full rounded-2xl border-2 border-transparent p-6 text-left transition-all hover:shadow-xl hover:shadow-cyan-500/20 active:scale-[.99] relative overflow-hidden" style={{ background: 'linear-gradient(145deg,#0f172a,#1e293b)' }}>
                  <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full opacity-10" style={{ background: '#00C4CC' }} />
                  <div className="absolute top-4 right-4">
                    <span className="text-xs font-bold px-3 py-1.5 rounded-full text-white" style={{ background: '#00C4CC' }}>Recomendado</span>
                  </div>
                  <div className="flex items-start mb-4">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(0,196,204,0.2)' }}>
                      <Zap className="w-5 h-5" style={{ color: '#00C4CC' }} />
                    </div>
                  </div>
                  <p className="text-sm font-bold uppercase tracking-widest mb-1" style={{ color: '#00C4CC' }}>Pro</p>
                  <div className="flex items-end gap-1.5 mb-2">
                    <span className="text-4xl font-extrabold text-white">$20</span>
                    <span className="text-slate-400 font-medium mb-1">USD / mes</span>
                  </div>
                  <p className="text-sm text-slate-400">Todas las funcionalidades: CRM completo, EHR con IA, finanzas y marketing masivo.</p>
                  <div className="mt-4 flex items-center gap-2 text-sm font-bold text-white">
                    Activar Plan Pro <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                </button>
              </div>
              <p className="text-center text-xs text-slate-400">
                Al registrarte aceptas nuestros <a href="#" className="underline hover:text-slate-600">Términos de Servicio</a> y <a href="#" className="underline hover:text-slate-600">Política de Privacidad</a>
              </p>
            </div>
          )}

          {/* ── STEP 1: Datos ── */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="space-y-1">
                <button onClick={() => setStep(0)} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-700 mb-4 transition-colors">
                  <ChevronLeft className="w-4 h-4" /> Cambiar plan
                </button>
                <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Crea tu cuenta</h1>
                <p className="text-sm text-slate-500 font-medium">
                  Plan <span className="font-bold" style={{ color: '#00C4CC' }}>{form.plan === 'pro' ? 'Pro · $20 USD/mes' : 'Free · 30 días'}</span>
                </p>
              </div>

              <form onSubmit={handleSubmitData} className="space-y-4">
                {serverError && (
                  <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-3">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-600">{serverError}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Nombre completo" required error={errors.full_name}>
                    <input type="text" value={form.full_name} onChange={e => change('full_name', e.target.value)} placeholder="Dr. Carlos Ramírez" className={inp(!!errors.full_name)} />
                  </Field>
                  <Field label="Cédula" required error={errors.cedula}>
                    <input type="text" value={form.cedula} onChange={e => change('cedula', e.target.value)} placeholder="V-12345678" className={inp(!!errors.cedula)} />
                  </Field>
                </div>

                <Field label="Email" required error={errors.email}>
                  <input type="email" value={form.email} onChange={e => change('email', e.target.value)} placeholder="doctor@ejemplo.com" className={inp(!!errors.email)} />
                </Field>

                {/* Sexo */}
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

                <button type="submit" disabled={isPending} className="w-full flex items-center justify-center gap-2 font-bold py-3.5 rounded-2xl text-sm text-white transition-all hover:opacity-90 active:scale-[.99] disabled:opacity-60 g-bg shadow-lg shadow-cyan-500/25">
                  {isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Creando cuenta...</> : form.plan === 'pro' ? <>Continuar al pago <ArrowRight className="w-4 h-4" /></> : <>Crear mi cuenta <ArrowRight className="w-4 h-4" /></>}
                </button>
              </form>
            </div>
          )}

          {/* ── STEP 2: Pago Pro ── */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="space-y-1">
                <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Adjunta el comprobante</h1>
                <p className="text-sm text-slate-500 font-medium">Realiza el pago de $20 USD y sube el comprobante para activar tu Plan Pro.</p>
              </div>

              {/* BCV Rate Box */}
              <div className="g-bg rounded-2xl p-5 text-white relative overflow-hidden">
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
                            <p className="text-white/60 text-xs">equivalente a $20 USD</p>
                          </div>
                        </div>
                        <p className="text-white/50 text-xs mt-2">Actualizado: {bcvRate.updated}</p>
                      </>
                    ) : (
                      <p className="text-white/70 text-sm">$20 USD · equivalente en Bs. al cambio del día BCV</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Cuentas de cobro */}
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
                    💵 Monto a pagar: <strong className="text-slate-800">$20 USD</strong>
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

                <button type="submit" disabled={isPending || !receiptFile} className="w-full flex items-center justify-center gap-2 font-bold py-3.5 rounded-2xl text-sm text-white transition-all hover:opacity-90 active:scale-[.99] disabled:opacity-60 g-bg shadow-lg shadow-cyan-500/25">
                  {isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Enviando...</> : <>Enviar comprobante <ArrowRight className="w-4 h-4" /></>}
                </button>
                <p className="text-xs text-slate-400 text-center leading-relaxed">
                  Tu cuenta será activada por el administrador en un plazo de 24 horas hábiles.
                </p>
              </form>
            </div>
          )}

          {/* ── STEP 3: Éxito ── */}
          {step === 3 && (
            <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center space-y-6 shadow-sm">
              <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              </div>
              <div className="space-y-2">
                <h1 className="text-2xl font-extrabold text-slate-900">
                  {form.plan === 'free' ? '¡Bienvenido a Delta!' : '¡Solicitud enviada!'}
                </h1>
                <p className="text-slate-500 font-medium">
                  {form.plan === 'free'
                    ? 'Tu cuenta está lista. Tienes 30 días de acceso completo.'
                    : 'Hemos recibido tu comprobante. El equipo lo verificará y activará tu Plan Pro en máximo 24 horas.'}
                </p>
              </div>
              <div className="bg-slate-50 rounded-2xl p-4 text-left space-y-3">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Resumen</p>
                <div className="grid grid-cols-2 gap-y-2 text-sm">
                  <span className="text-slate-400">Email</span>
                  <span className="font-medium text-slate-700 text-right truncate">{form.email}</span>
                  <span className="text-slate-400">Plan</span>
                  <span className="text-right"><span className="text-xs font-bold px-2 py-1 rounded-full" style={{ background: 'rgba(0,196,204,0.1)', color: '#00C4CC' }}>{form.plan === 'pro' ? 'Pro · $20 USD/mes' : 'Free · 30 días'}</span></span>
                  <span className="text-slate-400">Estado</span>
                  <span className="text-right">
                    {form.plan === 'free' ? <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">Activo</span> : <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-full">Pendiente</span>}
                  </span>
                </div>
              </div>
              <div className="space-y-3">
                {form.plan === 'free' && (
                  <Link href="/login" className="w-full flex items-center justify-center gap-2 font-bold py-3.5 rounded-2xl text-sm text-white g-bg shadow-lg shadow-cyan-500/25 hover:opacity-90 transition-all">
                    Ir a mi panel <ArrowRight className="w-4 h-4" />
                  </Link>
                )}
                {form.plan === 'pro' && (
                  <>
                    <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-sm text-amber-700 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <p>Recibirás un email de confirmación cuando tu cuenta Pro esté activa. Mientras tanto, puedes explorar el panel con acceso limitado.</p>
                    </div>
                    <Link href="/login" className="w-full flex items-center justify-center gap-2 font-semibold py-3 rounded-2xl text-sm border border-slate-200 text-slate-700 hover:bg-slate-50 transition-all">
                      Ir al panel →
                    </Link>
                  </>
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
