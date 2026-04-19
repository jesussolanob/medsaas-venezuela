'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Activity, AlertCircle, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
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

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <LoginInner />
    </Suspense>
  )
}

function LoginInner() {
  const searchParams = useSearchParams()
  const authError = searchParams.get('error')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(authError === 'auth' ? 'Error de autenticación. Intenta de nuevo.' : '')

  async function handleGoogleLogin() {
    setLoading(true)
    setError('')
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      if (error) {
        setError(error.message)
        setLoading(false)
      }
    } catch (err: any) {
      setError(err?.message || 'Error al conectar con Google')
      setLoading(false)
    }
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        * { font-family: 'Inter', sans-serif; }
        .g-bg { background: linear-gradient(135deg, #00C4CC 0%, #0891b2 50%, #0e7490 100%); }
        .card-shadow { box-shadow: 0 25px 50px -12px rgba(0,196,204,0.15), 0 10px 25px -5px rgba(0,0,0,0.08); }
        .btn-google { transition: all 0.2s; }
        .btn-google:hover { transform: translateY(-1px); box-shadow: 0 8px 25px rgba(0,0,0,0.12); }
        .btn-google:active { transform: translateY(0); }
        .float-orb { animation: float 6s ease-in-out infinite; }
        .float-orb-2 { animation: float 8s ease-in-out infinite reverse; }
        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-20px) rotate(5deg); }
        }
        .fade-in { animation: fadeIn 0.5s ease forwards; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      <div className="min-h-screen bg-slate-50 flex">
        {/* Left Panel — Branding */}
        <div className="hidden lg:flex lg:w-1/2 g-bg relative overflow-hidden flex-col justify-between p-12">
          <div className="float-orb absolute top-20 right-20 w-64 h-64 rounded-full bg-white/10 blur-3xl pointer-events-none" />
          <div className="float-orb-2 absolute bottom-20 left-10 w-48 h-48 rounded-full bg-cyan-300/20 blur-2xl pointer-events-none" />

          <div className="relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
                <Activity className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-white font-bold text-lg leading-none">Delta</p>
                <p className="text-white/70 text-xs font-medium">Health Tech</p>
              </div>
            </div>
          </div>

          <div className="relative z-10 space-y-6">
            <div className="space-y-3">
              <p className="text-white/80 text-sm font-medium uppercase tracking-widest">Bienvenido</p>
              <h1 className="text-4xl font-bold text-white leading-tight">
                Tu consulta,<br />
                más inteligente<br />
                que nunca.
              </h1>
              <p className="text-white/70 text-base max-w-sm">
                Gestiona pacientes, citas, historial clínico y finanzas desde un solo lugar.
              </p>
            </div>

            <div className="flex gap-8 pt-4">
              <div>
                <p className="text-white text-2xl font-bold">+120</p>
                <p className="text-white/60 text-xs">Médicos activos</p>
              </div>
              <div>
                <p className="text-white text-2xl font-bold">98%</p>
                <p className="text-white/60 text-xs">Satisfacción</p>
              </div>
              <div>
                <p className="text-white text-2xl font-bold">4.9★</p>
                <p className="text-white/60 text-xs">Valoración</p>
              </div>
            </div>
          </div>

          <div className="relative z-10 bg-white/10 backdrop-blur rounded-2xl p-5 border border-white/20">
            <p className="text-white/90 text-sm leading-relaxed italic">
              &ldquo;Delta transformó mi consulta. Ahora tengo todo bajo control y mis pacientes están más satisfechos.&rdquo;
            </p>
            <div className="flex items-center gap-3 mt-3">
              <div className="w-8 h-8 rounded-full bg-white/30 flex items-center justify-center text-white font-semibold text-sm">
                CM
              </div>
              <div>
                <p className="text-white text-xs font-semibold">Dr. Carlos Méndez</p>
                <p className="text-white/60 text-xs">Cardiólogo · Caracas</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel — Google Login */}
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-md fade-in">

            {/* Mobile logo */}
            <div className="flex lg:hidden items-center gap-3 mb-8 justify-center">
              <div className="w-10 h-10 rounded-xl g-bg flex items-center justify-center">
                <Activity className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-bold text-lg text-slate-900 leading-none">Delta</p>
                <p className="text-slate-400 text-xs">Health Tech</p>
              </div>
            </div>

            {/* Card */}
            <div className="bg-white rounded-2xl card-shadow p-8 border border-slate-100">
              <div className="mb-8 text-center">
                <h2 className="text-2xl font-bold text-slate-900">Bienvenido a Delta</h2>
                <p className="text-slate-500 text-sm mt-2">
                  Inicia sesión o crea tu cuenta con Google
                </p>
              </div>

              {error && (
                <div className="mb-6 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-red-700 text-sm">{error}</p>
                </div>
              )}

              <button
                onClick={handleGoogleLogin}
                disabled={loading}
                className="btn-google w-full flex items-center justify-center gap-3 py-3.5 px-4 rounded-xl border-2 border-slate-200 bg-white text-slate-700 font-semibold text-sm hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                    Conectando con Google...
                  </>
                ) : (
                  <>
                    <GoogleIcon className="w-5 h-5" />
                    Continuar con Google
                  </>
                )}
              </button>

              <div className="mt-6 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-slate-200" />
                  <span className="text-xs text-slate-400 font-medium">Acceso para</span>
                  <div className="flex-1 h-px bg-slate-200" />
                </div>
                <div className="flex gap-2 justify-center">
                  <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full">Médicos</span>
                  <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full">Pacientes</span>
                  <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full">Admin</span>
                </div>
              </div>

              <p className="text-center text-xs text-slate-400 mt-6">
                Si es tu primera vez, se creará tu cuenta automáticamente y completarás tu perfil después.
              </p>
            </div>

            <p className="text-center text-xs text-slate-400 mt-5">
              <Link href="/" className="hover:text-slate-600 transition-colors">
                ← Volver al inicio
              </Link>
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
