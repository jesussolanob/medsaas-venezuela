'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Activity, ArrowRight, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function PatientLoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const supabase = createClient()
      const { data, error: authErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password.trim(),
      })

      if (authErr || !data.user) {
        setError(authErr?.message || 'Email o contraseña no válidos')
        setLoading(false)
        return
      }

      router.push('/patient/dashboard')
    } catch (err: any) {
      setError(err?.message || 'Error al iniciar sesión')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <Link href="/" className="inline-flex items-center gap-2.5 group">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg bg-teal-500">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-bold text-lg text-slate-900">Delta</span>
              <span className="text-[10px] text-slate-400 block font-semibold">Medical CRM</span>
            </div>
          </Link>
          <h1 className="text-3xl font-extrabold text-slate-900">Mi sesión de paciente</h1>
          <p className="text-slate-500">Accede a tus citas, informes y recetas</p>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-8 space-y-6">
          {error && (
            <div className="flex gap-3 p-4 rounded-xl bg-red-50 border border-red-200">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">
                Contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl font-semibold text-white transition-all hover:opacity-90 active:scale-95 flex items-center justify-center gap-2 bg-gradient-to-r from-teal-500 to-cyan-500 disabled:opacity-50"
            >
              {loading ? 'Verificando...' : 'Entrar'}
              {!loading && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>

          <div className="pt-6 border-t border-slate-100 space-y-4">
            <p className="text-center text-sm text-slate-500">
              ¿No tienes cuenta?{' '}
              <Link href="/patient/register" className="font-semibold text-teal-500 hover:text-teal-600 transition-colors">
                Regístrate aquí
              </Link>
            </p>
            <p className="text-center text-sm text-slate-500">
              ¿Eres doctor?{' '}
              <Link href="/login" className="font-semibold text-teal-500 hover:text-teal-600 transition-colors">
                Ir a login de doctor
              </Link>
            </p>
          </div>
        </div>

        {/* Footer note */}
        <p className="text-center text-xs text-slate-400">
          Para agendar citas, necesitas un link de booking de tu doctor
        </p>
      </div>
    </div>
  )
}
