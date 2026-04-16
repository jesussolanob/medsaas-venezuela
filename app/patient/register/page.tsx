'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Activity, ArrowRight, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function PatientRegisterPage() {
  const [form, setForm] = useState({
    full_name: '',
    cedula: '',
    phone: '',
    email: '',
    password: '',
    passwordConfirm: '',
  })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (form.password !== form.passwordConfirm) {
      setError('Las contraseñas no coinciden')
      return
    }

    if (form.password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres')
      return
    }

    setLoading(true)

    try {
      const supabase = createClient()
      const { data, error: authErr } = await supabase.auth.signUp({
        email: form.email.trim(),
        password: form.password.trim(),
        options: {
          data: {
            full_name: form.full_name.trim(),
            cedula: form.cedula.trim(),
            phone: form.phone.trim(),
            role: 'patient',
          },
        },
      })

      if (authErr || !data.user) {
        setError(authErr?.message || 'Error al registrarse')
        setLoading(false)
        return
      }

      setSuccess(true)
      // Auto-redirect to dashboard after 3 seconds
      setTimeout(() => {
        router.push('/patient/dashboard')
      }, 3000)
    } catch (err: any) {
      setError(err?.message || 'Error inesperado')
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-slate-900">¡Cuenta creada!</h2>
            <p className="text-sm text-slate-600">
              Tu cuenta ha sido creada exitosamente. Redireccionando a tu dashboard...
            </p>
            <p className="text-xs text-slate-400">Si no se redirige automáticamente,</p>
            <Link href="/patient/dashboard" className="inline-block text-teal-600 font-semibold hover:text-teal-700">
              haz clic aquí
            </Link>
          </div>
        </div>
      </div>
    )
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
          <h1 className="text-3xl font-extrabold text-slate-900">Crear cuenta</h1>
          <p className="text-slate-500">Únete como paciente</p>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-8 space-y-6">
          {error && (
            <div className="flex gap-3 p-4 rounded-xl bg-red-50 border border-red-200">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">
                Nombre completo
              </label>
              <input
                type="text"
                value={form.full_name}
                onChange={(e) => setForm(p => ({ ...p, full_name: e.target.value }))}
                placeholder="María González"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">
                Cédula de Identidad
              </label>
              <input
                type="text"
                value={form.cedula}
                onChange={(e) => setForm(p => ({ ...p, cedula: e.target.value }))}
                placeholder="V-12345678"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">
                Teléfono
              </label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm(p => ({ ...p, phone: e.target.value }))}
                placeholder="+58 412 1234567"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">
                Email
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))}
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
                value={form.password}
                onChange={(e) => setForm(p => ({ ...p, password: e.target.value }))}
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-900 mb-2">
                Confirmar contraseña
              </label>
              <input
                type="password"
                value={form.passwordConfirm}
                onChange={(e) => setForm(p => ({ ...p, passwordConfirm: e.target.value }))}
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
              {loading ? 'Creando...' : 'Crear cuenta'}
              {!loading && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>

          <div className="pt-6 border-t border-slate-100">
            <p className="text-center text-sm text-slate-500">
              ¿Ya tienes cuenta?{' '}
              <Link href="/patient/login" className="font-semibold text-teal-500 hover:text-teal-600 transition-colors">
                Inicia sesión
              </Link>
            </p>
          </div>
        </div>

        {/* Footer note */}
        <p className="text-center text-xs text-slate-400">
          Para agendar citas, necesitarás un link de booking de tu doctor
        </p>
      </div>
    </div>
  )
}
