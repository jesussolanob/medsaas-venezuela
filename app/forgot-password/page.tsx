'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Mail, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) {
      setError('Ingresa tu email')
      return
    }
    setLoading(true)
    setError('')

    try {
      const supabase = createClient()
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      })

      if (error) {
        // No exponemos si el email existe o no — anti-enumeración
        console.warn('[forgot-password]', error.message)
      }

      // Siempre mostramos éxito por seguridad (anti email enumeration)
      setSent(true)
    } catch {
      // Igual: no fallar visiblemente
      setSent(true)
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
          <Link
            href="/login"
            className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Volver al login
          </Link>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm">
            {sent ? (
              <div className="text-center space-y-4">
                <div className="mx-auto w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
                  <CheckCircle2 className="w-7 h-7 text-emerald-600" />
                </div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Revisa tu correo</h1>
                <p className="text-sm text-slate-600">
                  Si <strong>{email}</strong> está registrado en Delta Medical CRM, te enviamos un enlace
                  para restablecer tu contraseña. Llega en menos de 2 minutos.
                </p>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-left text-xs text-slate-500 space-y-1.5">
                  <p>📬 <strong>Revisa también la carpeta de spam.</strong></p>
                  <p>⏱ El enlace vence en 1 hora por seguridad.</p>
                  <p>🔁 Si no llega, podés intentar de nuevo en 60 segundos.</p>
                </div>
                <button
                  onClick={() => { setSent(false); setEmail('') }}
                  className="text-sm font-semibold text-teal-600 hover:text-teal-700"
                >
                  Probar con otro email
                </button>
              </div>
            ) : (
              <>
                <div className="mb-6">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-400 to-cyan-600 flex items-center justify-center mb-4">
                    <Mail className="w-6 h-6 text-white" />
                  </div>
                  <h1 className="text-xl sm:text-2xl font-bold text-slate-900">¿Olvidaste tu contraseña?</h1>
                  <p className="text-sm text-slate-500 mt-1">
                    Ingresa tu email y te enviamos un enlace para restablecerla.
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
                      Email
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="tucorreo@ejemplo.com"
                      autoComplete="email"
                      autoFocus
                      required
                      className="mt-1.5 w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 bg-slate-900 text-white rounded-xl font-bold text-sm hover:bg-teal-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                    {loading ? 'Enviando...' : 'Enviar enlace de restablecimiento'}
                  </button>
                </form>

                <div className="mt-6 pt-5 border-t border-slate-100 text-center">
                  <p className="text-xs text-slate-500">
                    ¿Recordaste tu contraseña?{' '}
                    <Link href="/login" className="font-semibold text-teal-600 hover:text-teal-700">
                      Inicia sesión
                    </Link>
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
