'use client'

import { useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertCircle, Loader2, Mail, Lock, Eye, EyeOff, ArrowRight, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { resendConfirmation } from '../register/actions'
import { Suspense } from 'react'

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 001 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
}

/* Delta Isotipo — Lazo Abierto */
function DeltaIsotipo({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none" className={className}>
      <path d="M125 40 C75 25, 25 65, 30 120 C35 165, 75 190, 120 175" stroke="#06B6D4" strokeWidth="26" strokeLinecap="round" fill="none"/>
      <path d="M145 155 C170 120, 170 70, 140 45" stroke="#FF8A65" strokeWidth="26" strokeLinecap="round" fill="none"/>
    </svg>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" style={{ background: '#FAFBFC' }} />}>
      <LoginInner />
    </Suspense>
  )
}

function LoginInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const authError = searchParams.get('error')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(authError === 'auth' ? 'Error de autenticación. Intenta de nuevo.' : '')

  const [showEmailForm, setShowEmailForm] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [emailLoading, setEmailLoading] = useState(false)
  const [confirmingEmail, setConfirmingEmail] = useState(false)

  async function handleGoogleLogin() {
    setLoading(true)
    setError('')
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: { prompt: 'select_account' },
        },
      })
      if (error) { setError(error.message); setLoading(false) }
    } catch (err: any) {
      setError(err?.message || 'Error al conectar con Google')
      setLoading(false)
    }
  }

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !password) { setError('Ingresa tu email y contraseña'); return }
    setEmailLoading(true)
    setError('')

    try {
      const supabase = createClient()
      const { data, error: authErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password.trim(),
      })

      if (authErr || !data.user) {
        const msg = authErr?.message || ''

        // Handle "Email not confirmed" — auto-confirm in beta and retry
        if (msg.toLowerCase().includes('email not confirmed')) {
          setError('Tu email no estaba confirmado. Confirmando automáticamente...')
          setConfirmingEmail(true)
          try {
            const confirmResult = await resendConfirmation(email.trim())
            if (confirmResult.success) {
              // Retry login after confirming
              const { data: retryData, error: retryErr } = await supabase.auth.signInWithPassword({
                email: email.trim(),
                password: password.trim(),
              })
              if (retryErr || !retryData.user) {
                setError(retryErr?.message === 'Invalid login credentials'
                  ? 'Correo o contraseña incorrectos.'
                  : retryErr?.message || 'Error al iniciar sesión')
                setEmailLoading(false)
                setConfirmingEmail(false)
                return
              }
              // Success — continue with normal flow
              setConfirmingEmail(false)
              const { data: retryProfile } = await supabase
                .from('profiles')
                .select('role, phone')
                .eq('id', retryData.user.id)
                .maybeSingle()

              if (!retryProfile || !retryProfile.phone) {
                router.push('/onboarding')
              } else if (retryProfile.role === 'super_admin' || retryProfile.role === 'admin') {
                router.push('/admin')
              } else if (retryProfile.role === 'patient') {
                router.push('/patient/dashboard')
              } else {
                router.push('/doctor')
              }
              return
            } else {
              setError('No se pudo confirmar el email. Contacta soporte.')
            }
          } catch {
            setError('Error al confirmar email. Intenta de nuevo.')
          }
          setEmailLoading(false)
          setConfirmingEmail(false)
          return
        }

        setError(msg === 'Invalid login credentials'
          ? 'Correo o contraseña incorrectos.'
          : msg || 'Error al iniciar sesión')
        setEmailLoading(false)
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role, phone')
        .eq('id', data.user.id)
        .maybeSingle()

      if (!profile || !profile.phone) {
        router.push('/onboarding')
      } else if (profile.role === 'super_admin' || profile.role === 'admin') {
        router.push('/admin')
      } else if (profile.role === 'patient') {
        router.push('/patient/dashboard')
      } else {
        router.push('/doctor')
      }
    } catch (err: any) {
      setError(err?.message || 'Error al iniciar sesión')
      setEmailLoading(false)
    }
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');
        .login-root * { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; }
        .login-root { --dh-turquoise: #06B6D4; --dh-turquoise-700: #0891B2; --dh-turquoise-100: #CFFAFE; --dh-turquoise-50: #ECFEFF; --dh-coral: #FF8A65; --dh-coral-600: #F26F4A; --dh-ink: #0F1A2A; --dh-gray-50: #F4F6F8; --dh-gray-100: #E8ECF0; --dh-gray-400: #97A3AF; --dh-gray-600: #5A6773; --dh-bone: #FAFBFC; }
        .login-left { background: linear-gradient(160deg, #ECFEFF 0%, #FAFBFC 40%, #FFFFFF 100%); }
        .btn-google-dh { transition: all 0.2s; }
        .btn-google-dh:hover { transform: translateY(-1px); box-shadow: 0 8px 25px rgba(0,0,0,0.08); }
        .btn-primary-dh { background: var(--dh-ink); color: #fff; transition: all 0.2s; }
        .btn-primary-dh:hover { background: var(--dh-turquoise-700); transform: translateY(-1px); box-shadow: 0 8px 20px rgba(6,182,212,0.3); }
        .input-dh:focus { border-color: var(--dh-turquoise); box-shadow: 0 0 0 3px rgba(6,182,212,0.12); outline: none; }
        .float-1 { animation: f1 7s ease-in-out infinite; }
        .float-2 { animation: f2 9s ease-in-out infinite; }
        @keyframes f1 { 0%, 100% { transform: translateY(0) rotate(0); } 50% { transform: translateY(-16px) rotate(3deg); } }
        @keyframes f2 { 0%, 100% { transform: translateY(0) rotate(0); } 50% { transform: translateY(-10px) rotate(-2deg); } }
        .fade-up { animation: fadeUp 0.6s cubic-bezier(0.16,1,0.3,1) forwards; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        .store-pill { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 999px; border: 1px solid var(--dh-gray-100); color: var(--dh-gray-400); font-size: 11px; font-weight: 500; }
        .store-pill svg { width: 14px; height: 14px; }
      `}</style>

      <div className="login-root min-h-screen flex">
        {/* Left Panel — Brand */}
        <div className="login-left hidden lg:flex lg:w-[52%] relative overflow-hidden flex-col justify-between p-12 xl:p-16">
          {/* Background isotipo decorativo */}
          <svg className="absolute -right-20 -bottom-20 opacity-[0.04]" width="500" height="500" viewBox="0 0 200 200" fill="none">
            <path d="M125 40 C75 25, 25 65, 30 120 C35 165, 75 190, 120 175" stroke="#06B6D4" strokeWidth="26" strokeLinecap="round" fill="none"/>
            <path d="M145 155 C170 120, 170 70, 140 45" stroke="#FF8A65" strokeWidth="26" strokeLinecap="round" fill="none"/>
          </svg>

          {/* Top: Logo + Beta badge */}
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
                Beta Privada
              </span>
            </div>
          </div>

          {/* Center: Message */}
          <div className="relative z-10 space-y-6 max-w-md">
            <p className="text-xs font-semibold uppercase tracking-[0.15em]" style={{ color: 'var(--dh-turquoise-700)' }}>
              Beta privada · Acceso completo
            </p>
            <h1 className="text-4xl xl:text-[44px] font-extrabold leading-[1.1] tracking-tight" style={{ color: 'var(--dh-ink)' }}>
              Tu especialista,<br />
              a un <span style={{ color: 'var(--dh-turquoise)' }}>lazo</span> de<br />
              distancia.
            </h1>
            <p className="text-base leading-relaxed max-w-sm" style={{ color: 'var(--dh-gray-600)' }}>
              Gestiona pacientes, agenda, historial clínico y finanzas desde un solo lugar.
            </p>

            <div className="flex gap-8 pt-2">
              <div>
                <p className="text-2xl font-extrabold" style={{ color: 'var(--dh-ink)' }}>500+</p>
                <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--dh-gray-400)' }}>Especialistas</p>
              </div>
              <div>
                <p className="text-2xl font-extrabold" style={{ color: 'var(--dh-ink)' }}>12</p>
                <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--dh-gray-400)' }}>Especialidades</p>
              </div>
              <div>
                <p className="text-2xl font-extrabold" style={{ color: 'var(--dh-ink)' }}>24/7</p>
                <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--dh-gray-400)' }}>Disponibilidad</p>
              </div>
            </div>
          </div>

          {/* Bottom: Testimonial + App Stores */}
          <div className="relative z-10 space-y-4">
            <div className="rounded-2xl p-5 border" style={{ background: 'rgba(255,255,255,0.7)', borderColor: 'var(--dh-gray-100)' }}>
              <p className="text-sm leading-relaxed italic" style={{ color: 'var(--dh-gray-600)' }}>
                &ldquo;Delta transformó mi consulta. Ahora tengo todo bajo control y mis pacientes están más satisfechos.&rdquo;
              </p>
              <div className="flex items-center gap-3 mt-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold text-xs" style={{ background: 'var(--dh-turquoise)' }}>
                  CM
                </div>
                <div>
                  <p className="text-xs font-semibold" style={{ color: 'var(--dh-ink)' }}>Dr. Carlos Méndez</p>
                  <p className="text-[10px]" style={{ color: 'var(--dh-gray-400)' }}>Cardiólogo · Caracas</p>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="store-pill">
                <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 14, height: 14 }}><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
                Pronto en App Store
              </span>
              <span className="store-pill">
                <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 14, height: 14 }}><path d="M3.18 23.71c.46.27 1.03.3 1.52.09l.05-.02L17.53 17l-3.72-3.73L3.18 23.71zM.44 1.32c-.28.4-.44.9-.44 1.45v18.46c0 .55.16 1.05.44 1.45L11.5 12 .44 1.32zm21.16 9.37l-3.65-2.04-3.9 3.85 3.9 3.85 3.65-2.04c.68-.38 1.1-1.08 1.1-1.86 0-.78-.42-1.48-1.1-1.76zM4.75.29L17.53 7l-3.72 3.73L3.18.29C3.64.02 4.21-.01 4.7.2l.05.09z"/></svg>
                Pronto en Google Play
              </span>
              <span className="store-pill" style={{ borderColor: 'var(--dh-turquoise-100)', color: 'var(--dh-turquoise-700)' }}>
                Próximamente planes disponibles
              </span>
            </div>
          </div>
        </div>

        {/* Right Panel — Login Form */}
        <div className="flex-1 flex items-center justify-center p-8" style={{ background: 'var(--dh-bone)' }}>
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
            <div className="rounded-2xl p-8 border" style={{ background: '#FFFFFF', borderColor: 'var(--dh-gray-100)', boxShadow: '0 4px 12px rgba(15,26,42,0.04), 0 1px 3px rgba(15,26,42,0.03)' }}>
              <div className="mb-7 text-center">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider mb-3" style={{ background: 'var(--dh-turquoise-50)', color: 'var(--dh-turquoise-700)', border: '1px solid var(--dh-turquoise-100)' }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--dh-turquoise)' }} />
                  Beta Privada
                </span>
                <h2 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--dh-ink)' }}>
                  Bienvenido a Delta
                </h2>
                <p className="text-sm mt-2" style={{ color: 'var(--dh-gray-400)' }}>
                  Inicia sesión o crea tu cuenta
                </p>
              </div>

              {error && (
                <div className="mb-5 rounded-xl px-4 py-3 flex items-start gap-2" style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-red-700 text-sm">{error}</p>
                </div>
              )}

              {/* Google Button */}
              <button
                onClick={handleGoogleLogin}
                disabled={loading}
                className="btn-google-dh w-full flex items-center justify-center gap-3 py-3.5 px-4 rounded-xl border-2 text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ borderColor: 'var(--dh-gray-100)', color: 'var(--dh-ink)', background: '#fff' }}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--dh-gray-400)' }} />
                    Conectando con Google...
                  </>
                ) : (
                  <>
                    <GoogleIcon className="w-5 h-5" />
                    Continuar con Google
                  </>
                )}
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px" style={{ background: 'var(--dh-gray-100)' }} />
                <span className="text-xs font-medium" style={{ color: 'var(--dh-gray-400)' }}>o</span>
                <div className="flex-1 h-px" style={{ background: 'var(--dh-gray-100)' }} />
              </div>

              {/* Email/Password */}
              {!showEmailForm ? (
                <button
                  onClick={() => setShowEmailForm(true)}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 text-sm font-semibold transition-all"
                  style={{ borderColor: 'var(--dh-gray-100)', color: 'var(--dh-gray-600)' }}
                >
                  <Mail className="w-4 h-4" />
                  Iniciar con email y contraseña
                </button>
              ) : (
                <form onSubmit={handleEmailLogin} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--dh-ink)' }}>Correo electrónico</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--dh-gray-400)' }} />
                      <input
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        required
                        disabled={emailLoading}
                        placeholder="medico@ejemplo.com"
                        className="input-dh w-full pl-10 pr-4 py-3 border rounded-xl text-sm transition-all disabled:opacity-60"
                        style={{ borderColor: 'var(--dh-gray-100)', color: 'var(--dh-ink)', background: 'var(--dh-gray-50)' }}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--dh-ink)' }}>Contraseña</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--dh-gray-400)' }} />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        required
                        disabled={emailLoading}
                        placeholder="••••••••"
                        className="input-dh w-full pl-10 pr-10 py-3 border rounded-xl text-sm transition-all disabled:opacity-60"
                        style={{ borderColor: 'var(--dh-gray-100)', color: 'var(--dh-ink)', background: 'var(--dh-gray-50)' }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2"
                        style={{ color: 'var(--dh-gray-400)' }}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={emailLoading}
                    className="btn-primary-dh w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {emailLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {confirmingEmail ? 'Confirmando email...' : 'Verificando...'}
                      </>
                    ) : (
                      <>
                        Ingresar
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => { setShowEmailForm(false); setError('') }}
                    className="w-full text-xs transition-colors"
                    style={{ color: 'var(--dh-gray-400)' }}
                  >
                    ← Volver a opciones de login
                  </button>
                </form>
              )}

              {/* Role badges */}
              <div className="mt-5 flex gap-2 justify-center">
                <span className="text-xs font-semibold px-3 py-1.5 rounded-full" style={{ color: 'var(--dh-turquoise-700)', background: 'var(--dh-turquoise-50)' }}>Especialistas</span>
                <span className="text-xs font-semibold px-3 py-1.5 rounded-full" style={{ color: 'var(--dh-coral-600)', background: '#FFF5F0' }}>Pacientes</span>
                <span className="text-xs font-semibold px-3 py-1.5 rounded-full" style={{ color: 'var(--dh-gray-600)', background: 'var(--dh-gray-50)' }}>Admin</span>
              </div>

              <p className="text-center text-xs mt-4" style={{ color: 'var(--dh-gray-400)' }}>
                Si es tu primera vez con Google, se creará tu cuenta automáticamente.
              </p>
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
