'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Lock, Eye, EyeOff, Loader2, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [hasValidSession, setHasValidSession] = useState<boolean | null>(null)

  // Cuando el usuario clickea el link del email, Supabase Auth abre la página
  // con un fragment `#access_token=...&type=recovery` que el client SDK detecta
  // automáticamente y crea una session temporal. Verificamos que sea válida.
  useEffect(() => {
    const supabase = createClient()
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setHasValidSession(!!session)
    }
    checkSession()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres')
      return
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden')
      return
    }
    setLoading(true)
    setError('')

    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error

      setSuccess(true)
      setTimeout(() => router.push('/login'), 3000)
    } catch (err: any) {
      setError(err.message || 'Error al actualizar la contraseña')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');
        .reset-root * { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; }
      `}</style>

      <div className="reset-root min-h-screen flex items-center justify-center p-4 sm:p-6" style={{ background: '#FAFBFC' }}>
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm">
            {success ? (
              <div className="text-center space-y-4">
                <div className="mx-auto w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
                  <CheckCircle2 className="w-7 h-7 text-emerald-600" />
                </div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Contraseña actualizada</h1>
                <p className="text-sm text-slate-600">
                  Te redirigimos al login en 3 segundos para que entres con tu nueva contraseña.
                </p>
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl font-bold text-sm hover:bg-teal-700"
                >
                  Ir al login <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            ) : hasValidSession === false ? (
              <div className="text-center space-y-4">
                <div className="mx-auto w-14 h-14 rounded-full bg-red-100 flex items-center justify-center">
                  <AlertCircle className="w-7 h-7 text-red-600" />
                </div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Enlace inválido o vencido</h1>
                <p className="text-sm text-slate-600">
                  El enlace para restablecer tu contraseña no es válido o ya expiró. Solicita uno nuevo.
                </p>
                <Link
                  href="/forgot-password"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-500 text-white rounded-xl font-bold text-sm hover:bg-teal-600"
                >
                  Solicitar nuevo enlace
                </Link>
              </div>
            ) : hasValidSession === null ? (
              <div className="py-12 text-center">
                <Loader2 className="w-7 h-7 animate-spin text-slate-300 mx-auto" />
              </div>
            ) : (
              <>
                <div className="mb-6">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-400 to-cyan-600 flex items-center justify-center mb-4">
                    <Lock className="w-6 h-6 text-white" />
                  </div>
                  <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Crea tu nueva contraseña</h1>
                  <p className="text-sm text-slate-500 mt-1">
                    Mínimo 8 caracteres. Recomendado: una mezcla de letras, números y símbolos.
                  </p>
                </div>

                {error && (
                  <div className="mb-4 rounded-xl px-3 py-2.5 flex items-start gap-2 bg-red-50 border border-red-200">
                    <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Nueva contraseña
                    </label>
                    <div className="mt-1.5 relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="••••••••"
                        autoComplete="new-password"
                        autoFocus
                        required
                        minLength={8}
                        className="w-full px-3 py-2.5 pr-10 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(s => !s)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Confirmar contraseña
                    </label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      required
                      minLength={8}
                      className="mt-1.5 w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 bg-slate-900 text-white rounded-xl font-bold text-sm hover:bg-teal-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                    {loading ? 'Actualizando...' : 'Actualizar contraseña'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
