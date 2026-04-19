'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Activity, ArrowRight, Stethoscope } from 'lucide-react'

export default function RegisterPage() {
  const router = useRouter()

  // Auto-redirect to login after 5 seconds
  useEffect(() => {
    const timer = setTimeout(() => router.push('/login'), 5000)
    return () => clearTimeout(timer)
  }, [router])

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-6 py-12" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');.g-bg{background:linear-gradient(135deg,#00C4CC 0%,#0891b2 100%)}`}</style>

      <div className="w-full max-w-md text-center space-y-8">
        <Link href="/" className="inline-flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center g-bg">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <div className="text-left">
            <span className="font-bold text-lg text-slate-900">Delta</span>
            <span className="text-[10px] text-slate-400 block font-semibold">Health Tech</span>
          </div>
        </Link>

        <div className="bg-white rounded-2xl border border-slate-200 p-8 space-y-6">
          <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center g-bg">
            <Stethoscope className="w-8 h-8 text-white" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-extrabold text-slate-900">Registro con Google</h1>
            <p className="text-slate-500 text-sm">
              Ahora puedes crear tu cuenta en Delta con un solo click usando tu cuenta de Google. Es más rápido y seguro.
            </p>
          </div>

          <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 text-left space-y-2">
            <p className="text-xs font-bold text-teal-700 uppercase tracking-wide">Cómo funciona</p>
            <ol className="text-sm text-teal-800 space-y-1.5">
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-teal-500 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">1</span>
                Inicia sesión con Google
              </li>
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-teal-500 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">2</span>
                Completa tu teléfono y datos profesionales
              </li>
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-teal-500 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">3</span>
                Accede a todas las funcionalidades de Delta
              </li>
            </ol>
          </div>

          <Link
            href="/login"
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-white font-bold text-sm transition-all hover:opacity-90 g-bg"
          >
            Ir a iniciar sesión con Google <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <p className="text-xs text-slate-400">Serás redirigido automáticamente en unos segundos...</p>
      </div>
    </div>
  )
}
