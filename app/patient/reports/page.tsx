'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, ChevronDown, ChevronUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

// RONDA 30: incluir medications de la tabla prescriptions vinculadas por consultation_id
type Medication = { name?: string; dose?: string; frequency?: string; duration?: string; indications?: string }

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
  medications: Medication[]
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
          // RONDA 30: traer doctores Y prescriptions de cada consulta en bulk
          const consultationIds = consultationData.map(c => c.id)
          const doctorIds = [...new Set(consultationData.map(c => c.doctor_id))]

          const [doctorsRes, prescriptionsRes] = await Promise.all([
            supabase.from('profiles').select('id, full_name, specialty, professional_title').in('id', doctorIds),
            supabase.from('prescriptions').select('consultation_id, medications').in('consultation_id', consultationIds),
          ])

          const doctorMap = new Map((doctorsRes.data || []).map(d => [d.id, d]))
          // Una consulta puede tener varias recetas (receta principal + examenes etc.)
          // Aqui solo nos interesan los medicamentos con nombre, no los examenes.
          const prescriptionsByConsult = new Map<string, Medication[]>()
          for (const p of (prescriptionsRes.data || [])) {
            const meds = (Array.isArray(p.medications) ? p.medications : []) as Medication[]
            // Filtrar solo los que tienen NAME y NO son examenes (los examenes guardan nombre del examen, no medicamento)
            const realMeds = meds.filter(m => m.name && m.name.trim().length > 0)
            if (realMeds.length === 0) continue
            const existing = prescriptionsByConsult.get(p.consultation_id) || []
            prescriptionsByConsult.set(p.consultation_id, [...existing, ...realMeds])
          }

          const enhanced: Report[] = consultationData.map(c => {
            const doctor = doctorMap.get(c.doctor_id)
            return {
              id: c.id,
              consultation_code: c.consultation_code,
              consultation_date: c.consultation_date,
              chief_complaint: c.chief_complaint,
              notes: c.notes,
              diagnosis: c.diagnosis,
              treatment: c.treatment,
              doctor_id: c.doctor_id,
              doctor_name: doctor?.full_name || 'Doctor',
              doctor_specialty: doctor?.specialty || null,
              doctor_title: doctor?.professional_title || null,
              medications: prescriptionsByConsult.get(c.id) || [],
            }
          })
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

                  {/* Plan de Tratamiento — texto libre del informe */}
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

                  {/* RONDA 30 — Medicamentos recetados con NOMBRE + dosis + frecuencia.
                      Antes el paciente solo veia "50mg 2 veces..." porque el doctor escribia
                      la dosis en el campo `treatment` y el nombre quedaba en otra tabla. */}
                  {report.medications.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                        Medicamentos recetados ({report.medications.length})
                      </p>
                      <div className="space-y-2">
                        {report.medications.map((m, i) => (
                          <div key={i} className="bg-teal-50 border border-teal-200 rounded-lg p-3">
                            <p className="font-bold text-sm text-teal-900 flex items-center gap-1.5">
                              <span className="w-5 h-5 rounded-full bg-teal-500 text-white text-[10px] font-bold flex items-center justify-center">{i + 1}</span>
                              {m.name}
                            </p>
                            <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 ml-6.5 text-xs text-teal-800">
                              {m.dose && <span><strong>Dosis:</strong> {m.dose}</span>}
                              {m.frequency && <span><strong>Frecuencia:</strong> {m.frequency}</span>}
                              {m.duration && <span><strong>Duración:</strong> {m.duration}</span>}
                            </div>
                            {m.indications && (
                              <p className="text-xs text-teal-700 italic mt-1.5 ml-6">{m.indications}</p>
                            )}
                          </div>
                        ))}
                      </div>
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
