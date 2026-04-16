'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { FileText, Download, Eye } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Report {
  id: string
  consultation_id: string
  diagnosis?: string
  treatment_plan?: string
  notes?: string
  created_at: string
  doctor_id: string
  doctor_name?: string
  appointment_date?: string
}

export default function ReportsPage() {
  const router = useRouter()
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadReports = async () => {
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

        // Get EHR records (reports)
        const { data: ehrData } = await supabase
          .from('ehr_records')
          .select('id, consultation_id, diagnosis, treatment_plan, notes, created_at, doctor_id')
          .in('patient_id', patientIds)
          .order('created_at', { ascending: false })

        if (ehrData) {
          // Enhance with doctor and appointment info
          const enhanced: Report[] = []
          for (const ehr of ehrData) {
            const { data: doc } = await supabase
              .from('profiles')
              .select('full_name')
              .eq('id', ehr.doctor_id)
              .single()

            const { data: apt } = await supabase
              .from('appointments')
              .select('scheduled_at')
              .eq('id', ehr.consultation_id)
              .single()

            enhanced.push({
              ...ehr,
              doctor_name: doc?.full_name,
              appointment_date: apt?.scheduled_at
            })
          }
          setReports(enhanced)
        }

        setLoading(false)
      } catch (err) {
        console.error('Error loading reports:', err)
        setLoading(false)
      }
    }

    loadReports()
  }, [router])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-teal-500 flex items-center justify-center mx-auto animate-pulse" />
          <p className="text-slate-500 font-medium">Cargando informes...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Mis Informes Médicos</h1>

      {reports.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No hay informes disponibles</p>
          <p className="text-sm text-slate-400 mt-1">Tus informes aparecerán aquí después de tus consultas</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map(report => (
            <div key={report.id} className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-0">
                <div className="space-y-1 flex-1">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-orange-50 shrink-0">
                      <FileText className="w-5 h-5 text-orange-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 text-sm sm:text-base">
                        Informe del {new Date(report.created_at).toLocaleDateString('es-VE')}
                      </p>
                      <p className="text-xs sm:text-sm text-slate-500 truncate">
                        Por Dr(a). {report.doctor_name || 'Doctor'}
                      </p>
                    </div>
                  </div>
                </div>
                <Link
                  href={`/patient/reports/${report.id}`}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-teal-50 text-teal-600 hover:bg-teal-100 transition-colors text-xs sm:text-sm font-medium w-fit"
                >
                  <Eye className="w-4 h-4" />
                  Ver
                </Link>
              </div>

              {report.diagnosis && (
                <div className="pt-3 border-t border-slate-100">
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Diagnóstico</p>
                  <p className="text-xs sm:text-sm text-slate-700">{report.diagnosis}</p>
                </div>
              )}

              {report.treatment_plan && (
                <div className="pt-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Plan de Tratamiento</p>
                  <p className="text-xs sm:text-sm text-slate-700">{report.treatment_plan}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
