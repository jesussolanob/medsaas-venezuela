'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Activity, Phone, ArrowRight, Loader2, CheckCircle2, Stethoscope, User, Clock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

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

type Role = 'doctor' | 'patient'

export default function OnboardingPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [userId, setUserId] = useState<string | null>(null)
  const [userName, setUserName] = useState('')
  const [userEmail, setUserEmail] = useState('')

  // Step 1: role selection, Step 2: details, Step 3: success/pending
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [role, setRole] = useState<Role>('doctor')

  // Form fields
  const [phone, setPhone] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [professionalTitle, setProfessionalTitle] = useState('Dr.')
  const [sex, setSex] = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        router.push('/login')
        return
      }
      setUserId(user.id)
      setUserName(user.user_metadata?.full_name || user.user_metadata?.name || '')
      setUserEmail(user.email || '')

      // Check if profile already exists and is complete
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, phone')
        .eq('id', user.id)
        .maybeSingle()

      if (profile?.phone) {
        // Already onboarded — redirect
        if (profile.role === 'super_admin' || profile.role === 'admin') {
          router.push('/admin')
        } else if (profile.role === 'patient') {
          router.push('/patient/dashboard')
        } else {
          router.push('/doctor')
        }
        return
      }

      // If profile exists with a role, pre-select it
      if (profile?.role === 'patient') setRole('patient')
      else if (profile?.role) setRole('doctor')

      setLoading(false)
    })
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!phone.trim()) {
      setError('El teléfono es obligatorio')
      return
    }
    if (role === 'doctor' && !sex) {
      setError('Selecciona tu sexo')
      return
    }
    if (!userId) return
    setError('')
    setSaving(true)

    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          role,
          phone: phone.trim(),
          full_name: userName,
          email: userEmail,
          specialty: role === 'doctor' ? specialty : undefined,
          professional_title: role === 'doctor' ? professionalTitle : undefined,
          sex: sex || undefined,
        }),
      })

      const result = await res.json()
      if (!res.ok) {
        setError(result.error || 'Error al guardar')
        setSaving(false)
        return
      }

      // Patients go straight to dashboard, doctors see pending approval
      if (role === 'patient') {
        router.push('/patient/dashboard')
      } else {
        setStep(3) // Show pending approval message
      }
    } catch (err: any) {
      setError(err?.message || 'Error al guardar')
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
      </div>
    )
  }

  const inp = 'w-full px-3.5 py-2.5 rounded-xl border-2 border-slate-200 text-sm font-medium outline-none transition-all focus:border-cyan-400 bg-white'

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-6 py-12" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');.g-bg{background:linear-gradient(135deg,#00C4CC 0%,#0891b2 100%)}.g-text{background:linear-gradient(135deg,#00C4CC 0%,#0891b2 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}`}</style>

      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="flex items-center gap-2.5 justify-center">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center g-bg">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div className="text-left">
              <p className="font-bold text-lg text-slate-900 leading-none">Delta</p>
              <p className="text-[10px] text-slate-400 font-semibold">Health Tech</p>
            </div>
          </div>

          {userName && (
            <p className="text-sm text-slate-500">
              Hola, <span className="font-semibold text-slate-700">{userName}</span>
            </p>
          )}
        </div>

        {/* Step 1: Role Selection */}
        {step === 1 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 space-y-6">
            <div className="text-center space-y-2">
              <h1 className="text-xl font-extrabold text-slate-900">¿Cómo usarás Delta?</h1>
              <p className="text-sm text-slate-500">Selecciona tu rol para personalizar tu experiencia</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setRole('doctor')}
                className={`p-5 rounded-xl border-2 text-center transition-all ${
                  role === 'doctor'
                    ? 'border-teal-400 bg-teal-50'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <Stethoscope className={`w-8 h-8 mx-auto mb-2 ${role === 'doctor' ? 'text-teal-500' : 'text-slate-400'}`} />
                <p className={`text-sm font-bold ${role === 'doctor' ? 'text-teal-700' : 'text-slate-700'}`}>Soy Médico</p>
                <p className="text-xs text-slate-400 mt-1">Gestiona tu consulta</p>
              </button>

              <button
                onClick={() => setRole('patient')}
                className={`p-5 rounded-xl border-2 text-center transition-all ${
                  role === 'patient'
                    ? 'border-teal-400 bg-teal-50'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <User className={`w-8 h-8 mx-auto mb-2 ${role === 'patient' ? 'text-teal-500' : 'text-slate-400'}`} />
                <p className={`text-sm font-bold ${role === 'patient' ? 'text-teal-700' : 'text-slate-700'}`}>Soy Paciente</p>
                <p className="text-xs text-slate-400 mt-1">Accede a tus citas</p>
              </button>
            </div>

            <button
              onClick={() => setStep(2)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white font-bold text-sm transition-all hover:opacity-90 g-bg"
            >
              Continuar <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Step 2: Phone + Details */}
        {step === 2 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 space-y-6">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center g-bg">
                <Phone className="w-7 h-7 text-white" />
              </div>
              <h1 className="text-xl font-extrabold text-slate-900">Completa tu perfil</h1>
              <p className="text-sm text-slate-500">
                {role === 'doctor'
                  ? 'Necesitamos algunos datos para configurar tu consulta'
                  : 'Tu teléfono nos permite contactarte sobre tus citas'}
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Phone — required for everyone */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Teléfono WhatsApp <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="+58 412 1234567"
                    className={inp + ' pl-10'}
                    autoFocus
                  />
                </div>
                <p className="text-xs text-slate-400 mt-1">Usaremos este número para verificación y notificaciones</p>
              </div>

              {/* Doctor-specific fields */}
              {role === 'doctor' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Sexo <span className="text-red-400">*</span></label>
                    <div className="grid grid-cols-2 gap-3">
                      {[{ v: 'female', label: 'Femenino' }, { v: 'male', label: 'Masculino' }].map(opt => (
                        <button
                          key={opt.v}
                          type="button"
                          onClick={() => setSex(opt.v)}
                          className={`px-4 py-2.5 rounded-xl border-2 text-sm font-semibold text-center transition-all ${
                            sex === opt.v
                              ? 'border-cyan-400 bg-cyan-50/50 text-cyan-700'
                              : 'border-slate-200 text-slate-500 hover:border-slate-300'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Título profesional</label>
                    <select value={professionalTitle} onChange={e => setProfessionalTitle(e.target.value)} className={inp}>
                      {PROFESSIONAL_TITLES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Especialidad</label>
                    <select value={specialty} onChange={e => setSpecialty(e.target.value)} className={inp}>
                      <option value="">Seleccionar...</option>
                      {ESPECIALIDADES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex-1 py-3 rounded-xl border-2 border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Atrás
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-white font-bold text-sm transition-all hover:opacity-90 disabled:opacity-50 g-bg"
                >
                  {saving ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</>
                  ) : (
                    <><CheckCircle2 className="w-4 h-4" /> Completar registro</>
                  )}
                </button>
              </div>
            </form>

            <p className="text-center text-xs text-slate-400">
              Podrás completar el resto de tus datos en Configuración
            </p>
          </div>
        )}

        {/* Step 3: Pending Approval (doctors) */}
        {step === 3 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 space-y-6 text-center">
            <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center bg-amber-100">
              <Clock className="w-8 h-8 text-amber-600" />
            </div>

            <div className="space-y-2">
              <h1 className="text-xl font-extrabold text-slate-900">¡Registro completado!</h1>
              <p className="text-sm text-slate-500">
                Tu cuenta ha sido creada exitosamente. Cuando el administrador de Delta apruebe tu solicitud, tendrás acceso completo a la beta.
              </p>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2 text-left">
              <p className="text-xs font-bold text-amber-700 uppercase tracking-wide">¿Qué sigue?</p>
              <p className="text-sm text-amber-800">
                El equipo de Delta revisará tu solicitud y te notificará cuando tu acceso esté activo. Este proceso suele tomar menos de 24 horas.
              </p>
            </div>

            <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 text-left">
              <p className="text-xs font-bold text-teal-700 uppercase tracking-wide mb-1">Tu información</p>
              <p className="text-sm text-teal-800">{userName} · {userEmail}</p>
              <p className="text-sm text-teal-800">{phone}</p>
              {specialty && <p className="text-sm text-teal-800">{specialty}</p>}
            </div>

            <Link
              href="/"
              className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl text-white font-bold text-sm transition-all hover:opacity-90 g-bg"
            >
              Volver al inicio <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
