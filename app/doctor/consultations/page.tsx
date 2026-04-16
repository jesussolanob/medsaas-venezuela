'use client'

import { useState, useEffect, useTransition } from 'react'
import { ClipboardList, Search, Calendar, User, ChevronRight, ArrowLeft, Save, CheckCircle, Clock, AlertCircle, DollarSign, FileText, Stethoscope, Pill, Filter, Plus, X, Printer } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type Consultation = {
  id: string
  consultation_code: string
  consultation_date: string
  chief_complaint: string | null
  notes: string | null
  diagnosis: string | null
  treatment: string | null
  payment_status: 'unpaid' | 'pending_approval' | 'approved'
  patient_id: string
  patient_name: string
  patient_phone: string | null
}

type Patient = {
  id: string
  full_name: string
  phone: string | null
}

type Medication = {
  name: string
  dose: string
  frequency: string
  duration: string
  indications: string
}

type Recipe = {
  medications: Medication[]
  notes: string
}

const PAYMENT_STATUS = {
  unpaid: { label: 'No pagado', color: 'bg-red-100 text-red-600', dot: 'bg-red-500' },
  pending_approval: { label: 'Pago pendiente', color: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  approved: { label: 'Pagado', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
}

type ViewMode = 'list' | 'consultation'
type TimeFilter = 'all' | 'upcoming' | 'past' | 'today'

export default function ConsultationsPage() {
  const [view, setView] = useState<ViewMode>('list')
  const [selected, setSelected] = useState<Consultation | null>(null)
  const [consultations, setConsultations] = useState<Consultation[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all')
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)

  // Report fields (editable during consultation)
  const [report, setReport] = useState({ chief_complaint: '', notes: '', diagnosis: '', treatment: '', payment_status: 'unpaid' as Consultation['payment_status'] })

  // New consultation modal
  const [showNewConsultation, setShowNewConsultation] = useState(false)
  const [patients, setPatients] = useState<Patient[]>([])
  const [newConsultation, setNewConsultation] = useState({
    patient_id: '',
    consultation_date: new Date().toISOString().slice(0, 16),
    reason: '',
    amount: '',
    payment_method: 'efectivo' as 'efectivo' | 'transferencia' | 'pago_movil' | 'zelle' | 'seguro',
  })
  const [isCreatingConsultation, setIsCreatingConsultation] = useState(false)

  // Recipe modal
  const [showRecipe, setShowRecipe] = useState(false)
  const [recipe, setRecipe] = useState<Recipe>({ medications: [], notes: '' })
  const [isSavingRecipe, setIsSavingRecipe] = useState(false)
  const [showPrintRecipe, setShowPrintRecipe] = useState(false)

  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      try {
        // Cargar pacientes
        const { data: patientsData } = await supabase
          .from('patients')
          .select('id, full_name, phone')
          .eq('doctor_id', user.id)
        setPatients(patientsData ?? [])

        // Cargar consultas
        const { data } = await supabase
          .from('consultations')
          .select('*, patients(full_name, phone)')
          .eq('doctor_id', user.id)
          .order('consultation_date', { ascending: false })

        setConsultations((data ?? []).map(c => ({
          id: c.id,
          consultation_code: c.consultation_code,
          consultation_date: c.consultation_date,
          chief_complaint: c.chief_complaint,
          notes: c.notes,
          diagnosis: c.diagnosis,
          treatment: c.treatment,
          payment_status: c.payment_status,
          patient_id: c.patient_id,
          patient_name: !Array.isArray(c.patients) && c.patients ? (c.patients as { full_name: string }).full_name : 'Paciente',
          patient_phone: !Array.isArray(c.patients) && c.patients ? (c.patients as { full_name: string; phone: string | null }).phone : null,
        })))
      } catch (err) {
        console.error('Error loading data:', err)
      }
      setLoading(false)
    })
  }, [])

  function openConsultation(c: Consultation) {
    setSelected(c)
    setReport({
      chief_complaint: c.chief_complaint ?? '',
      notes: c.notes ?? '',
      diagnosis: c.diagnosis ?? '',
      treatment: c.treatment ?? '',
      payment_status: c.payment_status,
    })
    setRecipe({ medications: [], notes: '' })
    setView('consultation')
    setSaved(false)
  }

  async function createNewConsultation() {
    if (!newConsultation.patient_id || !newConsultation.consultation_date) {
      alert('Completa paciente y fecha')
      return
    }
    setIsCreatingConsultation(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Generar código de consulta
      const now = new Date()
      const code = `C-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`

      const { error } = await supabase.from('consultations').insert({
        doctor_id: user.id,
        patient_id: newConsultation.patient_id,
        consultation_code: code,
        consultation_date: new Date(newConsultation.consultation_date).toISOString(),
        chief_complaint: newConsultation.reason || null,
        payment_status: 'unpaid',
      })

      if (error) throw error

      // Recargar lista
      const { data } = await supabase
        .from('consultations')
        .select('*, patients(full_name, phone)')
        .eq('doctor_id', user.id)
        .order('consultation_date', { ascending: false })

      setConsultations((data ?? []).map(c => ({
        id: c.id,
        consultation_code: c.consultation_code,
        consultation_date: c.consultation_date,
        chief_complaint: c.chief_complaint,
        notes: c.notes,
        diagnosis: c.diagnosis,
        treatment: c.treatment,
        payment_status: c.payment_status,
        patient_id: c.patient_id,
        patient_name: !Array.isArray(c.patients) && c.patients ? (c.patients as { full_name: string }).full_name : 'Paciente',
        patient_phone: !Array.isArray(c.patients) && c.patients ? (c.patients as { full_name: string; phone: string | null }).phone : null,
      })))

      setShowNewConsultation(false)
      setNewConsultation({
        patient_id: '',
        consultation_date: new Date().toISOString().slice(0, 16),
        reason: '',
        amount: '',
        payment_method: 'efectivo',
      })
    } catch (err) {
      console.error('Error creating consultation:', err)
      alert('Error al crear consulta')
    } finally {
      setIsCreatingConsultation(false)
    }
  }

  async function saveRecipe() {
    if (!selected || recipe.medications.length === 0) {
      alert('Agrega al menos un medicamento')
      return
    }
    setIsSavingRecipe(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { error } = await supabase.from('prescriptions').insert({
        doctor_id: user.id,
        patient_id: selected.patient_id,
        consultation_id: selected.id,
        medications: recipe.medications,
        notes: recipe.notes || null,
        created_at: new Date().toISOString(),
      })

      if (error) throw error
      setShowRecipe(false)
      alert('Receta guardada')
    } catch (err) {
      console.error('Error saving recipe:', err)
      alert('Error al guardar receta')
    } finally {
      setIsSavingRecipe(false)
    }
  }

  function addMedication() {
    setRecipe(p => ({
      ...p,
      medications: [...p.medications, { name: '', dose: '', frequency: '', duration: '', indications: '' }]
    }))
  }

  function removeMedication(idx: number) {
    setRecipe(p => ({
      ...p,
      medications: p.medications.filter((_, i) => i !== idx)
    }))
  }

  function saveReport() {
    if (!selected) return
    startTransition(async () => {
      const supabase = createClient()
      await supabase.from('consultations').update({
        chief_complaint: report.chief_complaint,
        notes: report.notes,
        diagnosis: report.diagnosis,
        treatment: report.treatment,
        payment_status: report.payment_status,
      }).eq('id', selected.id)

      // Update local state
      setConsultations(prev => prev.map(c => c.id === selected.id
        ? { ...c, ...report }
        : c
      ))
      setSelected(prev => prev ? { ...prev, ...report } : null)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    })
  }

  // Filtering
  const now = new Date()
  const filtered = consultations.filter(c => {
    const matchSearch = !search || c.patient_name.toLowerCase().includes(search.toLowerCase()) || c.consultation_code.toLowerCase().includes(search.toLowerCase())
    const cDate = new Date(c.consultation_date)
    const matchTime = timeFilter === 'all' ? true
      : timeFilter === 'upcoming' ? cDate > now
      : timeFilter === 'past' ? cDate < now
      : c.consultation_date.startsWith(today)
    return matchSearch && matchTime
  })

  const upcoming = consultations.filter(c => new Date(c.consultation_date) > now).length
  const todayCount = consultations.filter(c => c.consultation_date.startsWith(today)).length

  if (view === 'consultation' && selected) {
    const cDate = new Date(selected.consultation_date)
    const isUpcoming = cDate > now
    const ps = PAYMENT_STATUS[report.payment_status]

    return (
      <>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');* { font-family: 'Inter', sans-serif; }.g-bg{background:linear-gradient(135deg,#00C4CC 0%,#0891b2 100%)}`}</style>
        <div className="max-w-3xl space-y-5">
          {/* Back */}
          <button onClick={() => setView('list')} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Volver a consultas
          </button>

          {/* Header */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl g-bg flex items-center justify-center shrink-0">
                  <Stethoscope className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="font-bold text-slate-900 text-lg">{selected.patient_name}</p>
                  <p className="text-xs text-slate-400 font-mono">{selected.consultation_code}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {cDate.toLocaleDateString('es-VE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} · {cDate.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className={`text-xs font-bold px-3 py-1 rounded-full ${isUpcoming ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-500'}`}>
                  {isUpcoming ? '📅 Próxima' : '✅ Realizada'}
                </span>
                <span className={`text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1.5 ${ps.color}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${ps.dot}`} />{ps.label}
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button onClick={saveReport} disabled={isPending}
              className="flex-1 flex items-center justify-center gap-2 g-bg px-4 py-2.5 rounded-xl text-sm font-bold text-white hover:opacity-90 disabled:opacity-60">
              {saved ? <><CheckCircle className="w-4 h-4" />Guardado</> : isPending ? 'Guardando...' : <><Save className="w-4 h-4" />Guardar informe</>}
            </button>
            <button onClick={() => setShowRecipe(true)}
              className="flex-1 flex items-center justify-center gap-2 g-bg px-4 py-2.5 rounded-xl text-sm font-bold text-white hover:opacity-90">
              <Pill className="w-4 h-4" /> Generar receta
            </button>
          </div>

          {/* Medical Report Form */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-400" />
              <p className="text-sm font-bold text-slate-800">Informe médico</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-slate-400" /> Motivo de consulta
                </label>
                <input value={report.chief_complaint} onChange={e => setReport(p => ({ ...p, chief_complaint: e.target.value }))}
                  placeholder="¿Por qué consulta el paciente hoy?" className={fi} />
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1.5">
                  <FileText className="w-3.5 h-3.5 text-slate-400" /> Notas de la consulta
                </label>
                <textarea value={report.notes} onChange={e => setReport(p => ({ ...p, notes: e.target.value }))}
                  rows={4} placeholder="Anamnesis, examen físico, hallazgos relevantes..." className={fi + ' resize-none'} />
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1.5">
                  <Stethoscope className="w-3.5 h-3.5 text-slate-400" /> Diagnóstico
                </label>
                <textarea value={report.diagnosis} onChange={e => setReport(p => ({ ...p, diagnosis: e.target.value }))}
                  rows={2} placeholder="Diagnóstico principal y diagnósticos diferenciales..." className={fi + ' resize-none'} />
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1.5">
                  <Pill className="w-3.5 h-3.5 text-slate-400" /> Plan de tratamiento
                </label>
                <textarea value={report.treatment} onChange={e => setReport(p => ({ ...p, treatment: e.target.value }))}
                  rows={3} placeholder="Medicamentos, dosis, indicaciones, próxima cita..." className={fi + ' resize-none'} />
              </div>

              {/* Payment status */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
                  <DollarSign className="w-3.5 h-3.5 text-slate-400" /> Estado del pago
                </label>
                <div className="flex gap-2">
                  {(Object.entries(PAYMENT_STATUS) as [Consultation['payment_status'], typeof PAYMENT_STATUS.unpaid][]).map(([key, val]) => (
                    <button key={key} onClick={() => setReport(p => ({ ...p, payment_status: key }))}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-bold border-2 transition-all flex items-center justify-center gap-1.5 ${report.payment_status === key ? val.color + ' border-current' : 'border-slate-200 text-slate-500 bg-white hover:bg-slate-50'}`}>
                      <span className={`w-2 h-2 rounded-full ${report.payment_status === key ? val.dot : 'bg-slate-300'}`} />
                      {val.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Saved to EHR note */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-start gap-3">
            <CheckCircle className="w-4 h-4 text-teal-500 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-600">Al guardar, el informe queda registrado en el <strong>historial clínico</strong> del paciente y en las finanzas del consultorio.</p>
          </div>
        </div>

        {/* Modal: Recipe */}
        {showRecipe && (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Pill className="w-5 h-5 text-teal-600" />
                  <h2 className="text-lg font-bold text-slate-900">Nueva receta</h2>
                </div>
                <button onClick={() => setShowRecipe(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
                {recipe.medications.map((med, idx) => (
                  <div key={idx} className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 space-y-2">
                        <input type="text" placeholder="Nombre del medicamento" value={med.name}
                          onChange={e => setRecipe(p => ({
                            ...p,
                            medications: p.medications.map((m, i) => i === idx ? { ...m, name: e.target.value } : m)
                          }))}
                          className={fi} />
                        <input type="text" placeholder="Dosis (ej: 500mg)" value={med.dose}
                          onChange={e => setRecipe(p => ({
                            ...p,
                            medications: p.medications.map((m, i) => i === idx ? { ...m, dose: e.target.value } : m)
                          }))}
                          className={fi} />
                        <input type="text" placeholder="Frecuencia (ej: cada 8h)" value={med.frequency}
                          onChange={e => setRecipe(p => ({
                            ...p,
                            medications: p.medications.map((m, i) => i === idx ? { ...m, frequency: e.target.value } : m)
                          }))}
                          className={fi} />
                        <input type="text" placeholder="Duración (ej: 7 días)" value={med.duration}
                          onChange={e => setRecipe(p => ({
                            ...p,
                            medications: p.medications.map((m, i) => i === idx ? { ...m, duration: e.target.value } : m)
                          }))}
                          className={fi} />
                        <input type="text" placeholder="Indicaciones" value={med.indications}
                          onChange={e => setRecipe(p => ({
                            ...p,
                            medications: p.medications.map((m, i) => i === idx ? { ...m, indications: e.target.value } : m)
                          }))}
                          className={fi} />
                      </div>
                      <button onClick={() => removeMedication(idx)} className="text-red-500 hover:text-red-700 mt-1">
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <button onClick={addMedication} className="w-full border-2 border-dashed border-teal-300 rounded-xl py-2.5 text-sm font-semibold text-teal-600 hover:bg-teal-50">
                + Agregar medicamento
              </button>

              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">Notas adicionales</label>
                <textarea value={recipe.notes} onChange={e => setRecipe(p => ({ ...p, notes: e.target.value }))}
                  rows={3} placeholder="Ej: Tomar con comida, evitar sol..." className={fi + ' resize-none'} />
              </div>

              <div className="flex gap-3">
                <button onClick={() => setShowRecipe(false)} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold border border-slate-200 text-slate-600 hover:bg-slate-50">
                  Cancelar
                </button>
                <button onClick={saveRecipe} disabled={isSavingRecipe} className="flex-1 flex items-center justify-center gap-2 g-bg px-4 py-2.5 rounded-xl text-sm font-bold text-white hover:opacity-90 disabled:opacity-60">
                  {isSavingRecipe ? 'Guardando...' : <><Save className="w-4 h-4" /> Guardar receta</>}
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    )
  }

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');* { font-family: 'Inter', sans-serif; }.g-bg{background:linear-gradient(135deg,#00C4CC 0%,#0891b2 100%)}`}</style>

      <div className="max-w-4xl space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Consultas</h1>
            <p className="text-sm text-slate-500 mt-1">Gestiona tus consultas, entra a realizar el informe médico y controla el pago</p>
          </div>
          <button onClick={() => setShowNewConsultation(true)}
            className="flex items-center justify-center sm:justify-start gap-2 g-bg px-4 py-2.5 rounded-xl text-sm font-bold text-white hover:opacity-90 shrink-0 w-full sm:w-auto">
            <Plus className="w-4 h-4" /> <span>Nueva consulta</span>
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          {[
            { label: 'Total', value: consultations.length, color: 'text-slate-700', bg: 'bg-white', filter: 'all' as TimeFilter },
            { label: 'Hoy', value: todayCount, color: 'text-teal-700', bg: 'bg-teal-50 border-teal-200', filter: 'today' as TimeFilter },
            { label: 'Próximas', value: upcoming, color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', filter: 'upcoming' as TimeFilter },
            { label: 'Realizadas', value: consultations.length - upcoming, color: 'text-slate-600', bg: 'bg-slate-50', filter: 'past' as TimeFilter },
          ].map(s => (
            <button key={s.filter} onClick={() => setTimeFilter(timeFilter === s.filter ? 'all' : s.filter)}
              className={`border rounded-xl p-3 sm:p-4 text-center transition-all hover:shadow-sm ${s.bg} ${timeFilter === s.filter ? 'ring-2 ring-teal-400 ring-offset-1' : 'border-slate-200'}`}>
              <p className={`text-xl sm:text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-slate-500 font-medium mt-0.5">{s.label}</p>
            </button>
          ))}
        </div>

        {/* Search & filter */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por paciente o código..." className={fi + ' pl-9'} />
          </div>
          <select value={timeFilter} onChange={e => setTimeFilter(e.target.value as TimeFilter)} className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-teal-400 text-slate-600 bg-white shrink-0">
            <option value="all">Todas</option>
            <option value="today">Hoy</option>
            <option value="upcoming">Próximas</option>
            <option value="past">Realizadas</option>
          </select>
        </div>

        {/* List */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-slate-400" />
              <p className="text-sm font-semibold text-slate-700">{filtered.length} consultas</p>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400 text-sm">Cargando...</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ClipboardList className="w-10 h-10 text-slate-200 mb-3" />
              <p className="text-slate-500 font-semibold text-sm">Sin consultas</p>
              <p className="text-slate-400 text-xs mt-1">Las consultas aparecen cuando se agendan desde la página de booking o se crean en el módulo de pacientes.</p>
            </div>
          ) : (
            filtered.map((c, i) => {
              const cDate = new Date(c.consultation_date)
              const isToday = c.consultation_date.startsWith(today)
              const isUpcoming = cDate > now
              const ps = PAYMENT_STATUS[c.payment_status]
              const hasReport = c.diagnosis || c.notes

              return (
                <button key={c.id} onClick={() => openConsultation(c)}
                  className={`w-full flex flex-col sm:flex-row items-start gap-3 sm:gap-4 px-4 sm:px-5 py-4 text-left hover:bg-slate-50 transition-colors ${i < filtered.length - 1 ? 'border-b border-slate-100' : ''}`}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isToday ? 'g-bg' : isUpcoming ? 'bg-blue-50' : 'bg-slate-100'}`}>
                    {isToday ? <Stethoscope className="w-5 h-5 text-white" /> : isUpcoming ? <Clock className="w-5 h-5 text-blue-500" /> : <CheckCircle className="w-5 h-5 text-slate-400" />}
                  </div>
                  <div className="flex-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <p className="text-sm font-bold text-slate-900 break-words">{c.patient_name}</p>
                      <span className="text-[10px] font-mono text-slate-400 shrink-0">{c.consultation_code}</span>
                      {isToday && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 shrink-0">Hoy</span>}
                      {!isToday && isUpcoming && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 shrink-0">Próxima</span>}
                    </div>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1 sm:gap-2 text-xs text-slate-400">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        <span>{cDate.toLocaleDateString('es-VE', { day: 'numeric', month: 'short' })} · {cDate.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      {c.chief_complaint && <><span className="hidden sm:inline text-slate-200">·</span><span className="italic truncate">{c.chief_complaint}</span></>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                    {hasReport && <span className="text-[10px] font-semibold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full hidden sm:inline-block">Con informe</span>}
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${ps.color}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${ps.dot}`} /><span className="hidden sm:inline">{ps.label}</span>
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-300" />
                  </div>
                </button>
              )
            })
          )}
        </div>

        {/* Modal: New Consultation */}
        {showNewConsultation && (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-teal-600" />
                  <h2 className="text-lg font-bold text-slate-900">Nueva consulta</h2>
                </div>
                <button onClick={() => setShowNewConsultation(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-1.5 block">Selecciona paciente</label>
                  <select value={newConsultation.patient_id} onChange={e => setNewConsultation(p => ({ ...p, patient_id: e.target.value }))}
                    className={fi}>
                    <option value="">-- Elige paciente --</option>
                    {patients.map(p => (
                      <option key={p.id} value={p.id}>{p.full_name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-700 mb-1.5 block">Fecha y hora</label>
                  <input type="datetime-local" value={newConsultation.consultation_date}
                    onChange={e => setNewConsultation(p => ({ ...p, consultation_date: e.target.value }))}
                    className={fi} />
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-700 mb-1.5 block">Motivo de consulta</label>
                  <input type="text" placeholder="Ej: Revisión general, dolor de cabeza..." value={newConsultation.reason}
                    onChange={e => setNewConsultation(p => ({ ...p, reason: e.target.value }))}
                    className={fi} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-slate-700 mb-1.5 block">Monto USD</label>
                    <input type="number" placeholder="0.00" value={newConsultation.amount}
                      onChange={e => setNewConsultation(p => ({ ...p, amount: e.target.value }))}
                      className={fi} />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700 mb-1.5 block">Método pago</label>
                    <select value={newConsultation.payment_method} onChange={e => setNewConsultation(p => ({ ...p, payment_method: e.target.value as any }))}
                      className={fi}>
                      <option value="efectivo">Efectivo</option>
                      <option value="transferencia">Transferencia</option>
                      <option value="pago_movil">Pago Móvil</option>
                      <option value="zelle">Zelle</option>
                      <option value="seguro">Seguro</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setShowNewConsultation(false)} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold border border-slate-200 text-slate-600 hover:bg-slate-50">
                  Cancelar
                </button>
                <button onClick={createNewConsultation} disabled={isCreatingConsultation} className="flex-1 flex items-center justify-center gap-2 g-bg px-4 py-2.5 rounded-xl text-sm font-bold text-white hover:opacity-90 disabled:opacity-60">
                  {isCreatingConsultation ? 'Creando...' : <><Plus className="w-4 h-4" /> Crear consulta</>}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

const fi = 'w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 bg-white transition-colors'
