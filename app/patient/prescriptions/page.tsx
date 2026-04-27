'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pill, FileText, Calendar } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

// RONDA 30: refactor — la tabla `prescriptions` guarda los medicamentos como
// JSONB en la columna `medications` (array de {name, dose, frequency, duration, indications})
// y la fecha esta en `created_at` (no `prescribed_date` que no existia).
// Antes la query rompia silenciosamente y la card mostraba campos vacios.
type Medication = {
  name?: string
  dose?: string
  frequency?: string
  duration?: string
  indications?: string
}

type PrescriptionRow = {
  id: string
  medications: Medication[] | null
  notes: string | null
  created_at: string
  doctor_id: string
  doctor_name?: string
}

export default function PrescriptionsPage() {
  const router = useRouter()
  const [prescriptions, setPrescriptions] = useState<PrescriptionRow[]>([])
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

        // Get all patient IDs (puede haber 1 por cada doctor donde se atiende)
        const { data: patients } = await supabase
          .from('patients')
          .select('id')
          .eq('auth_user_id', user.id)

        if (!patients || patients.length === 0) {
          setLoading(false)
          return
        }

        const patientIds = patients.map(p => p.id)

        // RONDA 30: usar `created_at` (la columna real), traer `medications` JSONB y `notes`
        const { data: prescData, error } = await supabase
          .from('prescriptions')
          .select('id, medications, notes, created_at, doctor_id')
          .in('patient_id', patientIds)
          .order('created_at', { ascending: false })

        if (error) {
          console.error('[prescriptions] supabase error:', error)
        }

        if (prescData && prescData.length > 0) {
          // Enhance with doctor name (1 query por receta — aceptable para volumen MVP)
          const doctorIds = [...new Set(prescData.map(p => p.doctor_id))]
          const { data: docs } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', doctorIds)
          const docMap = new Map((docs || []).map(d => [d.id, d.full_name]))

          setPrescriptions(prescData.map(p => ({
            ...p,
            medications: Array.isArray(p.medications) ? p.medications : [],
            doctor_name: docMap.get(p.doctor_id) || 'Doctor',
          })) as PrescriptionRow[])
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
          {prescriptions.map(presc => {
            const meds = presc.medications || []
            return (
              <div key={presc.id} className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 space-y-4">
                {/* Header con doctor + fecha */}
                <div className="flex items-start gap-3 pb-3 border-b border-slate-100">
                  <div className="p-2 rounded-lg bg-teal-50 shrink-0">
                    <Pill className="w-5 h-5 text-teal-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900 text-sm sm:text-base">
                      Prescrito por Dr(a). {presc.doctor_name || 'Doctor'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(presc.created_at).toLocaleDateString('es-VE', {
                        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
                      })}
                    </p>
                  </div>
                </div>

                {/* RONDA 30: lista cada medicamento del JSONB con todos sus campos */}
                {meds.length > 0 && (
                  <div className="space-y-3">
                    {meds.map((m, i) => (
                      <div key={i} className="bg-slate-50 rounded-xl p-3 sm:p-4 space-y-2">
                        <p className="font-bold text-slate-900 text-sm flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-teal-500 text-white text-[10px] font-bold flex items-center justify-center">
                            {i + 1}
                          </span>
                          {m.name || 'Medicamento'}
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs sm:text-sm">
                          {m.dose && (
                            <div>
                              <p className="text-[10px] font-semibold text-slate-500 uppercase">Dosis</p>
                              <p className="text-slate-900">{m.dose}</p>
                            </div>
                          )}
                          {m.frequency && (
                            <div>
                              <p className="text-[10px] font-semibold text-slate-500 uppercase">Frecuencia</p>
                              <p className="text-slate-900">{m.frequency}</p>
                            </div>
                          )}
                          {m.duration && (
                            <div>
                              <p className="text-[10px] font-semibold text-slate-500 uppercase">Duración</p>
                              <p className="text-slate-900">{m.duration}</p>
                            </div>
                          )}
                        </div>
                        {m.indications && (
                          <div className="pt-1.5 border-t border-slate-200">
                            <p className="text-[10px] font-semibold text-slate-500 uppercase mb-1">Indicaciones</p>
                            <p className="text-xs text-slate-600 italic">{m.indications}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Notas adicionales del doctor */}
                {presc.notes && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-[10px] font-semibold text-blue-700 uppercase mb-1 flex items-center gap-1">
                      <FileText className="w-3 h-3" /> Notas
                    </p>
                    <p className="text-xs text-blue-900">{presc.notes}</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
