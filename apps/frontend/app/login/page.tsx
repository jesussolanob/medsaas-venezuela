'use client';

import { useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, Loader2, Mail, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { loginUser } from './actions';
import { Suspense } from 'react';
import { DeltaMark } from '@/components/dh';
import { ReviewerLoginBlock } from './ReviewerLoginBlock';

// Injected at build time by Next.js — safe to read in 'use client' components.
const IS_AUTH0_MODE = process.env.NEXT_PUBLIC_AUTH_MODE === 'auth0';

// Wrapper local para mantener API existente con className opcional
function DeltaIsotipo({ size = 40, className }: { size?: number; className?: string }) {
  return <DeltaMark size={size} bold className={className} />;
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 001 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" style={{ background: '#FAFBFC' }} />}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const authError = searchParams.get('error');
  const isBlocked = searchParams.get('blocked') === '1';
  // El especialista dio de baja su propia cuenta: no corresponde el texto de
  // bloqueo, que se lee como sanción. Su información sigue guardada.
  const isDeactivated = searchParams.get('deactivated') === '1';
  const isReviewMode = searchParams.get('review') === '1';
  const [loading] = useState(false);
  const [error, setError] = useState(
    isDeactivated
      ? 'Diste de baja tu cuenta. Tu información sigue guardada: para reactivarla, contacta al administrador de Delta Salud.'
      : isBlocked
        ? 'Tu cuenta ha sido bloqueada. Contacta al administrador de Delta Salud.'
        : authError === 'auth'
          ? 'Error de autenticación. Intenta de nuevo.'
          : authError === 'suspended'
            ? 'Tu cuenta se encuentra suspendida. Contacta al administrador.'
            : '',
  );

  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [confirmingEmail] = useState(false);
  // True while a full-page redirect to Auth0 is in flight — disables the card and
  // shows a loader so the user gets feedback (the browser tab spinner is not enough).
  const [redirecting, setRedirecting] = useState(false);

  function handleGoogleLogin() {
    if (IS_AUTH0_MODE) {
      // Auth0 Universal Login with Google connection.
      // returnTo dispatches to the role-based portal after callback (not the public landing).
      setRedirecting(true);
      window.location.href = '/auth/login?connection=google-oauth2&returnTo=/post-login';
      return;
    }
    // dev-stub: OAuth not available.
    setError('El inicio de sesión con Google estará disponible próximamente.');
  }

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      setError('Ingresa tu email y contraseña');
      return;
    }
    setEmailLoading(true);
    setError('');

    try {
      // ETAPA 1: login dev-stub vía server action (setea cookies dev_user_*).
      // El rol se infiere del email; el password se ignora (sin proveedor de auth).
      const result = await loginUser(email.trim(), password.trim());

      if (!result.success) {
        setError(result.error);
        setEmailLoading(false);
        return;
      }

      router.push(result.destination);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión');
      setEmailLoading(false);
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
          {/* Background isotipo decorativo (logo oficial) */}
          <div className="absolute -right-20 -bottom-20 opacity-[0.06] pointer-events-none">
            <DeltaMark size={500} bold />
          </div>

          {/* Top: Logo + Beta badge */}
          <div className="relative z-10">
            <div className="flex items-center gap-3">
              <DeltaIsotipo size={38} />
              <div>
                <p
                  className="font-extrabold text-lg leading-none tracking-tight"
                  style={{ color: 'var(--dh-ink)' }}
                >
                  Delta Salud
                </p>
              </div>
            </div>
          </div>

          {/* Center: Message */}
          <div className="relative z-10 space-y-6 max-w-md">
            <p
              className="text-xs font-semibold uppercase tracking-[0.15em]"
              style={{ color: 'var(--dh-turquoise-700)' }}
            >
              Plataforma médica integral
            </p>
            <h1
              className="text-4xl xl:text-[44px] font-extrabold leading-[1.1] tracking-tight"
              style={{ color: 'var(--dh-ink)' }}
            >
              Tu especialista,
              <br />a un <span style={{ color: 'var(--dh-turquoise)' }}>lazo</span> de
              <br />
              distancia.
            </h1>
            <p
              className="text-base leading-relaxed max-w-sm"
              style={{ color: 'var(--dh-gray-600)' }}
            >
              Gestiona pacientes, agenda, historial clínico y finanzas desde un solo lugar.
            </p>
          </div>

          {/* Bottom: Testimonial + App Stores */}
          <div className="relative z-10 space-y-4">
            <div
              className="rounded-2xl p-5 border"
              style={{ background: 'rgba(255,255,255,0.7)', borderColor: 'var(--dh-gray-100)' }}
            >
              <p className="text-sm leading-relaxed italic" style={{ color: 'var(--dh-gray-600)' }}>
                &ldquo;Delta Salud transformó mi consulta. Ahora tengo todo bajo control y mis
                pacientes están más satisfechos.&rdquo;
              </p>
              <div className="flex items-center gap-3 mt-3">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold text-xs"
                  style={{ background: 'var(--dh-turquoise)' }}
                >
                  CM
                </div>
                <div>
                  <p className="text-xs font-semibold" style={{ color: 'var(--dh-ink)' }}>
                    Dr. Carlos Méndez
                  </p>
                  <p className="text-[10px]" style={{ color: 'var(--dh-gray-400)' }}>
                    Cardiólogo · Caracas
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel — Login Form */}
        <div
          className="flex-1 flex items-center justify-center p-8"
          style={{ background: 'var(--dh-bone)' }}
        >
          <div className="w-full max-w-md fade-up">
            {/* Mobile logo */}
            <div className="flex lg:hidden items-center gap-3 mb-8 justify-center">
              <DeltaIsotipo size={38} />
              <div>
                <p
                  className="font-extrabold text-lg leading-none tracking-tight"
                  style={{ color: 'var(--dh-ink)' }}
                >
                  Delta Salud
                </p>
              </div>
            </div>

            {/* Card */}
            <div
              className="rounded-2xl p-8 border"
              style={{
                background: '#FFFFFF',
                borderColor: 'var(--dh-gray-100)',
                boxShadow: '0 4px 12px rgba(15,26,42,0.04), 0 1px 3px rgba(15,26,42,0.03)',
              }}
            >
              <div className="mb-7 text-center">
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider mb-3"
                  style={{
                    background: 'var(--dh-turquoise-50)',
                    color: 'var(--dh-turquoise-700)',
                    border: '1px solid var(--dh-turquoise-100)',
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: 'var(--dh-turquoise)' }}
                  />
                  Bienvenido
                </span>
                <h2
                  className="text-2xl font-bold tracking-tight"
                  style={{ color: 'var(--dh-ink)' }}
                >
                  Bienvenido a Delta Salud
                </h2>
                <p className="text-sm mt-2" style={{ color: 'var(--dh-gray-400)' }}>
                  Inicia sesión o crea tu cuenta
                </p>
              </div>

              {error && (
                <div
                  className="mb-5 rounded-xl px-4 py-3 flex items-start gap-2"
                  style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}
                >
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-red-700 text-sm">{error}</p>
                </div>
              )}

              {/* Full-page redirect loader — disables the whole card while Auth0 loads */}
              {redirecting && (
                <div
                  className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4"
                  style={{ background: 'rgba(250, 251, 252, 0.85)', backdropFilter: 'blur(2px)' }}
                  role="status"
                  aria-live="polite"
                >
                  <Loader2
                    className="w-9 h-9 animate-spin"
                    style={{ color: 'var(--dh-teal, #14b8a6)' }}
                  />
                  <p className="text-sm font-medium" style={{ color: 'var(--dh-gray-600)' }}>
                    Redirigiendo…
                  </p>
                </div>
              )}

              {/* Google Button */}
              <button
                onClick={handleGoogleLogin}
                disabled={loading || redirecting}
                className="btn-google-dh w-full flex items-center justify-center gap-3 py-3.5 px-4 rounded-xl border-2 text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                style={{
                  borderColor: 'var(--dh-gray-100)',
                  color: 'var(--dh-ink)',
                  background: '#fff',
                }}
              >
                {loading || redirecting ? (
                  <>
                    <Loader2
                      className="w-5 h-5 animate-spin"
                      style={{ color: 'var(--dh-gray-400)' }}
                    />
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
                <span className="text-xs font-medium" style={{ color: 'var(--dh-gray-400)' }}>
                  o
                </span>
                <div className="flex-1 h-px" style={{ background: 'var(--dh-gray-100)' }} />
              </div>

              {/* Email/Password — hidden in Auth0 mode (Universal Login handles it) */}
              {IS_AUTH0_MODE ? (
                <button
                  onClick={() => {
                    setRedirecting(true);
                    window.location.href = '/auth/login?returnTo=/post-login';
                  }}
                  disabled={redirecting}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 text-sm font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  style={{ borderColor: 'var(--dh-gray-100)', color: 'var(--dh-gray-600)' }}
                >
                  <Mail className="w-4 h-4" />
                  Continuar con correo electrónico
                </button>
              ) : !showEmailForm ? (
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
                    <label
                      className="block text-sm font-medium mb-1.5"
                      style={{ color: 'var(--dh-ink)' }}
                    >
                      Correo electrónico
                    </label>
                    <div className="relative">
                      <Mail
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                        style={{ color: 'var(--dh-gray-400)' }}
                      />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        disabled={emailLoading}
                        placeholder="medico@ejemplo.com"
                        className="input-dh w-full pl-10 pr-4 py-3 border rounded-xl text-sm transition-all disabled:opacity-60"
                        style={{
                          borderColor: 'var(--dh-gray-100)',
                          color: 'var(--dh-ink)',
                          background: 'var(--dh-gray-50)',
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label
                        className="block text-sm font-medium"
                        style={{ color: 'var(--dh-ink)' }}
                      >
                        Contraseña
                      </label>
                      <Link
                        href="/forgot-password"
                        className="text-xs font-semibold hover:underline"
                        style={{ color: 'var(--dh-turquoise-700)' }}
                      >
                        ¿Olvidaste tu contraseña?
                      </Link>
                    </div>
                    <div className="relative">
                      <Lock
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                        style={{ color: 'var(--dh-gray-400)' }}
                      />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        disabled={emailLoading}
                        placeholder="••••••••"
                        autoComplete="current-password"
                        className="input-dh w-full pl-10 pr-10 py-3 border rounded-xl text-sm transition-all disabled:opacity-60"
                        style={{
                          borderColor: 'var(--dh-gray-100)',
                          color: 'var(--dh-ink)',
                          background: 'var(--dh-gray-50)',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2"
                        style={{ color: 'var(--dh-gray-400)' }}
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
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
                    onClick={() => {
                      setShowEmailForm(false);
                      setError('');
                    }}
                    className="w-full text-xs transition-colors"
                    style={{ color: 'var(--dh-gray-400)' }}
                  >
                    ← Volver a opciones de login
                  </button>
                </form>
              )}

              {/* Role badges */}
              <div className="mt-5 flex gap-2 justify-center">
                <span
                  className="text-xs font-semibold px-3 py-1.5 rounded-full"
                  style={{ color: 'var(--dh-turquoise-700)', background: 'var(--dh-turquoise-50)' }}
                >
                  Especialistas
                </span>
                <span
                  className="text-xs font-semibold px-3 py-1.5 rounded-full"
                  style={{ color: 'var(--dh-coral-600)', background: '#FFF5F0' }}
                >
                  Pacientes
                </span>
                <span
                  className="text-xs font-semibold px-3 py-1.5 rounded-full"
                  style={{ color: 'var(--dh-gray-600)', background: 'var(--dh-gray-50)' }}
                >
                  Admin
                </span>
              </div>

              <p className="text-center text-xs mt-4" style={{ color: 'var(--dh-gray-400)' }}>
                Si es tu primera vez con Google, se creará tu cuenta automáticamente.
              </p>
            </div>

            {/* Reviewer access block — only visible when ?review=1 */}
            {isReviewMode && <ReviewerLoginBlock />}

            <p
              className="text-center text-xs mt-5 flex items-center justify-center gap-3"
              style={{ color: 'var(--dh-gray-400)' }}
            >
              <Link href="/" className="hover:opacity-70 transition-opacity">
                ← Volver al inicio
              </Link>
              <span aria-hidden="true">·</span>
              <Link href="/terms" className="hover:opacity-70 transition-opacity">
                Términos y Condiciones
              </Link>
              <span aria-hidden="true">·</span>
              <Link href="/privacy" className="hover:opacity-70 transition-opacity">
                Privacidad
              </Link>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
