'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pill } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Prescription {
  id: string
  medication_name: string
  dosage?: string
  frequency?: string
  duration?: string
  prescribed_date: string
  doctor_id: string
  doctor_name?: string
}

export default function PrescriptionsPage() {
  const router = useRouter()
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadPrescriptions = async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          router.push('/patient/login')
          return
        }

        // Get all patient IDs
        const { data: patients } = await supabase
          .from('patients')
          .select('id')
          .eq('auth_user_id', user.id)

        if (!patients || patients.length === 0) {
          setLoading(false)
          return
        }

        const patientIds = patients.map(p => p.id)

        // Get prescriptions
        const { data: prescData } = await supabase
          .from('prescriptions')
          .select('*')
          .in('patient_id', patientIds)
          .order('prescribed_date', { ascending: false })

        if (prescData) {
          // Enhance with doctor info
          const enhanced: Prescription[] = []
          for (const presc of prescData) {
            const { data: doc } = await supabase
              .from('profiles')
              .select('full_name')
              .eq('id', presc.doctor_id)
              .single()

            enhanced.push({
              ...presc,
              doctor_name: doc?.full_name
            })
          }
          setPrescriptions(enhanced)
        }

        setLoading(false)
      } catch (err) {
        console.error('Error loading prescriptions:', err)
        setLoading(false)
      }
    }

    loadPrescriptions()
  }, [router])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-teal-500 flex items-center justify-center mx-auto animate-pulse" />
          <p className="text-slate-500 font-medium">Cargando recetas...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Mis Recetas</h1>

      {prescriptions.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
          <Pill className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No tienes recetas registradas</p>
          <p className="text-sm text-slate-400 mt-1">Tus medicamentos aparecerán aquí</p>
        </div>
      ) : (
        <div className="space-y-3">
          {prescriptions.map(presc => (
            <div key={presc.id} className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-teal-50 shrink-0">
                      <Pill className="w-5 h-5 text-teal-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 text-sm sm:text-base truncate">{presc.medication_name}</p>
                      <p className="text-xs text-slate-500 mt-1 truncate">
                        Prescrito por Dr(a). {presc.doctor_name || 'Doctor'} · {new Date(presc.prescribed_date).toLocaleDateString('es-VE')}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 text-xs sm:text-sm">
                {presc.dosage && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Dosis</p>
                    <p className="text-slate-900">{presc.dosage}</p>
                  </div>
                )}
                {presc.frequency && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Frecuencia</p>
                    <p className="text-slate-900">{presc.frequency}</p>
                  </div>
                )}
                {presc.duration && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Duración</p>
                    <p className="text-slate-900">{presc.duration}</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
