'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * /doctor/plans está DEPRECATED en beta privada.
 * Los planes de consulta (tarifas) ahora se gestionan desde /doctor/services.
 * Las suscripciones del SaaS ya no requieren subir comprobantes (beta gratuita).
 */
export default function DoctorPlansRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/doctor/services') }, [router])
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <p className="text-sm text-slate-500">Redirigiendo a tus Servicios…</p>
    </div>
  )
}
