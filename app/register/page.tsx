'use client'

export const dynamic = 'force-dynamic'

import { useState, useTransition, Suspense } from 'react'
import Link from 'next/link'
import {
  Activity, ArrowRight, Eye, EyeOff, CheckCircle2,
  Loader2, AlertCircle, Stethoscope,
} from 'lucide-react'
import { registerDoctor } from './actions'

const ESPECIALIDADES = [
  'Cardiología','Dermatología','Endocrinología','Gastroenterología',
  'Ginecología y Obstetricia','Medicina General','Medicina Interna',
  'Nefrología','Neurología','Oftalmología','Ortopedia y Traumatología',
  'Otorrinolaringología','Pediatría','Psicología','Psiquiatría',
  'Reumatología','Fisioterapia','Urología','Otra',
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

type FormData = {
  full_name: string; cedula: string; email: string
  password: string; confirmPassword: string
  specialty: string; phone: string
  sex: string; professional_title: string
}
type FormErrors = Partial<Record<keyof FormData, string>>

const defaultForm: FormData = {
  full_name: '', cedula: '', email: '',
  password: '', confirmPassword: '',
  specialty: '', phone: '', sex: '', professional_title: 'Dr.',
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <RegisterInner />
    </Suspense>
  )
}

function RegisterInner() {
  const [step, setStep] = useState<'form' | 'success'>('form')
  const [form, setForm] = useState<FormData>(defaultForm)
  const [errors, setErrors] = useState<FormErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [showPass, setShowPass] = useState(false)
  const [showConf, setShowConf] = useState(false)

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
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validateForm()) return
    setServerError(null)

    startTransition(async () => {
      const result = await registerDoctor({
        full_name: form.full_name,
        cedula: form.cedula,
        email: form.email,
        password: form.password,
        specialty: form.specialty,
        phone: form.phone,
        sex: form.sex,
        professional_title: form.professional_title,
        plan: 'trial', // Beta = free trial with full access
      })

      if (!result.success) { setServerError(result.error); return }
      setStep('success')
    })
  }

  const inp = (err: boolean) =>
    `w-full px-3.5 py-2.5 rounded-xl border-2 text-sm font-medium outline-none transition-all ${
      err ? 'border-red-300 bg-red-50/30 focus:border-red-400' : 'border-slate-200 focus:border-cyan-400 bg-white'
    }`

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

      <main className="flex-1 flex items-start justify-center px-4 py-8">
        <div className="w-full max-w-lg">

          {/* ── FORM ── */}
          {step === 'form' && (
            <div className="space-y-6">
              <div className="text-center space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest bg-teal-50 border border-teal-200" style={{ color: '#00C4CC' }}>
                  <Stethoscope className="w-3.5 h-3.5" /> Beta Abierta — Gratis
                </div>
                <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Crea tu cuenta gratuita</h1>
                <p className="text-sm text-slate-500 font-medium">Acceso completo a todas las funcionalidades durante la beta</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                {serverError && (
                  <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-3">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-600">{serverError}</p>
                  </div>
                )}

                {/* Datos personales */}
                <div className="space-y-4">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Datos personales</p>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Título profesional <span className="text-red-400">*</span></label>
                    <select value={form.professional_title} onChange={e => change('professional_title', e.target.value)} className={inp(false)}>
                      {PROFESSIONAL_TITLES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1.5">Nombre completo <span className="text-red-400">*</span></label>
                      <input type="text" value={form.full_name} onChange={e => change('full_name', e.target.value)} placeholder="Carlos Ramírez" className={inp(!!errors.full_name)} />
                      {errors.full_name && <p className="text-xs text-red-500 mt-1">{errors.full_name}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1.5">Cédula <span className="text-red-400">*</span></label>
                      <input type="text" value={form.cedula} onChange={e => change('cedula', e.target.value)} placeholder="V-12345678" className={inp(!!errors.cedula)} />
                      {errors.cedula && <p className="text-xs text-red-500 mt-1">{errors.cedula}</p>}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Email <span className="text-red-400">*</span></label>
                    <input type="email" value={form.email} onChange={e => change('email', e.target.value)} placeholder="doctor@ejemplo.com" className={inp(!!errors.email)} />
                    {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Sexo <span className="text-red-400">*</span></label>
                    <div className="grid grid-cols-2 gap-3">
                      {[{ v: 'female', label: 'Femenino' }, { v: 'male', label: 'Masculino' }].map(opt => (
                        <button
                          key={opt.v} type="button"
                          onClick={() => change('sex', opt.v)}
                          className={`sex-btn px-4 py-2.5 rounded-xl border-2 text-sm font-semibold text-center transition-all ${form.sex === opt.v ? 'active border-cyan-400' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    {errors.sex && <p className="text-xs text-red-500 mt-1">{errors.sex}</p>}
                  </div>
                </div>

                {/* Datos profesionales */}
                <div className="space-y-4">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Datos profesionales</p>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1.5">Especialidad</label>
                      <select value={form.specialty} onChange={e => change('specialty', e.target.value)} className={inp(false)}>
                        <option value="">Seleccionar...</option>
                        {ESPECIALIDADES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1.5">Teléfono</label>
                      <input type="tel" value={form.phone} onChange={e => change('phone', e.target.value)} placeholder="+58 412 1234567" className={inp(false)} />
                    </div>
                  </div>
                </div>

                {/* Contraseña */}
                <div className="space-y-4">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Seguridad</p>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Contraseña <span className="text-red-400">*</span></label>
                    <div className="relative">
                      <input type={showPass ? 'text' : 'password'} value={form.password} onChange={e => change('password', e.target.value)} placeholder="Mínimo 8 caracteres" className={inp(!!errors.password)} />
                      <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                        {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Confirmar contraseña <span className="text-red-400">*</span></label>
                    <div className="relative">
                      <input type={showConf ? 'text' : 'password'} value={form.confirmPassword} onChange={e => change('confirmPassword', e.target.value)} placeholder="Repite tu contraseña" className={inp(!!errors.confirmPassword)} />
                      <button type="button" onClick={() => setShowConf(!showConf)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                        {showConf ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {errors.confirmPassword && <p className="text-xs text-red-500 mt-1">{errors.confirmPassword}</p>}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isPending}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-white font-bold text-sm transition-all hover:opacity-90 active:scale-[0.98] shadow-lg shadow-cyan-500/25 disabled:opacity-50 g-bg"
                >
                  {isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Creando cuenta...</> : <>Crear mi cuenta gratuita <ArrowRight className="w-4 h-4" /></>}
                </button>

                <p className="text-center text-xs text-slate-400">
                  Al registrarte, aceptas nuestros términos de uso y política de privacidad.
                </p>
              </form>
            </div>
          )}

          {/* ── SUCCESS ── */}
          {step === 'success' && (
            <div className="text-center space-y-6 py-12">
              <div className="w-20 h-20 rounded-full mx-auto flex items-center justify-center" style={{ background: 'rgba(0,196,204,0.1)' }}>
                <CheckCircle2 className="w-10 h-10" style={{ color: '#00C4CC' }} />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-extrabold text-slate-900">¡Cuenta creada!</h2>
                <p className="text-slate-500 font-medium max-w-sm mx-auto">
                  Revisa tu email <span className="font-semibold text-slate-700">{form.email}</span> para verificar tu cuenta y activar tu acceso.
                </p>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3 text-left max-w-sm mx-auto">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Tu plan</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center g-bg">
                    <Stethoscope className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">Beta Gratis</p>
                    <p className="text-xs text-slate-500">Acceso completo a todas las funcionalidades</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-sm text-slate-500">¿Ya verificaste tu email?</p>
                <Link href="/login" className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl text-white font-bold text-sm transition-all hover:opacity-90 shadow-lg shadow-cyan-500/25 g-bg">
                  Iniciar sesión <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
