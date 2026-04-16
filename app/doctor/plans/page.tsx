'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function PlansRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/doctor/settings?tab=plans')
  }, [router])
  return (
    <div className="py-12 text-center text-slate-400 text-sm">
      Redirigiendo a Configuración…
    </div>
  )
}
