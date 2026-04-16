'use client'

import { useState, useEffect } from 'react'
import { FileText, Search, User, Calendar, ChevronRight, ArrowLeft, Stethoscope, Pill, ClipboardList, DollarSign, AlertCircle, Image as ImageIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type Patient = {
  id: string
  full_name: string
  phone: string | null
  age: number | null
  sex: string | null
  id_number: string | null
  created_at: string
}

type Consultation = {
  id: string
  consultation_code: string
  consultation_date: string
  chief_complaint: string | null
  notes: string | null
  diagnosis: string | null
  treatment: string | null
  payment_status: string
}

type Prescription = {
  id: string
  patient_id: string
  medication: string
  dosage: string
  frequency: string
  duration: string
  created_at: string
}

type EHRTab = 'consultations' | 'reports' | 'prescriptions' | 'photos'

export default function EHRPage() {
  const [patients, setPatients] = useState<Patient[]>([])
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)
  const [consultations, setConsultations] = useState<Consultation[]>([])
  const [selectedConsultation, setSelectedConsultation] = useState<Consultation | null>(null)
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingConsults, setLoadingConsults] = useState(false)
  const [doctorId, setDoctorId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<EHRTab>('consultations')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      setDoctorId(user.id)
      // Only fetch patients with at least one consultation (INNER JOIN via filter)
      const { data: consultations } = await supabase
        .from('consultations')
        .select('patient_id')
        .eq('doctor_id', user.id)

      const patientIds = Array.from(new Set((consultations ?? []).map(c => c.patient_id)))

      if (patientIds.length === 0) {
        setPatients([])
      } else {
        const { data } = await supabase
          .from('patients')
          .select('id, full_name, phone, age, sex, id_number, created_at')
          .in('id', patientIds)
          .order('full_name')
        setPatients((data ?? []) as Patient[])
      }
      setLoading(false)
    })
  }, [])

  async function loadConsultations(patient: Patient) {
    setSelectedPatient(patient)
    setSelectedConsultation(null)
    setActiveTab('consultations')
    setLoadingConsults(true)
    const supabase = createClient()
    try {
      const { data } = await supabase
        .from('consultations')
        .select('id, consultation_code, consultation_date, chief_complaint, notes, diagnosis, treatment, payment_status')
        .eq('patient_id', patient.id)
        .order('consultation_date', { ascending: false })
      setConsultations((data ?? []) as Consultation[])
    } catch { /* ignore */ }

    // Load prescriptions
    try {
      const { data } = await supabase
        .from('prescriptions')
        .select('*')
        .eq('patient_id', patient.id)
        .order('created_at', { ascending: false })
      setPrescriptions((data ?? []) as Prescription[])
    } catch { /* ignore */ }

    setLoadingConsults(false)
  }

  const filtered = patients.filter(p =>
    !search || p.full_name.toLowerCase().includes(search.toLowerCase()) || (p.phone ?? '').includes(search) || (p.id_number ?? '').includes(search)
  )

  const statusBadge = (status: string) => {
    if (status === 'approved') return <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Pagado</span>
    if (status === 'pending_approval') return <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Pendiente</span>
    return <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">Sin pago</span>
  }

  // ── Vista 3: Detalle de consulta ──
  if (selectedConsultation) {
    return (
      <>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');* { font-family: 'Inter', sans-serif; }.g-bg{background:linear-gradient(135deg,#00C4CC 0%,#0891b2 100%)}`}</style>
        <div className="max-w-2xl space-y-5">
          <div className="flex items-center gap-3">
            <button onClick={() => setSelectedConsultation(null)} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800">
              <ArrowLeft className="w-4 h-4" /> Volver al historial
            </button>
          </div>

          <div className="g-bg rounded-xl p-5 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-white/60 uppercase tracking-widest">Consulta</p>
                <p className="font-mono text-lg font-bold mt-0.5">{selectedConsultation.consultation_code}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-white/60">Fecha</p>
                <p className="text-sm font-semibold">{new Date(selectedConsultation.consultation_date).toLocaleDateString('es-VE', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-white/20 flex items-center gap-2">
              <User className="w-3.5 h-3.5 text-white/60" />
              <span className="text-sm">{selectedPatient?.full_name}</span>
              <span className="ml-auto">{statusBadge(selectedConsultation.payment_status)}</span>
            </div>
          </div>

          {[
            { icon: AlertCircle, label: 'Motivo de consulta', value: selectedConsultation.chief_complaint, color: 'text-blue-600', bg: 'bg-blue-50' },
            { icon: ClipboardList, label: 'Notas clínicas', value: selectedConsultation.notes, color: 'text-slate-600', bg: 'bg-slate-50' },
            { icon: Stethoscope, label: 'Diagnóstico', value: selectedConsultation.diagnosis, color: 'text-teal-600', bg: 'bg-teal-50' },
            { icon: Pill, label: 'Tratamiento', value: selectedConsultation.treatment, color: 'text-violet-600', bg: 'bg-violet-50' },
          ].map(({ icon: Icon, label, value, color, bg }) => (
            <div key={label} className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-7 h-7 rounded-lg ${bg} flex items-center justify-center`}><Icon className={`w-3.5 h-3.5 ${color}`} /></div>
                <p className="text-sm font-semibold text-slate-700">{label}</p>
              </div>
              {value ? (
                <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{value}</p>
              ) : (
                <p className="text-sm text-slate-300 italic">Sin registrar</p>
              )}
            </div>
          ))}
        </div>
      </>
    )
  }

  // ── Vista 2: Historial de un paciente ──
  if (selectedPatient) {
    return (
      <>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');* { font-family: 'Inter', sans-serif; }.g-bg{background:linear-gradient(135deg,#00C4CC 0%,#0891b2 100%)}`}</style>
        <div className="max-w-3xl space-y-5">
          <div className="flex items-center gap-3">
            <button onClick={() => setSelectedPatient(null)} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800">
              <ArrowLeft className="w-4 h-4" /> Volver a pacientes
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full g-bg flex items-center justify-center text-white font-bold text-lg shrink-0">
              {selectedPatient.full_name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-bold text-slate-900">{selectedPatient.full_name}</p>
              <div className="flex items-center gap-3 mt-0.5">
                {selectedPatient.age && <span className="text-xs text-slate-400">{selectedPatient.age} años</span>}
                {selectedPatient.sex && <span className="text-xs text-slate-400 capitalize">{selectedPatient.sex === 'male' ? 'Masculino' : 'Femenino'}</span>}
                {selectedPatient.phone && <span className="text-xs text-slate-400">{selectedPatient.phone}</span>}
              </div>
            </div>
            <div className="ml-auto text-right">
              <p className="text-2xl font-bold text-teal-600">{consultations.length}</p>
              <p className="text-xs text-slate-400">consultas</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1 flex-wrap">
            {(['consultations', 'reports', 'prescriptions', 'photos'] as EHRTab[]).map(tab => {
              const labels: Record<EHRTab, string> = {
                consultations: 'Consultas',
                reports: 'Informes',
                prescriptions: 'Recetas',
                photos: 'Fotos'
              }
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${activeTab === tab ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  {labels[tab]}
                </button>
              )
            })}
          </div>

          {loadingConsults ? (
            <div className="py-12 text-center text-slate-400 text-sm">Cargando historial...</div>
          ) : (
            <>
              {/* CONSULTAS TAB */}
              {activeTab === 'consultations' && (
                <div className="space-y-2">
                  {consultations.length === 0 ? (
                    <div className="bg-white border border-dashed border-slate-200 rounded-xl py-12 text-center">
                      <FileText className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                      <p className="text-slate-400 text-sm">Sin consultas registradas</p>
                    </div>
                  ) : (
                    consultations.map(c => (
                      <button key={c.id} onClick={() => setSelectedConsultation(c)}
                        className="w-full bg-white border border-slate-200 rounded-xl p-4 text-left hover:border-teal-300 hover:shadow-sm transition-all flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center shrink-0">
                          <FileText className="w-5 h-5 text-teal-500" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className="text-sm font-semibold text-slate-800 font-mono">{c.consultation_code}</p>
                            {statusBadge(c.payment_status)}
                          </div>
                          <p className="text-xs text-slate-400 flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(c.consultation_date).toLocaleDateString('es-VE', { day: 'numeric', month: 'long', year: 'numeric' })}
                          </p>
                          {c.chief_complaint && <p className="text-xs text-slate-500 mt-1 truncate">{c.chief_complaint}</p>}
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-300" />
                      </button>
                    ))
                  )}
                </div>
              )}

              {/* INFORMES TAB */}
              {activeTab === 'reports' && (
                <div className="bg-white border border-dashed border-slate-200 rounded-xl py-12 text-center">
                  <FileText className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                  <p className="text-slate-400 text-sm">Sin informes registrados</p>
                  <p className="text-slate-300 text-xs mt-1">Los informes se crean desde Facturación</p>
                </div>
              )}

              {/* RECETAS TAB */}
              {activeTab === 'prescriptions' && (
                <div className="space-y-2">
                  {prescriptions.length === 0 ? (
                    <div className="bg-white border border-dashed border-slate-200 rounded-xl py-12 text-center">
                      <Pill className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                      <p className="text-slate-400 text-sm">Sin recetas registradas</p>
                    </div>
                  ) : (
                    prescriptions.map(rx => (
                      <div key={rx.id} className="bg-white border border-slate-200 rounded-xl p-4">
                        <p className="text-sm font-semibold text-slate-800">{rx.medication}</p>
                        <p className="text-xs text-slate-500 mt-1">
                          {rx.dosage} · {rx.frequency} · {rx.duration}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-2">
                          {new Date(rx.created_at).toLocaleDateString('es-VE')}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* FOTOS TAB */}
              {activeTab === 'photos' && (
                <div className="bg-white border border-dashed border-slate-200 rounded-xl py-12 text-center">
                  <FileText className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                  <p className="text-slate-400 text-sm">Sin fotos registradas</p>
                  <p className="text-slate-300 text-xs mt-1">Las fotos se adjuntan en consultas</p>
                </div>
              )}
            </>
          )}
        </div>
      </>
    )
  }

  // ── Vista 1: Lista de pacientes ──
  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');* { font-family: 'Inter', sans-serif; }.g-bg{background:linear-gradient(135deg,#00C4CC 0%,#0891b2 100%)}`}</style>

      <div className="max-w-2xl space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Historial Clínico</h1>
            <p className="text-sm text-slate-500">Consulta el expediente médico de tus pacientes</p>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar paciente por nombre o teléfono..."
            className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 bg-white"
          />
        </div>

        {loading ? (
          <div className="py-16 text-center text-slate-400 text-sm">Cargando pacientes...</div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-dashed border-slate-200 rounded-xl py-16 text-center">
            <User className="w-10 h-10 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">{search ? 'Sin resultados para tu búsqueda' : 'Sin pacientes registrados'}</p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {filtered.map((patient, i) => (
              <button
                key={patient.id}
                onClick={() => loadConsultations(patient)}
                className={`w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-teal-50 transition-colors ${i < filtered.length - 1 ? 'border-b border-slate-100' : ''}`}
              >
                <div className="w-10 h-10 rounded-full g-bg flex items-center justify-center text-white font-bold text-sm shrink-0">
                  {patient.full_name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-800">{patient.full_name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {[patient.age ? `${patient.age} años` : null, patient.phone].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <FileText className="w-3 h-3" /> Historial
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-300" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
