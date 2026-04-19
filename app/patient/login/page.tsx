'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Activity, ArrowRight } from 'lucide-react'

// Patient login now redirects to unified login
export default function PatientLoginPage() {
  const router = useRouter()

  useEffect(() => {
    router.push('/login')
  }, [router])

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md text-center space-y-6">
        <Link href="/" className="inline-flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-teal-500">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <div className="text-left">
            <span className="font-bold text-lg text-slate-900">Delta</span>
            <span className="text-[10px] text-slate-400 block font-semibold">Health Tech</span>
          </div>
        </Link>

        <p className="text-slate-500 text-sm">Redirigiendo al login unificado...</p>

        <Link href="/login" className="inline-flex items-center gap-2 text-teal-500 font-semibold text-sm hover:text-teal-600">
          Ir al login <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
