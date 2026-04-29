'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  AlertCircle, Loader2, Mail, Lock, Eye, EyeOff, ArrowRight,
  User, Phone, Stethoscope, ChevronDown, CheckCircle2
} from 'lucide-react'
import { registerDoctor, registerPatient } from './actions'
import { createClient } from '@/lib/supabase/client'

const specialties = [
  'Cardiología', 'Dermatología', 'Endocrinología', 'Gastroenterología',
  'Ginecología y Obstetricia', 'Medicina General', 'Medicina Interna',
  'Nefrología', 'Neurología', 'Nutrición', 'Odontología',
  'Oftalmología', 'Ortopedia y Traumatología',
  'Otorrinolaringología', 'Pediatría', 'Psicología', 'Psiquiatría',
  'Reumatología', 'Fisioterapia', 'Urología', 'Otra',
]

/* Delta Isotipo */
function DeltaIsotipo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none">
      <path d="M22 78 C 22 38, 56 18, 78 38 C 96 54, 86 82, 62 82 C 46 82, 36 70, 42 56" stroke="#06B6D4" strokeWidth="14" strokeLinecap="round" fill="none"/>
      <path d="M58 92 C 78 92, 92 78, 88 60" stroke="#FF8A65" strokeWidth="14" strokeLinecap="round" fill="none"/>
      <circle cx="78" cy="72" r="4.5" fill="#FF8A65" />
    </svg>
  )
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 001 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}

type Role = 'especialista' | 'paciente' | null

export default function RegisterPage() {
  const router = useRouter()
  const [role, setRole] = useState<Role>(null)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  // Form fields
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [phone, setPhone] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [professionalTitle, setProfessionalTitle] = useState('Dr.')

  async function handleGoogleRegister() {
    setGoogleLoading(true)
    setError('')
    try {
      const supabase = createClient()
      const intendedRole = role === 'especialista' ? 'doctor' : 'patient'
      // AUDIT FIX 2026-04-28 (FASE 5D): el rol del registro se persiste en
      // localStorage; /onboarding lo lee si profile.role llega NULL desde el
      // trigger BD `handle_new_user_signup`. Supabase OAuth no permite enviar
      // user_metadata custom desde signInWithOAuth, por eso el client-side hop.
      try { localStorage.setItem('pending_role', intendedRole) } catch { /* ignore */ }
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: { prompt: 'select_account' },
        },
      })
      if (error) { setError(error.message); setGoogleLoading(false) }
    } catch (err: any) {
      setError(err?.message || 'Error al conectar con Google')
      setGoogleLoading(false)
    }
  }

  async function handlePatientRegister(e: React.FormEvent) {
    e.preventDefault()
    if (!fullName || !email || !password) { setError('Completa todos los campos obligatorios'); return }
    setLoading(true)
    setError('')

    try {
      const result = await registerPatient({
        full_name: fullName.trim(),
        email: email.trim(),
        password: password.trim(),
        phone: phone.trim() || undefined,
      })

      if (!result.success) {
        setError(result.error)
        setLoading(false)
        return
      }

      setSuccess(true)
    } catch (err: any) {
      setError(err?.message || 'Error al registrar')
      setLoading(false)
    }
  }

  async function handleDoctorRegister(e: React.FormEvent) {
    e.preventDefault()
    if (!fullName || !email || !password || !phone) { setError('Completa todos los campos obligatorios'); return }
    setLoading(true)
    setError('')

    try {
      const result = await registerDoctor({
        full_name: fullName.trim(),
        email: email.trim(),
        password: password.trim(),
        phone: phone.trim(),
        specialty,
        cedula: '',
        plan: 'trial',
        professional_title: professionalTitle,
      })

      if (!result.success) {
        setError(result.error)
        setLoading(false)
        return
      }

      setSuccess(true)
    } catch (err: any) {
      setError(err?.message || 'Error al registrar')
      setLoading(false)
    }
  }

  if (success) {
    return (
      <>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');
          .register-root * { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; }
        `}</style>
        <div className="register-root min-h-screen flex items-center justify-center p-6" style={{ background: '#FAFBFC' }}>
          <div className="w-full max-w-lg text-center space-y-6" style={{ animation: 'fadeUp 0.5s ease forwards' }}>
            <div className="mx-auto w-16 h-16 rounded-full flex items-center justify-center" style={{ background: '#ECFEFF' }}>
              <CheckCircle2 className="w-8 h-8" style={{ color: '#0891B2' }} />
            </div>
            <h1 className="text-2xl font-bold" style={{ color: '#0F1A2A' }}>
              {role === 'especialista' ? '¡Bienvenido a Delta!' : '¡Cuenta creada!'}
            </h1>
            {role === 'especialista' ? (
              <div className="space-y-4 text-left bg-white border border-slate-200 rounded-2xl p-5">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-400 to-cyan-600 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-900">Período de prueba activado</p>
                    <p className="text-sm text-slate-600 mt-1">
                      Tienes acceso completo y gratuito por 1 año (configurable por el administrador).
                      Cuando se acerque el vencimiento te avisaremos.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 pt-3 border-t border-slate-100">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                    <span className="text-lg">💳</span>
                  </div>
                  <div>
                    <p className="font-bold text-slate-900">Plan profesional — $30/mes</p>
                    <p className="text-sm text-slate-600 mt-1">
                      Cuando termine tu Beta, podrás contratar el plan desde
                      <strong> Configuración → Suscripción</strong>. Ofrecemos descuentos por compra de 3, 6 o 12 meses.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm" style={{ color: '#5A6773' }}>
                Tu cuenta ha sido creada exitosamente. Ya puedes iniciar sesión en el portal de pacientes.
              </p>
            )}
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold text-white transition-all"
              style={{ background: '#0F1A2A' }}
            >
              Ir a iniciar sesión <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');
        .register-root * { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; }
        .register-root { --dh-turquoise: #06B6D4; --dh-turquoise-700: #0891B2; --dh-turquoise-100: #CFFAFE; --dh-turquoise-50: #ECFEFF; --dh-coral: #FF8A65; --dh-coral-600: #F26F4A; --dh-ink: #0F1A2A; --dh-gray-50: #F4F6F8; --dh-gray-100: #E8ECF0; --dh-gray-200: #D6DCE3; --dh-gray-400: #97A3AF; --dh-gray-600: #5A6773; --dh-bone: #FAFBFC; }
        .register-left { background: linear-gradient(160deg, #ECFEFF 0%, #FAFBFC 40%, #FFFFFF 100%); }
        .btn-google-reg { transition: all 0.2s; }
        .btn-google-reg:hover { transform: translateY(-1px); box-shadow: 0 8px 25px rgba(0,0,0,0.08); }
        .btn-primary-reg { background: var(--dh-ink); color: #fff; transition: all 0.2s; }
        .btn-primary-reg:hover { background: var(--dh-turquoise-700); transform: translateY(-1px); box-shadow: 0 8px 20px rgba(6,182,212,0.3); }
        .input-reg:focus { border-color: var(--dh-turquoise); box-shadow: 0 0 0 3px rgba(6,182,212,0.12); outline: none; }
        .role-card { transition: all 0.2s; cursor: pointer; }
        .role-card:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(0,0,0,0.06); }
        .role-card.selected { border-color: var(--dh-turquoise); box-shadow: 0 0 0 3px rgba(6,182,212,0.12); }
        .fade-up { animation: fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) forwards; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        .store-pill { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 999px; border: 1px solid var(--dh-gray-100); color: var(--dh-gray-400); font-size: 11px; font-weight: 500; }
      `}</style>

      <div className="register-root min-h-screen flex">
        {/* Left Panel — Brand */}
        <div className="register-left hidden lg:flex lg:w-[48%] relative overflow-hidden flex-col justify-between p-12 xl:p-16">
          <svg className="absolute -right-20 -bottom-20 opacity-[0.04]" width="500" height="500" viewBox="0 0 120 120" fill="none">
            <path d="M22 78 C 22 38, 56 18, 78 38 C 96 54, 86 82, 62 82 C 46 82, 36 70, 42 56" stroke="#06B6D4" strokeWidth="14" strokeLinecap="round" fill="none"/>
            <path d="M58 92 C 78 92, 92 78, 88 60" stroke="#FF8A65" strokeWidth="14" strokeLinecap="round" fill="none"/>
          </svg>

          <div className="relative z-10">
            <div className="flex items-center gap-3">
              <DeltaIsotipo size={38} />
              <div>
                <p className="font-extrabold text-lg leading-none tracking-tight" style={{ color: 'var(--dh-ink)' }}>
                  Delta<span style={{ color: 'var(--dh-turquoise)' }}>.</span>
                </p>
                <p className="text-[10px] font-medium tracking-[0.12em] uppercase" style={{ color: 'var(--dh-gray-400)' }}>
                  Health Tech
                </p>
              </div>
              <span className="ml-2 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider" style={{ background: 'var(--dh-turquoise-50)', color: 'var(--dh-turquoise-700)', border: '1px solid var(--dh-turquoise-100)' }}>
                Health Tech
              </span>
            </div>
          </div>

          <div className="relative z-10 space-y-6 max-w-md">
            <p className="text-xs font-semibold uppercase tracking-[0.15em]" style={{ color: 'var(--dh-turquoise-700)' }}>
              Crea tu cuenta gratis
            </p>
            <h1 className="text-4xl xl:text-[44px] font-extrabold leading-[1.1] tracking-tight" style={{ color: 'var(--dh-ink)' }}>
              Comienza a usar<br />
              Delta <span style={{ color: 'var(--dh-turquoise)' }}>hoy</span>.
            </h1>
            <p className="text-base leading-relaxed max-w-sm" style={{ color: 'var(--dh-gray-600)' }}>
              Regístrate en menos de 2 minutos y accede a todas las funcionalidades de la plataforma.
            </p>

            <div className="flex gap-8 pt-2">
              <div>
                <p className="text-2xl font-extrabold" style={{ color: 'var(--dh-ink)' }}>500+</p>
                <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--dh-gray-400)' }}>Especialistas</p>
              </div>
              <div>
                <p className="text-2xl font-extrabold" style={{ color: 'var(--dh-ink)' }}>Gratis</p>
                <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--dh-gray-400)' }}>1 año de prueba</p>
              </div>
              <div>
                <p className="text-2xl font-extrabold" style={{ color: 'var(--dh-ink)' }}>2 min</p>
                <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--dh-gray-400)' }}>Para registrarte</p>
              </div>
            </div>
          </div>

          <div className="relative z-10 flex flex-wrap items-center gap-2">
            <span className="store-pill" style={{ borderColor: 'var(--dh-turquoise-100)', color: 'var(--dh-turquoise-700)' }}>
              Próximamente planes disponibles
            </span>
          </div>
        </div>

        {/* Right Panel — Register Form */}
        <div className="flex-1 flex items-center justify-center p-6 sm:p-8 overflow-y-auto" style={{ background: 'var(--dh-bone)' }}>
          <div className="w-full max-w-md fade-up">

            {/* Mobile logo */}
            <div className="flex lg:hidden items-center gap-3 mb-8 justify-center">
              <DeltaIsotipo size={38} />
              <div>
                <p className="font-extrabold text-lg leading-none tracking-tight" style={{ color: 'var(--dh-ink)' }}>
                  Delta<span style={{ color: 'var(--dh-turquoise)' }}>.</span>
                </p>
                <p className="text-[10px] font-medium tracking-[0.12em] uppercase" style={{ color: 'var(--dh-gray-400)' }}>
                  Health Tech
                </p>
              </div>
            </div>

            {/* Card */}
            <div className="rounded-2xl p-7 sm:p-8 border" style={{ background: '#FFFFFF', borderColor: 'var(--dh-gray-100)', boxShadow: '0 4px 12px rgba(15,26,42,0.04), 0 1px 3px rgba(15,26,42,0.03)' }}>

              {/* Step 1: Choose Role */}
              {!role && (
                <div className="space-y-6">
                  <div className="text-center">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider mb-3" style={{ background: 'var(--dh-turquoise-50)', color: 'var(--dh-turquoise-700)', border: '1px solid var(--dh-turquoise-100)' }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--dh-turquoise)' }} />
                      Comenzar gratis
                    </span>
                    <h2 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--dh-ink)' }}>
                      Crear cuenta
                    </h2>
                    <p className="text-sm mt-2" style={{ color: 'var(--dh-gray-400)' }}>
                      Selecciona tu perfil para continuar
                    </p>
                  </div>

                  <div className="space-y-3">
                    <button
                      onClick={() => setRole('especialista')}
                      className="role-card w-full flex items-center gap-4 p-5 rounded-xl border-2 text-left"
                      style={{ borderColor: 'var(--dh-gray-100)', background: '#fff' }}
                    >
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--dh-turquoise-50)' }}>
                        <Stethoscope className="w-6 h-6" style={{ color: 'var(--dh-turquoise-700)' }} />
                      </div>
                      <div>
                        <p className="font-bold text-sm" style={{ color: 'var(--dh-ink)' }}>Soy Especialista</p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--dh-gray-400)' }}>
                          Médico, psicólogo, terapeuta u otro profesional de salud
                        </p>
                      </div>
                      <ArrowRight className="w-4 h-4 ml-auto shrink-0" style={{ color: 'var(--dh-gray-200)' }} />
                    </button>

                    <button
                      onClick={() => setRole('paciente')}
                      className="role-card w-full flex items-center gap-4 p-5 rounded-xl border-2 text-left"
                      style={{ borderColor: 'var(--dh-gray-100)', background: '#fff' }}
                    >
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#FFF5F0' }}>
                        <User className="w-6 h-6" style={{ color: 'var(--dh-coral-600)' }} />
                      </div>
                      <div>
                        <p className="font-bold text-sm" style={{ color: 'var(--dh-ink)' }}>Soy Paciente</p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--dh-gray-400)' }}>
                          Quiero agendar citas y acceder a mi historial médico
                        </p>
                      </div>
                      <ArrowRight className="w-4 h-4 ml-auto shrink-0" style={{ color: 'var(--dh-gray-200)' }} />
                    </button>
                  </div>
                </div>
              )}

              {/* Step 2: Registration Form */}
              {role && (
                <div className="space-y-5">
                  <div className="text-center">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider mb-3" style={{
                      background: role === 'especialista' ? 'var(--dh-turquoise-50)' : '#FFF5F0',
                      color: role === 'especialista' ? 'var(--dh-turquoise-700)' : 'var(--dh-coral-600)',
                      border: `1px solid ${role === 'especialista' ? 'var(--dh-turquoise-100)' : '#FFE5DA'}`,
                    }}>
                      {role === 'especialista' ? <Stethoscope className="w-3 h-3" /> : <User className="w-3 h-3" />}
                      {role === 'especialista' ? 'Especialista' : 'Paciente'}
                    </span>
                    <h2 className="text-xl font-bold tracking-tight" style={{ color: 'var(--dh-ink)' }}>
                      {role === 'especialista' ? 'Registro de Especialista' : 'Registro de Paciente'}
                    </h2>
                    <p className="text-sm mt-1" style={{ color: 'var(--dh-gray-400)' }}>
                      Completa tus datos para crear tu cuenta
                    </p>
                  </div>

                  {error && (
                    <div className="rounded-xl px-4 py-3 flex items-start gap-2" style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
                      <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                      <p className="text-red-700 text-sm">{error}</p>
                    </div>
                  )}

                  {/* Google option */}
                  <button
                    onClick={handleGoogleRegister}
                    disabled={googleLoading}
                    className="btn-google-reg w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl border-2 text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                    style={{ borderColor: 'var(--dh-gray-100)', color: 'var(--dh-ink)', background: '#fff' }}
                  >
                    {googleLoading ? (
                      <><Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--dh-gray-400)' }} /> Conectando...</>
                    ) : (
                      <><GoogleIcon className="w-5 h-5" /> Registrarme con Google</>
                    )}
                  </button>

                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px" style={{ background: 'var(--dh-gray-100)' }} />
                    <span className="text-xs font-medium" style={{ color: 'var(--dh-gray-400)' }}>o con email</span>
                    <div className="flex-1 h-px" style={{ background: 'var(--dh-gray-100)' }} />
                  </div>

                  <form onSubmit={role === 'especialista' ? handleDoctorRegister : handlePatientRegister} className="space-y-3.5">
                    {/* Name */}
                    <div>
                      <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--dh-ink)' }}>
                        Nombre completo <span className="text-red-400">*</span>
                      </label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--dh-gray-400)' }} />
                        <input
                          type="text"
                          value={fullName}
                          onChange={e => setFullName(e.target.value)}
                          required
                          disabled={loading}
                          placeholder={role === 'especialista' ? 'Dr. Juan Pérez' : 'María García'}
                          className="input-reg w-full pl-10 pr-4 py-3 border rounded-xl text-sm transition-all disabled:opacity-60"
                          style={{ borderColor: 'var(--dh-gray-100)', color: 'var(--dh-ink)', background: 'var(--dh-gray-50)' }}
                        />
                      </div>
                    </div>

                    {/* Email */}
                    <div>
                      <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--dh-ink)' }}>
                        Correo electrónico <span className="text-red-400">*</span>
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--dh-gray-400)' }} />
                        <input
                          type="email"
                          value={email}
                          onChange={e => setEmail(e.target.value)}
                          required
                          disabled={loading}
                          placeholder="correo@ejemplo.com"
                          className="input-reg w-full pl-10 pr-4 py-3 border rounded-xl text-sm transition-all disabled:opacity-60"
                          style={{ borderColor: 'var(--dh-gray-100)', color: 'var(--dh-ink)', background: 'var(--dh-gray-50)' }}
                        />
                      </div>
                    </div>

                    {/* Password */}
                    <div>
                      <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--dh-ink)' }}>
                        Contraseña <span className="text-red-400">*</span>
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--dh-gray-400)' }} />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={e => setPassword(e.target.value)}
                          required
                          disabled={loading}
                          placeholder="Mínimo 6 caracteres"
                          className="input-reg w-full pl-10 pr-10 py-3 border rounded-xl text-sm transition-all disabled:opacity-60"
                          style={{ borderColor: 'var(--dh-gray-100)', color: 'var(--dh-ink)', background: 'var(--dh-gray-50)' }}
                        />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--dh-gray-400)' }}>
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Phone (required for specialists) */}
                    {role === 'especialista' && (
                      <div>
                        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--dh-ink)' }}>
                          Teléfono <span className="text-red-400">*</span>
                        </label>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--dh-gray-400)' }} />
                          <input
                            type="tel"
                            value={phone}
                            onChange={e => setPhone(e.target.value)}
                            required
                            disabled={loading}
                            placeholder="+58 414 1234567"
                            className="input-reg w-full pl-10 pr-4 py-3 border rounded-xl text-sm transition-all disabled:opacity-60"
                            style={{ borderColor: 'var(--dh-gray-100)', color: 'var(--dh-ink)', background: 'var(--dh-gray-50)' }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Specialty (specialists only) */}
                    {role === 'especialista' && (
                      <div>
                        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--dh-ink)' }}>
                          Especialidad
                        </label>
                        <div className="relative">
                          <Stethoscope className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--dh-gray-400)' }} />
                          <select
                            value={specialty}
                            onChange={e => setSpecialty(e.target.value)}
                            disabled={loading}
                            className="input-reg w-full pl-10 pr-10 py-3 border rounded-xl text-sm transition-all disabled:opacity-60 appearance-none"
                            style={{ borderColor: 'var(--dh-gray-100)', color: specialty ? 'var(--dh-ink)' : 'var(--dh-gray-400)', background: 'var(--dh-gray-50)' }}
                          >
                            <option value="">Selecciona tu especialidad</option>
                            {specialties.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--dh-gray-400)' }} />
                        </div>
                      </div>
                    )}

                    {/* Submit */}
                    <button
                      type="submit"
                      disabled={loading}
                      className="btn-primary-reg w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed mt-2"
                    >
                      {loading ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Creando cuenta...</>
                      ) : (
                        <>Crear cuenta <ArrowRight className="w-4 h-4" /></>
                      )}
                    </button>
                  </form>

                  <button
                    onClick={() => { setRole(null); setError('') }}
                    className="w-full text-xs transition-colors text-center"
                    style={{ color: 'var(--dh-gray-400)' }}
                  >
                    ← Cambiar tipo de cuenta
                  </button>
                </div>
              )}

              {/* Login link */}
              <div className="mt-5 pt-4 text-center" style={{ borderTop: '1px solid var(--dh-gray-100)' }}>
                <p className="text-sm" style={{ color: 'var(--dh-gray-400)' }}>
                  ¿Ya tienes cuenta?{' '}
                  <Link href="/login" className="font-semibold transition-colors" style={{ color: 'var(--dh-turquoise-700)' }}>
                    Iniciar sesión
                  </Link>
                </p>
              </div>
            </div>

            <p className="text-center text-xs mt-5" style={{ color: 'var(--dh-gray-400)' }}>
              <Link href="/" className="hover:opacity-70 transition-opacity">
                ← Volver al inicio
              </Link>
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
