'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, ChevronDown, ChevronUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Report {
  id: string
  consultation_code: string
  consultation_date: string
  chief_complaint: string | null
  notes: string | null
  diagnosis: string | null
  treatment: string | null
  doctor_id: string
  doctor_name: string
  doctor_specialty: string | null
  doctor_title: string | null
}

export default function ReportsPage() {
  const router = useRouter()
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    const loadReports = async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          router.push('/patient/login')
          return
        }

        // Get all patients for this auth user
        const { data: patients } = await supabase
          .from('patients')
          .select('id')
          .eq('auth_user_id', user.id)

        if (!patients || patients.length === 0) {
          setLoading(false)
          return
        }

        const patientIds = patients.map(p => p.id)

        // Get consultations with content for these patients
        const { data: consultationData } = await supabase
          .from('consultations')
          .select('id, consultation_code, consultation_date, chief_complaint, notes, diagnosis, treatment, doctor_id, patient_id')
          .in('patient_id', patientIds)
          .or(`notes.not.is.null,diagnosis.not.is.null,treatment.not.is.null`)
          .order('consultation_date', { ascending: false })

        if (consultationData && consultationData.length > 0) {
          // Enhance with doctor info
          const enhanced: Report[] = []
          for (const consultation of consultationData) {
            const { data: doctor } = await supabase
              .from('profiles')
              .select('full_name, specialty, professional_title')
              .eq('id', consultation.doctor_id)
              .single()

            enhanced.push({
              id: consultation.id,
              consultation_code: consultation.consultation_code,
              consultation_date: consultation.consultation_date,
              chief_complaint: consultation.chief_complaint,
              notes: consultation.notes,
              diagnosis: consultation.diagnosis,
              treatment: consultation.treatment,
              doctor_id: consultation.doctor_id,
              doctor_name: doctor?.full_name || 'Doctor',
              doctor_specialty: doctor?.specialty || null,
              doctor_title: doctor?.professional_title || null,
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

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id)
  }

  const getTextPreview = (text: string | null, maxLength: number = 150): string => {
    if (!text) return ''
    // Strip HTML tags for preview
    const plainText = text.replace(/<[^>]*>/g, '').trim()
    if (plainText.length > maxLength) {
      return plainText.substring(0, maxLength) + '...'
    }
    return plainText
  }

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
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No hay informes disponibles</p>
          <p className="text-sm text-slate-400 mt-1">Tus informes aparecerán aquí después de tus consultas</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map(report => (
            <div
              key={report.id}
              className="bg-white rounded-xl border border-slate-200 overflow-hidden transition-all hover:border-slate-300"
            >
              {/* Header - Always visible */}
              <button
                onClick={() => toggleExpand(report.id)}
                className="w-full px-4 sm:px-6 py-4 sm:py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 hover:bg-slate-50 transition-colors text-left"
              >
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="p-2 rounded-lg bg-teal-50 shrink-0">
                    <FileText className="w-5 h-5 text-teal-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 mb-1">
                      <p className="font-semibold text-slate-900 text-sm sm:text-base">
                        {report.consultation_code}
                      </p>
                      <p className="text-xs sm:text-sm text-slate-500">
                        {new Date(report.consultation_date).toLocaleDateString('es-VE')}
                      </p>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-600">
                      Dr(a). {report.doctor_name}
                      {report.doctor_title && ` - ${report.doctor_title}`}
                      {report.doctor_specialty && ` (${report.doctor_specialty})`}
                    </p>
                    {report.chief_complaint && (
                      <p className="text-xs text-slate-500 mt-1 line-clamp-1">
                        Motivo: {report.chief_complaint}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs sm:text-sm text-slate-500">
                    {expandedId === report.id ? 'Ver menos' : 'Ver más'}
                  </span>
                  <div className="text-teal-600">
                    {expandedId === report.id ? (
                      <ChevronUp className="w-5 h-5" />
                    ) : (
                      <ChevronDown className="w-5 h-5" />
                    )}
                  </div>
                </div>
              </button>

              {/* Expanded Content */}
              {expandedId === report.id && (
                <div className="border-t border-slate-200 px-4 sm:px-6 py-4 sm:py-5 space-y-4">
                  {/* Chief Complaint */}
                  {report.chief_complaint && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                        Motivo de la Consulta
                      </p>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap">
                        {report.chief_complaint}
                      </p>
                    </div>
                  )}

                  {/* Notes / Informe */}
                  {report.notes && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                        Informe Médico
                      </p>
                      <div
                        className="text-sm text-slate-700 prose prose-sm max-w-none bg-slate-50 rounded-lg p-3 sm:p-4"
                        dangerouslySetInnerHTML={{ __html: report.notes }}
                      />
                    </div>
                  )}

                  {/* Diagnosis */}
                  {report.diagnosis && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                        Diagnóstico
                      </p>
                      <div
                        className="text-sm text-slate-700 prose prose-sm max-w-none bg-slate-50 rounded-lg p-3 sm:p-4"
                        dangerouslySetInnerHTML={{ __html: report.diagnosis }}
                      />
                    </div>
                  )}

                  {/* Treatment Plan */}
                  {report.treatment && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                        Plan de Tratamiento
                      </p>
                      <div
                        className="text-sm text-slate-700 prose prose-sm max-w-none bg-slate-50 rounded-lg p-3 sm:p-4"
                        dangerouslySetInnerHTML={{ __html: report.treatment }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
