'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, Activity, ArrowRight, Lock, Mail } from 'lucide-react'
import { loginUser } from './actions'

export default function LoginPage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    startTransition(async () => {
      const result = await loginUser(email, password)
      if (!result.success) {
        setError(result.error)
        return
      }
      if (result.role === 'super_admin' || result.role === 'admin') {
        router.push('/admin')
      } else if (result.hasClinic && result.clinicRole === 'admin') {
        router.push('/clinic/admin')
      } else {
        router.push('/doctor')
      }
    })
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        * { font-family: 'Inter', sans-serif; }
        .g-bg { background: linear-gradient(135deg, #00C4CC 0%, #0891b2 50%, #0e7490 100%); }
        .g-text { background: linear-gradient(135deg, #00C4CC, #0891b2); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .card-shadow { box-shadow: 0 25px 50px -12px rgba(0,196,204,0.15), 0 10px 25px -5px rgba(0,0,0,0.08); }
        .input-focus:focus { border-color: #00C4CC; box-shadow: 0 0 0 3px rgba(0,196,204,0.15); outline: none; }
        .btn-primary { background: linear-gradient(135deg, #00C4CC 0%, #0891b2 100%); transition: all 0.2s; }
        .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 8px 20px rgba(0,196,204,0.4); }
        .btn-primary:active { transform: translateY(0); }
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
          {/* Decorative orbs */}
          <div className="float-orb absolute top-20 right-20 w-64 h-64 rounded-full bg-white/10 blur-3xl pointer-events-none" />
          <div className="float-orb-2 absolute bottom-20 left-10 w-48 h-48 rounded-full bg-cyan-300/20 blur-2xl pointer-events-none" />
          <div className="absolute top-1/3 left-1/4 w-32 h-32 rounded-full bg-white/5 blur-xl pointer-events-none" />

          {/* Logo */}
          <div className="relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
                <Activity className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-white font-bold text-lg leading-none">Delta</p>
                <p className="text-white/70 text-xs font-medium">Medical CRM</p>
              </div>
            </div>
          </div>

          {/* Main copy */}
          <div className="relative z-10 space-y-6">
            <div className="space-y-3">
              <p className="text-white/80 text-sm font-medium uppercase tracking-widest">Bienvenido de vuelta</p>
              <h1 className="text-4xl font-bold text-white leading-tight">
                Tu consulta,<br />
                más inteligente<br />
                que nunca.
              </h1>
              <p className="text-white/70 text-base max-w-sm">
                Gestiona pacientes, citas, historial clínico y finanzas desde un solo lugar.
              </p>
            </div>

            {/* Stats */}
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

          {/* Testimonial */}
          <div className="relative z-10 bg-white/10 backdrop-blur rounded-2xl p-5 border border-white/20">
            <p className="text-white/90 text-sm leading-relaxed italic">
              "Delta transformó mi consulta. Ahora tengo todo bajo control y mis pacientes están más satisfechos."
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

        {/* Right Panel — Login Form */}
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-md fade-in">

            {/* Mobile logo */}
            <div className="flex lg:hidden items-center gap-3 mb-8 justify-center">
              <div className="w-10 h-10 rounded-xl g-bg flex items-center justify-center">
                <Activity className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-bold text-lg text-slate-900 leading-none">Delta</p>
                <p className="text-slate-400 text-xs">Medical CRM</p>
              </div>
            </div>

            {/* Card */}
            <div className="bg-white rounded-2xl card-shadow p-8 border border-slate-100">
              <div className="mb-7">
                <h2 className="text-2xl font-bold text-slate-900">Iniciar sesión</h2>
                <p className="text-slate-500 text-sm mt-1">Ingresa con tus credenciales para continuar</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Correo electrónico
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      required
                      disabled={isPending}
                      placeholder="medico@ejemplo.com"
                      className="input-focus w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 bg-slate-50 transition-all disabled:opacity-60"
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-sm font-medium text-slate-700">
                      Contraseña
                    </label>
                    <button
                      type="button"
                      className="text-xs text-teal-600 hover:text-teal-700 font-medium"
                      tabIndex={-1}
                    >
                      ¿Olvidaste tu contraseña?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      disabled={isPending}
                      placeholder="••••••••"
                      className="input-focus w-full pl-10 pr-10 py-3 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 bg-slate-50 transition-all disabled:opacity-60"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Error */}
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-2">
                    <span className="text-red-500 text-lg leading-none mt-0.5">⚠</span>
                    <p className="text-red-700 text-sm">{error}</p>
                  </div>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={isPending}
                  className="btn-primary w-full py-3 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none"
                >
                  {isPending ? (
                    <>
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Verificando...
                    </>
                  ) : (
                    <>
                      Ingresar al sistema
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Register link */}
            <p className="text-center text-sm text-slate-500 mt-5">
              ¿Aún no tienes cuenta?{' '}
              <Link href="/register?plan=free" className="text-teal-600 hover:text-teal-700 font-semibold">
                Prueba gratis 30 días →
              </Link>
            </p>

            {/* Back to landing */}
            <p className="text-center text-xs text-slate-400 mt-3">
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
