'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

/* Delta Isotipo — Lazo Abierto */
function DeltaIsotipo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none">
      <path d="M125 40 C75 25, 25 65, 30 120 C35 165, 75 190, 120 175" stroke="#06B6D4" strokeWidth="26" strokeLinecap="round" fill="none"/>
      <path d="M145 155 C170 120, 170 70, 140 45" stroke="#FF8A65" strokeWidth="26" strokeLinecap="round" fill="none"/>
    </svg>
  )
}

// Patient login now redirects to unified login
export default function PatientLoginPage() {
  const router = useRouter()

  useEffect(() => {
    router.push('/login')
  }, [router])

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        .patient-redirect * { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; }
      `}</style>
      <div className="patient-redirect min-h-screen flex items-center justify-center px-6 py-12" style={{ background: '#FAFBFC' }}>
        <div className="w-full max-w-md text-center space-y-6">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <DeltaIsotipo size={38} />
            <div className="text-left">
              <span className="font-extrabold text-lg" style={{ color: '#0F1A2A' }}>
                Delta<span style={{ color: '#06B6D4' }}>.</span>
              </span>
              <span className="text-[10px] font-medium tracking-[0.12em] uppercase block" style={{ color: '#97A3AF' }}>
                Health Tech
              </span>
            </div>
          </Link>

          <p className="text-sm" style={{ color: '#5A6773' }}>Redirigiendo al login unificado...</p>

          <Link href="/login" className="inline-flex items-center gap-2 text-sm font-semibold" style={{ color: '#06B6D4' }}>
            Ir al login <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </>
  )
}
