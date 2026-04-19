'use client'

import { useState, useEffect, useTransition, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { ClipboardList, Search, Calendar, User, ChevronRight, ArrowLeft, Save, CheckCircle, Clock, AlertCircle, DollarSign, FileText, Stethoscope, Pill, Filter, Plus, X, Printer, Droplet, AlertTriangle, Heart, Sparkles, Wand2, History, Copy, Loader2, Share2, Mail, MessageCircle, ChevronDown, ChevronUp } from 'lucide-react'
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
  email?: string | null
  cedula?: string | null
  age?: number | null
  sex?: string | null
  blood_type?: string | null
  allergies?: string | null
  chronic_conditions?: string | null
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

type AppointmentData = {
  payment_receipt_url?: string | null
  payment_method?: string | null
  plan_price?: number | null
  plan_name?: string | null
}

const PAYMENT_STATUS = {
  unpaid: { label: 'No pagado', color: 'bg-red-100 text-red-600', dot: 'bg-red-500' },
  pending_approval: { label: 'Pago pendiente', color: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  approved: { label: 'Pagado', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
}

type ViewMode = 'list' | 'consultation'
type TimeFilter = 'all' | 'upcoming' | 'past' | 'today'
type ConsultationTab = 'informe' | 'recipe' | 'prescripciones' | 'reposo' | 'notas'

type Prescripcion = {
  exam_name: string
  notes: string
}

export default function ConsultationsPageWrapper() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-12 text-slate-400 text-sm">Cargando...</div>}>
      <ConsultationsPage />
    </Suspense>
  )
}

function ConsultationsPage() {
  const searchParams = useSearchParams()
  const openId = searchParams.get('open')

  const [view, setView] = useState<ViewMode>('list')
  const [selected, setSelected] = useState<Consultation | null>(null)
  const [consultations, setConsultations] = useState<Consultation[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all')
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [consultationTab, setConsultationTab] = useState<ConsultationTab>('informe')

  // Report fields (editable during consultation)
  const [report, setReport] = useState({ chief_complaint: '', notes: '', diagnosis: '', treatment: '', payment_status: 'unpaid' as Consultation['payment_status'] })

  // PDF include toggles
  const [includeRecipe, setIncludeRecipe] = useState(true)
  const [includePrescripciones, setIncludePrescripciones] = useState(true)

  // Reposo fields
  const [reposoDays, setReposoDays] = useState(0)
  const [reposoFrom, setReposoFrom] = useState('')
  const [reposoTo, setReposoTo] = useState('')
  const [reposoDiagnosis, setReposoDiagnosis] = useState('')

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

  // Prescripciones (exámenes que el médico ordena)
  const [prescripciones, setPrescripciones] = useState<Prescripcion[]>([])
  const [isSavingPrescripciones, setIsSavingPrescripciones] = useState(false)

  // AI assistant state
  const [aiResult, setAiResult] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiAction, setAiAction] = useState<'summarize' | 'improve' | 'patient_history' | null>(null)

  // Appointment data (for payment receipt, method, price)
  const [appointmentData, setAppointmentData] = useState<AppointmentData | null>(null)

  // Share menu state
  const [showShare, setShowShare] = useState(false)
  const [shareItems, setShareItems] = useState({ informe: true, recipe: false, prescripciones: false, reposo: false })

  // Collapsible sidebar sections
  const [showPaymentDetails, setShowPaymentDetails] = useState(false)
  const [showRightSidebar, setShowRightSidebar] = useState(true)

  // Doctor profile for share template
  const [doctorName, setDoctorName] = useState('')
  const [shareTemplate, setShareTemplate] = useState('Hola {paciente}, te envío los documentos de tu consulta del {fecha}: {documentos}. Cualquier duda quedo a tu orden. {doctor}')

  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      try {
        // Cargar perfil del doctor (nombre + template de mensaje)
        const { data: profileData } = await supabase
          .from('profiles')
          .select('full_name, professional_title, share_message_template')
          .eq('id', user.id)
          .single()
        if (profileData) {
          setDoctorName(`${profileData.professional_title || ''} ${profileData.full_name || ''}`.trim())
          if (profileData.share_message_template) setShareTemplate(profileData.share_message_template)
        }

        // Cargar pacientes con datos médicos
        const { data: patientsData } = await supabase
          .from('patients')
          .select('id, full_name, phone, email, cedula, age, sex, blood_type, allergies, chronic_conditions')
          .eq('doctor_id', user.id)
        setPatients(patientsData ?? [])

        // Cargar consultas
        const { data } = await supabase
          .from('consultations')
          .select('*, patients(full_name, phone)')
          .eq('doctor_id', user.id)
          .order('consultation_date', { ascending: false })

        const consultationsList = (data ?? []).map(c => ({
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
        }))

        setConsultations(consultationsList)

        // Auto-open consultation if openId is in query params
        if (openId) {
          const consultationToOpen = consultationsList.find(c => c.id === openId)
          if (consultationToOpen) {
            await new Promise(resolve => setTimeout(resolve, 100)) // Small delay to ensure state is updated
            openConsultation(consultationToOpen)
          }
        }
      } catch (err) {
        console.error('Error loading data:', err)
      }
      setLoading(false)
    })
  }, [openId])

  async function openConsultation(c: Consultation) {
    // Fetch fresh data from DB to ensure we have latest notes/diagnosis/treatment
    const supabase = createClient()
    try {
      const { data } = await supabase
        .from('consultations')
        .select('id, consultation_code, consultation_date, chief_complaint, notes, diagnosis, treatment, payment_status, patient_id, appointment_id, patients(full_name, phone)')
        .eq('id', c.id)
        .single()

      if (data) {
        const fresh: Consultation = {
          id: data.id,
          consultation_code: data.consultation_code,
          consultation_date: data.consultation_date,
          chief_complaint: data.chief_complaint,
          notes: data.notes,
          diagnosis: data.diagnosis,
          treatment: data.treatment,
          payment_status: data.payment_status,
          patient_id: data.patient_id,
          patient_name: !Array.isArray(data.patients) && data.patients ? (data.patients as { full_name: string }).full_name : c.patient_name,
          patient_phone: !Array.isArray(data.patients) && data.patients ? (data.patients as { full_name: string; phone: string | null }).phone : c.patient_phone,
        }
        setSelected(fresh)
        setReport({
          chief_complaint: fresh.chief_complaint ?? '',
          notes: fresh.notes ?? '',
          diagnosis: fresh.diagnosis ?? '',
          treatment: fresh.treatment ?? '',
          payment_status: fresh.payment_status,
        })
        // Update local list with fresh data
        setConsultations(prev => prev.map(x => x.id === fresh.id ? fresh : x))

        // Fetch linked appointment data for payment receipt
        if (data.appointment_id) {
          const { data: apptData } = await supabase
            .from('appointments')
            .select('payment_receipt_url, payment_method, plan_price, plan_name')
            .eq('id', data.appointment_id)
            .maybeSingle()
          setAppointmentData(apptData || null)
        } else {
          // Fallback: try to find by doctor_id + patient_id + consultation_date
          const { data: { user } } = await supabase.auth.getUser()
          if (user) {
            const { data: apptData } = await supabase
              .from('appointments')
              .select('payment_receipt_url, payment_method, plan_price, plan_name')
              .eq('doctor_id', user.id)
              .eq('patient_id', data.patient_id)
              .eq('scheduled_at', data.consultation_date)
              .maybeSingle()
            setAppointmentData(apptData || null)
          }
        }
      } else {
        // Fallback to cached data
        setSelected(c)
        setReport({ chief_complaint: c.chief_complaint ?? '', notes: c.notes ?? '', diagnosis: c.diagnosis ?? '', treatment: c.treatment ?? '', payment_status: c.payment_status })
        setAppointmentData(null)
      }
    } catch {
      // Fallback to cached data on error
      setSelected(c)
      setReport({ chief_complaint: c.chief_complaint ?? '', notes: c.notes ?? '', diagnosis: c.diagnosis ?? '', treatment: c.treatment ?? '', payment_status: c.payment_status })
      setAppointmentData(null)
    }
    setRecipe({ medications: [], notes: '' })
    setView('consultation')
    setSaved(false)
    setConsultationTab('informe')
  }

  async function createNewConsultation() {
    if (!newConsultation.patient_id || !newConsultation.consultation_date) {
      alert('Completa paciente y fecha')
      return
    }
    setIsCreatingConsultation(true)
    try {
      // 1. Create consultation via API
      const res = await fetch('/api/doctor/consultations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: newConsultation.patient_id,
          chief_complaint: newConsultation.reason || null,
          consultation_date: new Date(newConsultation.consultation_date).toISOString(),
          amount: parseFloat(newConsultation.amount) || 0,
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Error al crear consulta')

      // 2. If there's an amount and payment method, register the payment
      const consultationId = result.consultation?.id
      if (consultationId && newConsultation.amount && parseFloat(newConsultation.amount) > 0) {
        await fetch('/api/doctor/payments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            consultation_id: consultationId,
            patient_id: newConsultation.patient_id,
            amount: parseFloat(newConsultation.amount),
            payment_method: newConsultation.payment_method,
          }),
        })
      }

      // 3. Reload consultation list
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
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
      }

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

  function generatePDF() {
    if (!selected) return

    const printWindow = window.open('', '_blank')
    if (!printWindow) return

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>Informe Médico - ${selected.consultation_code}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Segoe UI', Arial, sans-serif; }
    body { padding: 40px; color: #1e293b; line-height: 1.6; }
    .header { border-bottom: 3px solid #0891b2; padding-bottom: 20px; margin-bottom: 30px; }
    .header h1 { color: #0891b2; font-size: 24px; }
    .header p { color: #64748b; font-size: 12px; margin-top: 4px; }
    .meta { display: flex; gap: 40px; margin-bottom: 30px; flex-wrap: wrap; }
    .meta-item { }
    .meta-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; font-weight: 700; }
    .meta-value { font-size: 14px; font-weight: 600; color: #1e293b; margin-top: 2px; }
    .section { margin-bottom: 24px; }
    .section-title { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #0891b2; font-weight: 700; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 12px; }
    .section-content { font-size: 13px; color: #334155; }
    .section-content ul, .section-content ol { padding-left: 20px; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center; }
    .footer p { font-size: 10px; color: #94a3b8; }
    .code { font-family: monospace; background: #f1f5f9; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>Delta</h1>
    <p>Informe Médico</p>
  </div>

  <div class="meta">
    <div class="meta-item">
      <div class="meta-label">Paciente</div>
      <div class="meta-value">${selected.patient_name}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Código</div>
      <div class="meta-value code">${selected.consultation_code}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Fecha</div>
      <div class="meta-value">${new Date(selected.consultation_date).toLocaleDateString('es-VE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
    </div>
  </div>

  ${report.chief_complaint ? '<div class="section"><div class="section-title">Motivo de Consulta</div><div class="section-content">' + report.chief_complaint + '</div></div>' : ''}

  ${report.notes ? '<div class="section"><div class="section-title">Informe Médico</div><div class="section-content">' + report.notes + '</div></div>' : ''}

  ${report.diagnosis ? '<div class="section"><div class="section-title">Diagnóstico</div><div class="section-content">' + report.diagnosis + '</div></div>' : ''}

  ${includeRecipe && report.treatment ? '<div class="section"><div class="section-title">Plan de Tratamiento</div><div class="section-content">' + report.treatment + '</div></div>' : ''}

  ${includePrescripciones && prescripciones.length > 0 ? '<div class="section"><div class="section-title">Prescripciones</div><div class="section-content"><ul>' + prescripciones.filter(p => p.exam_name.trim()).map(p => '<li>' + p.exam_name + (p.notes ? ' - ' + p.notes : '') + '</li>').join('') + '</ul></div></div>' : ''}

  <div class="footer">
    <p>Documento generado por Delta · ${new Date().toLocaleDateString('es-VE')}</p>
    <p>${selected.consultation_code}</p>
  </div>

  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`

    printWindow.document.write(htmlContent)
    printWindow.document.close()
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

  async function callAI(action: 'summarize' | 'improve' | 'patient_history', content?: string) {
    if (!selected) return
    setAiLoading(true)
    setAiAction(action)
    setAiResult('')
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        setAiResult('Sesión expirada. Recarga la página.')
        return
      }
      const res = await fetch('/api/doctor/ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action,
          content: content || report.notes || report.diagnosis || '',
          patientId: selected.patient_id,
          consultationId: selected.id,
        }),
      })
      const data = await res.json()
      if (data.error) {
        setAiResult(`Error: ${data.error}`)
      } else {
        setAiResult(data.result)
      }
    } catch (err) {
      setAiResult('Error al conectar con la IA')
    } finally {
      setAiLoading(false)
    }
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
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');* { font-family: 'Inter', sans-serif; }.g-bg{background:linear-gradient(135deg,#00C4CC 0%,#0891b2 100%)}.safari-tab { border-radius: 8px 8px 0 0; padding: 8px 16px; } .safari-tab.active { background: white; border: 1px solid #e2e8f0; border-bottom: none; box-shadow: 0 -2px 8px rgba(0,0,0,0.03); }`}</style>
        <div className="flex flex-col lg:flex-row gap-5">
          {/* Main Content (Left ~65%) */}
          <div className="flex-1 min-w-0 space-y-5">
            {/* Header: Back + Actions (PDF, Print, Share) */}
            <div className="flex items-center justify-between">
              <button onClick={() => setView('list')} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 transition-colors">
                <ArrowLeft className="w-4 h-4" /> Volver a consultas
              </button>
              <div className="flex items-center gap-2">
                <button onClick={generatePDF}
                  className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
                  <FileText className="w-4 h-4" /> PDF
                </button>
                <button onClick={generatePDF}
                  className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
                  <Printer className="w-4 h-4" /> Imprimir
                </button>
                {/* Share Button */}
                <div className="relative">
                  <button onClick={() => setShowShare(!showShare)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
                    <Share2 className="w-4 h-4" /> Compartir
                  </button>
                  {showShare && (
                    <div className="absolute right-0 mt-2 w-72 bg-white border border-slate-200 rounded-xl shadow-lg z-50 p-5 space-y-4">
                      <p className="text-sm font-bold text-slate-800">¿Qué deseas compartir?</p>
                      <div className="space-y-2">
                        <label className="flex items-center gap-2.5 cursor-pointer">
                          <input type="checkbox" checked={shareItems.informe} onChange={e => setShareItems(p => ({ ...p, informe: e.target.checked }))}
                            className="w-4 h-4 rounded border-slate-300 accent-teal-500" />
                          <span className="text-sm text-slate-700">Informe</span>
                        </label>
                        <label className="flex items-center gap-2.5 cursor-pointer">
                          <input type="checkbox" checked={shareItems.recipe} onChange={e => setShareItems(p => ({ ...p, recipe: e.target.checked }))}
                            className="w-4 h-4 rounded border-slate-300 accent-teal-500" />
                          <span className="text-sm text-slate-700">Receta</span>
                        </label>
                        <label className="flex items-center gap-2.5 cursor-pointer">
                          <input type="checkbox" checked={shareItems.prescripciones} onChange={e => setShareItems(p => ({ ...p, prescripciones: e.target.checked }))}
                            className="w-4 h-4 rounded border-slate-300 accent-teal-500" />
                          <span className="text-sm text-slate-700">Prescripciones</span>
                        </label>
                        <label className="flex items-center gap-2.5 cursor-pointer">
                          <input type="checkbox" checked={shareItems.reposo} onChange={e => setShareItems(p => ({ ...p, reposo: e.target.checked }))}
                            className="w-4 h-4 rounded border-slate-300 accent-teal-500" />
                          <span className="text-sm text-slate-700">Reposo</span>
                        </label>
                      </div>
                      <div className="flex gap-2 pt-2">
                        <button onClick={() => {
                          const docs: string[] = []
                          if (shareItems.informe) docs.push('informe médico')
                          if (shareItems.recipe) docs.push('receta')
                          if (shareItems.prescripciones) docs.push('prescripciones')
                          if (shareItems.reposo) docs.push('constancia de reposo')
                          if (docs.length === 0) { alert('Selecciona al menos un documento'); return }
                          const message = shareTemplate
                            .replace('{paciente}', selected.patient_name)
                            .replace('{fecha}', new Date(selected.consultation_date).toLocaleDateString('es-VE'))
                            .replace('{documentos}', docs.join(', '))
                            .replace('{doctor}', doctorName)
                            .replace('{codigo}', selected.consultation_code || '')
                          const phone = selected.patient_phone?.replace(/\D/g, '')
                          if (phone) window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank')
                          else alert('Este paciente no tiene teléfono registrado')
                          setShowShare(false)
                        }}
                          className="flex-1 flex items-center justify-center gap-2 bg-green-500 text-white px-3 py-2 rounded-lg text-xs font-bold hover:bg-green-600 transition-colors">
                          <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                        </button>
                        <button onClick={() => {
                          const docs: string[] = []
                          if (shareItems.informe) docs.push('Informe médico')
                          if (shareItems.recipe) docs.push('Receta')
                          if (shareItems.prescripciones) docs.push('Prescripciones')
                          if (shareItems.reposo) docs.push('Constancia de reposo')
                          if (docs.length === 0) { alert('Selecciona al menos un documento'); return }
                          const subject = `Documentos médicos - Consulta ${selected.consultation_code}`
                          const body = shareTemplate
                            .replace('{paciente}', selected.patient_name)
                            .replace('{fecha}', new Date(selected.consultation_date).toLocaleDateString('es-VE'))
                            .replace('{documentos}', docs.join(', '))
                            .replace('{doctor}', doctorName)
                            .replace('{codigo}', selected.consultation_code || '')
                          const patientEmail = patients.find(p => p.id === selected.patient_id)?.email
                          if (patientEmail) window.open(`mailto:${patientEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank')
                          else alert('Este paciente no tiene email registrado')
                          setShowShare(false)
                        }}
                          className="flex-1 flex items-center justify-center gap-2 bg-blue-500 text-white px-3 py-2 rounded-lg text-xs font-bold hover:bg-blue-600 transition-colors">
                          <Mail className="w-3.5 h-3.5" /> Correo
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Medical Report Form with Safari-style Tabs */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              {/* Safari-style Tab Navigation */}
              <div className="flex items-end gap-1 px-6 pt-4 bg-slate-50 border-b border-slate-200">
                {(['informe', 'recipe', 'prescripciones', 'reposo', 'notas'] as ConsultationTab[]).map(tab => {
                  const labels: Record<ConsultationTab, string> = {
                    informe: 'Informe',
                    recipe: 'Receta',
                    prescripciones: 'Prescripciones',
                    reposo: 'Reposo',
                    notas: 'Notas'
                  }
                  return (
                    <button
                      key={tab}
                      onClick={() => setConsultationTab(tab)}
                      className={`safari-tab text-sm font-semibold transition-all whitespace-nowrap ${
                        consultationTab === tab
                          ? 'active border-t border-l border-r border-slate-200 text-slate-900'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {labels[tab]}
                    </button>
                  )
                })}
              </div>

              {/* Tab Content */}
              <div className="p-6 space-y-4">
                {/* Informe Tab - includes Diagnóstico field */}
                {consultationTab === 'informe' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-slate-400" />
                        <p className="text-sm font-bold text-slate-800">Informe médico</p>
                      </div>
                      <p className="text-xs font-mono text-slate-400 bg-slate-50 px-2.5 py-1 rounded-lg">ID: {selected.consultation_code}</p>
                    </div>
                    <div>
                      <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1.5">
                        <AlertCircle className="w-3.5 h-3.5 text-slate-400" /> Motivo de consulta
                      </label>
                      <input value={report.chief_complaint} onChange={e => setReport(p => ({ ...p, chief_complaint: e.target.value }))}
                        placeholder="¿Por qué consulta el paciente hoy?" className={fi} />
                    </div>
                    <div>
                      <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1.5">
                        <FileText className="w-3.5 h-3.5 text-slate-400" /> Informe completo
                      </label>
                      <RichTextEditor value={report.notes} onChange={html => setReport(p => ({ ...p, notes: html }))}
                        placeholder="Escribe el informe completo: anamnesis, examen físico, hallazgos relevantes..." />
                    </div>
                  </div>
                )}

                {/* Recipe Tab */}
                {consultationTab === 'recipe' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <Pill className="w-4 h-4 text-slate-400" />
                        <p className="text-sm font-bold text-slate-800">Receta</p>
                      </div>
                      <button onClick={() => setShowRecipe(true)}
                        className="flex items-center gap-2 px-3 py-1.5 g-bg rounded-lg text-xs font-bold text-white hover:opacity-90">
                        <Pill className="w-3.5 h-3.5" /> Generar receta
                      </button>
                    </div>
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1.5">
                      <Pill className="w-3.5 h-3.5 text-slate-400" /> Tratamiento / Indicaciones
                    </label>
                    <RichTextEditor value={report.treatment} onChange={html => setReport(p => ({ ...p, treatment: html }))}
                      placeholder="Medicamentos, dosis, indicaciones, próxima cita..." />
                    <div className="flex gap-2 pt-2">
                      <button onClick={() => setShowRecipe(true)}
                        className="flex-1 flex items-center justify-center gap-2 g-bg px-4 py-2.5 rounded-xl text-sm font-bold text-white hover:opacity-90">
                        <Pill className="w-4 h-4" /> Generar receta
                      </button>
                      <button onClick={() => {
                        const printWindow = window.open('', '_blank')
                        if (!printWindow) return
                        const htmlContent = `<!DOCTYPE html><html><head><title>Receta - ${selected.consultation_code}</title><style>*{margin:0;padding:0;box-sizing:border-box;font-family:'Segoe UI',Arial,sans-serif}body{padding:40px;color:#1e293b;line-height:1.6}.header{border-bottom:3px solid #0891b2;padding-bottom:20px;margin-bottom:30px}.header h1{color:#0891b2;font-size:24px}.header p{color:#64748b;font-size:12px;margin-top:4px}.meta{display:flex;gap:40px;margin-bottom:30px;flex-wrap:wrap}.meta-item{}.meta-label{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;font-weight:700}.meta-value{font-size:14px;font-weight:600;color:#1e293b;margin-top:2px}.section{margin-bottom:24px}.section-title{font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#0891b2;font-weight:700;border-bottom:1px solid #e2e8f0;padding-bottom:8px;margin-bottom:12px}.section-content{font-size:13px;color:#334155}.footer{margin-top:40px;padding-top:20px;border-top:1px solid #e2e8f0;text-align:center}.footer p{font-size:10px;color:#94a3b8}@media print{body{padding:20px}}</style></head><body><div class="header"><h1>Delta</h1><p>Receta Médica</p></div><div class="meta"><div class="meta-item"><div class="meta-label">Paciente</div><div class="meta-value">${selected.patient_name}</div></div><div class="meta-item"><div class="meta-label">Código</div><div class="meta-value">${selected.consultation_code}</div></div><div class="meta-item"><div class="meta-label">Fecha</div><div class="meta-value">${new Date(selected.consultation_date).toLocaleDateString('es-VE', { year: 'numeric', month: 'long', day: 'numeric' })}</div></div></div><div class="section"><div class="section-title">Indicaciones</div><div class="section-content">${report.treatment || 'Sin indicaciones registradas'}</div></div><div class="footer"><p>Documento generado por Delta · ${new Date().toLocaleDateString('es-VE')}</p></div><script>window.onload=function(){window.print()}</script></body></html>`
                        printWindow.document.write(htmlContent)
                        printWindow.document.close()
                      }}
                        className="flex items-center justify-center gap-2 border border-slate-300 px-4 py-2.5 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50">
                        <Printer className="w-4 h-4" /> PDF
                      </button>
                    </div>
                  </div>
                )}

                {/* Prescripciones Tab (exámenes médicos) */}
                {consultationTab === 'prescripciones' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-slate-400" />
                        <p className="text-sm font-bold text-slate-800">Prescripciones médicas</p>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500">Exámenes e indicaciones que el médico ordena al paciente (laboratorio, imágenes, etc.)</p>

                    <div className="space-y-3">
                      {prescripciones.map((p, idx) => (
                        <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 space-y-2">
                              <input type="text" placeholder="Nombre del examen (ej: Hematología completa, Rx de tórax...)" value={p.exam_name}
                                onChange={e => setPrescripciones(prev => prev.map((item, i) => i === idx ? { ...item, exam_name: e.target.value } : item))}
                                className={fi} />
                              <input type="text" placeholder="Indicaciones (ej: En ayunas, contraste oral...)" value={p.notes}
                                onChange={e => setPrescripciones(prev => prev.map((item, i) => i === idx ? { ...item, notes: e.target.value } : item))}
                                className={fi} />
                            </div>
                            <button onClick={() => setPrescripciones(prev => prev.filter((_, i) => i !== idx))} className="text-red-500 hover:text-red-700 mt-1">
                              <X className="w-5 h-5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <button onClick={() => setPrescripciones(prev => [...prev, { exam_name: '', notes: '' }])}
                      className="w-full border-2 border-dashed border-teal-300 rounded-xl py-2.5 text-sm font-semibold text-teal-600 hover:bg-teal-50">
                      + Agregar examen
                    </button>

                    {prescripciones.length > 0 && (
                      <div className="flex gap-3 pt-2">
                        <button onClick={async () => {
                          if (!selected || prescripciones.filter(p => p.exam_name.trim()).length === 0) {
                            alert('Agrega al menos un examen con nombre')
                            return
                          }
                          setIsSavingPrescripciones(true)
                          try {
                            const supabase = createClient()
                            const { data: { user } } = await supabase.auth.getUser()
                            if (!user) return
                            const exams = prescripciones.filter(p => p.exam_name.trim())
                            for (const exam of exams) {
                              await supabase.from('prescriptions').insert({
                                doctor_id: user.id,
                                patient_id: selected.patient_id,
                                consultation_id: selected.id,
                                medications: [{ name: exam.exam_name, dose: '', frequency: '', duration: '', indications: exam.notes }],
                                notes: `Examen: ${exam.exam_name}${exam.notes ? ` - ${exam.notes}` : ''}`,
                                created_at: new Date().toISOString(),
                              })
                            }
                            alert('Prescripciones guardadas')
                            setPrescripciones([])
                          } catch (err) {
                            console.error('Error saving prescriptions:', err)
                            alert('Error al guardar prescripciones')
                          } finally {
                            setIsSavingPrescripciones(false)
                          }
                        }} disabled={isSavingPrescripciones}
                          className="flex-1 flex items-center justify-center gap-2 g-bg px-4 py-2.5 rounded-xl text-sm font-bold text-white hover:opacity-90 disabled:opacity-60">
                          {isSavingPrescripciones ? 'Guardando...' : <><Save className="w-4 h-4" /> Guardar</>}
                        </button>
                        <button onClick={() => {
                          if (!selected) return
                          const exams = prescripciones.filter(p => p.exam_name.trim())
                          if (exams.length === 0) return
                          const printWindow = window.open('', '_blank')
                          if (!printWindow) return
                          const htmlContent = `<!DOCTYPE html><html><head><title>Prescripciones - ${selected.consultation_code}</title><style>*{margin:0;padding:0;box-sizing:border-box;font-family:'Segoe UI',Arial,sans-serif}body{padding:40px;color:#1e293b;line-height:1.6}.header{border-bottom:3px solid #0891b2;padding-bottom:20px;margin-bottom:30px}.header h1{color:#0891b2;font-size:24px}.header p{color:#64748b;font-size:12px;margin-top:4px}.meta{display:flex;gap:40px;margin-bottom:30px;flex-wrap:wrap}.meta-item{}.meta-label{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;font-weight:700}.meta-value{font-size:14px;font-weight:600;color:#1e293b;margin-top:2px}.exam{margin-bottom:16px;padding:12px 16px;border:1px solid #e2e8f0;border-radius:8px}.exam-name{font-size:14px;font-weight:600;color:#1e293b}.exam-notes{font-size:12px;color:#64748b;margin-top:4px}.footer{margin-top:40px;padding-top:20px;border-top:1px solid #e2e8f0;text-align:center}.footer p{font-size:10px;color:#94a3b8}@media print{body{padding:20px}}</style></head><body><div class="header"><h1>Delta</h1><p>Prescripción de Exámenes</p></div><div class="meta"><div class="meta-item"><div class="meta-label">Paciente</div><div class="meta-value">${selected.patient_name}</div></div><div class="meta-item"><div class="meta-label">Código</div><div class="meta-value">${selected.consultation_code}</div></div><div class="meta-item"><div class="meta-label">Fecha</div><div class="meta-value">${new Date(selected.consultation_date).toLocaleDateString('es-VE', { year: 'numeric', month: 'long', day: 'numeric' })}</div></div></div><h3 style="font-size:14px;color:#0891b2;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e2e8f0;padding-bottom:8px;margin-bottom:16px">Exámenes solicitados</h3>${exams.map((e, i) => `<div class="exam"><div class="exam-name">${i + 1}. ${e.exam_name}</div>${e.notes ? `<div class="exam-notes">${e.notes}</div>` : ''}</div>`).join('')}<div class="footer"><p>Documento generado por Delta · ${new Date().toLocaleDateString('es-VE')}</p></div><script>window.onload=function(){window.print()}</script></body></html>`
                          printWindow.document.write(htmlContent)
                          printWindow.document.close()
                        }}
                          className="flex items-center justify-center gap-2 border border-slate-300 px-4 py-2.5 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50">
                          <Printer className="w-4 h-4" /> PDF
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Reposo Tab (NEW) */}
                {consultationTab === 'reposo' && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                      <FileText className="w-4 h-4 text-slate-400" />
                      <p className="text-sm font-bold text-slate-800">Constancia de reposo</p>
                    </div>
                    <div>
                      <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1.5">
                        <FileText className="w-3.5 h-3.5 text-slate-400" /> Diagnóstico
                      </label>
                      <input type="text" placeholder="Diagnóstico para el reposo" value={reposoDiagnosis}
                        onChange={e => setReposoDiagnosis(e.target.value)} className={fi} />
                    </div>
                    <div>
                      <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400" /> Días de reposo
                      </label>
                      <input type="number" placeholder="0" min="0" value={reposoDays}
                        onChange={e => {
                          const days = parseInt(e.target.value) || 0
                          setReposoDays(days)
                          if (reposoFrom) {
                            const fromDate = new Date(reposoFrom)
                            const toDate = new Date(fromDate)
                            toDate.setDate(toDate.getDate() + days)
                            setReposoTo(toDate.toISOString().split('T')[0])
                          }
                        }}
                        className={fi} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" /> Desde
                        </label>
                        <input type="date" value={reposoFrom}
                          onChange={e => {
                            setReposoFrom(e.target.value)
                            if (reposoDays > 0) {
                              const fromDate = new Date(e.target.value)
                              const toDate = new Date(fromDate)
                              toDate.setDate(toDate.getDate() + reposoDays)
                              setReposoTo(toDate.toISOString().split('T')[0])
                            }
                          }}
                          className={fi} />
                      </div>
                      <div>
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" /> Hasta
                        </label>
                        <input type="date" value={reposoTo} disabled className={fi + ' opacity-60'} />
                      </div>
                    </div>
                    <button onClick={() => {
                      if (!reposoFrom || !reposoDiagnosis || reposoDays === 0) {
                        alert('Completa todos los campos')
                        return
                      }
                      const printWindow = window.open('', '_blank')
                      if (!printWindow) return
                      const htmlContent = `<!DOCTYPE html><html><head><title>Reposo - ${selected.consultation_code}</title><style>*{margin:0;padding:0;box-sizing:border-box;font-family:'Segoe UI',Arial,sans-serif}body{padding:40px;color:#1e293b;line-height:1.6}.header{border-bottom:3px solid #0891b2;padding-bottom:20px;margin-bottom:30px}.header h1{color:#0891b2;font-size:24px}.header p{color:#64748b;font-size:12px;margin-top:4px}.meta{display:flex;gap:40px;margin-bottom:30px;flex-wrap:wrap}.meta-item{}.meta-label{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;font-weight:700}.meta-value{font-size:14px;font-weight:600;color:#1e293b;margin-top:2px}.section{margin-bottom:24px}.section-title{font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#0891b2;font-weight:700;border-bottom:1px solid #e2e8f0;padding-bottom:8px;margin-bottom:12px}.section-content{font-size:13px;color:#334155}.footer{margin-top:40px;padding-top:20px;border-top:1px solid #e2e8f0;text-align:center}.footer p{font-size:10px;color:#94a3b8}@media print{body{padding:20px}}</style></head><body><div class="header"><h1>Delta</h1><p>Constancia de Reposo</p></div><div class="meta"><div class="meta-item"><div class="meta-label">Paciente</div><div class="meta-value">${selected.patient_name}</div></div><div class="meta-item"><div class="meta-label">Código</div><div class="meta-value">${selected.consultation_code}</div></div><div class="meta-item"><div class="meta-label">Fecha emisión</div><div class="meta-value">${new Date(selected.consultation_date).toLocaleDateString('es-VE', { year: 'numeric', month: 'long', day: 'numeric' })}</div></div></div><div class="section"><div class="section-title">Diagnóstico</div><div class="section-content">${reposoDiagnosis}</div></div><div class="section"><div class="section-title">Período de Reposo</div><div class="section-content">Desde: ${new Date(reposoFrom).toLocaleDateString('es-VE', { year: 'numeric', month: 'long', day: 'numeric' })}<br>Hasta: ${new Date(reposoTo).toLocaleDateString('es-VE', { year: 'numeric', month: 'long', day: 'numeric' })}<br>Duración: ${reposoDays} días</div></div><div class="footer"><p>Documento generado por Delta · ${new Date().toLocaleDateString('es-VE')}</p></div><script>window.onload=function(){window.print()}</script></body></html>`
                      printWindow.document.write(htmlContent)
                      printWindow.document.close()
                    }}
                      className="w-full flex items-center justify-center gap-2 g-bg px-4 py-2.5 rounded-xl text-sm font-bold text-white hover:opacity-90">
                      <Printer className="w-4 h-4" /> Generar PDF Reposo
                    </button>
                  </div>
                )}

                {/* Notas Tab */}
                {consultationTab === 'notas' && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                      <FileText className="w-4 h-4 text-slate-400" />
                      <p className="text-sm font-bold text-slate-800">Notas internas</p>
                    </div>
                    <p className="text-xs text-slate-500">Notas privadas del médico sobre esta consulta. No se incluyen en documentos del paciente.</p>
                    <RichTextEditor value={report.diagnosis} onChange={html => setReport(p => ({ ...p, diagnosis: html }))}
                      placeholder="Notas internas, observaciones, seguimiento pendiente..." />
                  </div>
                )}
              </div>
            </div>

            {/* AI Assistant Panel */}
            <div className="bg-gradient-to-br from-violet-50 to-blue-50 border border-violet-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800">Asistente IA</p>
                  <p className="text-[10px] text-slate-500">Powered by Gemini</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  onClick={() => callAI('summarize', report.notes || report.diagnosis)}
                  disabled={aiLoading || (!report.notes && !report.diagnosis)}
                  className="flex items-center gap-2 px-3 py-2.5 bg-white border border-violet-200 rounded-xl text-xs font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  {aiLoading && aiAction === 'summarize' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                  Resumir informe
                </button>

                <button
                  onClick={() => {
                    const activeContent = consultationTab === 'recipe' ? report.treatment
                      : report.notes
                    callAI('improve', activeContent)
                  }}
                  disabled={aiLoading || (!report.notes && !report.treatment)}
                  className="flex items-center gap-2 px-3 py-2.5 bg-white border border-violet-200 rounded-xl text-xs font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  {aiLoading && aiAction === 'improve' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                  Mejorar redacción
                </button>

                <button
                  onClick={() => callAI('patient_history')}
                  disabled={aiLoading}
                  className="flex items-center gap-2 px-3 py-2.5 bg-white border border-violet-200 rounded-xl text-xs font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  {aiLoading && aiAction === 'patient_history' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <History className="w-3.5 h-3.5" />}
                  Historial paciente
                </button>
              </div>

              {/* AI Result */}
              {(aiResult || aiLoading) && (
                <div className="bg-white border border-violet-100 rounded-xl p-4 space-y-3">
                  {aiLoading ? (
                    <div className="flex items-center gap-2 text-sm text-violet-600">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Analizando con IA...</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-bold text-violet-700 uppercase tracking-wide">
                          {aiAction === 'summarize' ? 'Resumen del informe' : aiAction === 'improve' ? 'Texto mejorado' : 'Historial del paciente'}
                        </p>
                        <div className="flex gap-1">
                          {aiAction === 'improve' && (
                            <button
                              onClick={() => {
                                if (consultationTab === 'recipe') {
                                  setReport(p => ({ ...p, treatment: aiResult }))
                                } else {
                                  setReport(p => ({ ...p, notes: aiResult }))
                                }
                                setAiResult('')
                              }}
                              className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-violet-100 text-violet-700 hover:bg-violet-200 transition-colors"
                            >
                              Aplicar
                            </button>
                          )}
                          <button
                            onClick={() => { navigator.clipboard.writeText(aiResult) }}
                            className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors flex items-center gap-1"
                          >
                            <Copy className="w-3 h-3" /> Copiar
                          </button>
                          <button
                            onClick={() => setAiResult('')}
                            className="text-slate-400 hover:text-slate-600 p-1"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{aiResult}</div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Saved to EHR note */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-start gap-3">
              <CheckCircle className="w-4 h-4 text-teal-500 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-600">Al guardar, el informe queda registrado en el <strong>historial clínico</strong> del paciente y en las finanzas del consultorio.</p>
            </div>
          </div>

          {/* Right Sidebar Toggle (when hidden) */}
          {!showRightSidebar && (
            <button onClick={() => setShowRightSidebar(true)}
              className="hidden lg:flex fixed right-4 top-24 z-30 items-center justify-center w-10 h-10 bg-white border border-slate-200 rounded-xl shadow-sm hover:bg-slate-50 hover:shadow-md transition-all"
              title={selected.patient_name}>
              <User className="w-4 h-4 text-teal-500" />
            </button>
          )}

          {/* Right Sidebar — Patient + Consultation Info */}
          {showRightSidebar && (
          <div className="lg:w-80 space-y-0 shrink-0">
            <div className="bg-white border border-slate-200 rounded-xl p-5 sticky top-20">
              {/* Header with hide button */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl g-bg flex items-center justify-center shrink-0">
                  <User className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-900">{selected.patient_name}</p>
                  <p className="text-xs text-slate-400 font-mono">{selected.consultation_code}</p>
                </div>
                <button onClick={() => setShowRightSidebar(false)}
                  className="hidden lg:flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all"
                  title="Ocultar panel">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Consultation info */}
              <div className="space-y-2.5 text-xs border-t border-slate-100 pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Fecha</span>
                  <span className="font-semibold text-slate-800">{cDate.toLocaleDateString('es-VE', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Hora</span>
                  <span className="font-semibold text-slate-800">{cDate.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Estado</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isUpcoming ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-500'}`}>
                    {isUpcoming ? 'Próxima' : 'Realizada'}
                  </span>
                </div>
              </div>

              {/* Patient details */}
              {(() => {
                const patientData = patients.find(p => p.id === selected.patient_id)
                const details = [
                  patientData?.cedula && { label: 'Cédula', value: patientData.cedula },
                  patientData?.age && { label: 'Edad', value: `${patientData.age} años` },
                  patientData?.sex && { label: 'Sexo', value: patientData.sex === 'male' ? 'Masculino' : patientData.sex === 'female' ? 'Femenino' : patientData.sex },
                  selected.patient_phone && { label: 'Teléfono', value: selected.patient_phone },
                  patientData?.email && { label: 'Email', value: patientData.email },
                  patientData?.blood_type && { label: 'Sangre', value: patientData.blood_type },
                ].filter(Boolean) as { label: string; value: string }[]

                return details.length > 0 ? (
                  <div className="space-y-2 text-xs border-t border-slate-100 pt-3 mt-3">
                    {details.map(d => (
                      <div key={d.label} className="flex items-center justify-between">
                        <span className="text-slate-500">{d.label}</span>
                        <span className="font-semibold text-slate-800 text-right break-all max-w-[55%]">{d.value}</span>
                      </div>
                    ))}
                  </div>
                ) : null
              })()}

              {/* Medical alerts */}
              {(() => {
                const patientData = patients.find(p => p.id === selected.patient_id)
                const hasAlerts = patientData?.allergies || patientData?.chronic_conditions
                return hasAlerts ? (
                  <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-1.5">
                    {patientData.allergies && (
                      <div className="flex items-start gap-1.5 text-xs text-amber-800">
                        <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                        <span><strong>Alergias:</strong> {patientData.allergies}</span>
                      </div>
                    )}
                    {patientData.chronic_conditions && (
                      <div className="flex items-start gap-1.5 text-xs text-amber-800">
                        <Heart className="w-3 h-3 shrink-0 mt-0.5" />
                        <span><strong>Condiciones:</strong> {patientData.chronic_conditions}</span>
                      </div>
                    )}
                  </div>
                ) : null
              })()}

              {/* Payment — collapsible */}
              <div className="border-t border-slate-100 mt-3 pt-3">
                <button onClick={() => setShowPaymentDetails(!showPaymentDetails)}
                  className="w-full flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-bold text-slate-600 uppercase">Pago</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${ps.color}`}>
                      <span className={`w-1 h-1 rounded-full ${ps.dot}`} />{ps.label}
                    </span>
                    {showPaymentDetails ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                  </div>
                </button>
                {showPaymentDetails && (
                  <div className="mt-3 space-y-2">
                    {(Object.entries(PAYMENT_STATUS) as [Consultation['payment_status'], typeof PAYMENT_STATUS.unpaid][]).map(([key, val]) => (
                      <button key={key} onClick={() => setReport(p => ({ ...p, payment_status: key }))}
                        className={`w-full text-left py-2 px-3 rounded-lg text-xs font-bold border-2 transition-all ${report.payment_status === key ? val.color + ' border-current' : 'border-slate-200 text-slate-500 bg-white hover:bg-slate-50'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full inline-block mr-2 ${report.payment_status === key ? val.dot : 'bg-slate-300'}`} />{val.label}
                      </button>
                    ))}
                    {appointmentData && (appointmentData.payment_method || appointmentData.plan_price) && (
                      <div className="pt-2 border-t border-slate-100 space-y-1.5 text-xs">
                        {appointmentData.plan_name && (
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500">Plan:</span>
                            <span className="font-semibold text-slate-800">{appointmentData.plan_name}</span>
                          </div>
                        )}
                        {appointmentData.plan_price != null && (
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500">Monto:</span>
                            <span className="font-semibold text-slate-800">${appointmentData.plan_price.toFixed(2)}</span>
                          </div>
                        )}
                        {appointmentData.payment_method && (
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500">Método:</span>
                            <span className="font-semibold text-slate-800">{appointmentData.payment_method.replace(/_/g, ' ')}</span>
                          </div>
                        )}
                      </div>
                    )}
                    {appointmentData?.payment_receipt_url && (
                      <a href={appointmentData.payment_receipt_url} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 pt-1">
                        <FileText className="w-3 h-3" /> Ver comprobante
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          )}
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
                <RichTextEditor value={recipe.notes} onChange={html => setRecipe(p => ({ ...p, notes: html }))}
                  placeholder="Ej: Tomar con comida, evitar sol..." />
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
                    {c.payment_status !== 'unpaid' && <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full hidden sm:inline-block" title="Comprobante registrado">Con comprobante</span>}
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

function RichTextEditor({ value, onChange, placeholder }: { value: string; onChange: (html: string) => void; placeholder?: string }) {
  const editorRef = useRef<HTMLDivElement>(null)
  const [isActive, setIsActive] = useState(false)
  const initializedRef = useRef(false)

  // Set initial content when value changes externally (e.g., opening a consultation)
  useEffect(() => {
    if (editorRef.current && !isActive) {
      // Only update if the editor content differs from the prop value
      const currentHTML = editorRef.current.innerHTML
      const isEmpty = !currentHTML || currentHTML === '<br>' || currentHTML.startsWith('<span class="text-slate-400">')
      if (value && (isEmpty || !initializedRef.current)) {
        editorRef.current.innerHTML = value
        initializedRef.current = true
      } else if (!value && !isActive) {
        editorRef.current.innerHTML = ''
        initializedRef.current = false
      }
    }
  }, [value, isActive])

  const execCommand = (command: string, value?: string) => {
    document.execCommand(command, false, value)
    if (editorRef.current) onChange(editorRef.current.innerHTML)
  }

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-slate-200 bg-slate-50 flex-wrap">
        <button type="button" onClick={() => execCommand('bold')} className="w-8 h-8 rounded-lg hover:bg-slate-200 flex items-center justify-center font-bold text-sm transition-colors" title="Negrita (Ctrl+B)">B</button>
        <button type="button" onClick={() => execCommand('italic')} className="w-8 h-8 rounded-lg hover:bg-slate-200 flex items-center justify-center italic text-sm transition-colors" title="Cursiva (Ctrl+I)">I</button>
        <button type="button" onClick={() => execCommand('underline')} className="w-8 h-8 rounded-lg hover:bg-slate-200 flex items-center justify-center underline text-sm transition-colors" title="Subrayado (Ctrl+U)">U</button>
        <div className="w-px h-5 bg-slate-200 mx-1" />
        <button type="button" onClick={() => execCommand('insertUnorderedList')} className="w-8 h-8 rounded-lg hover:bg-slate-200 flex items-center justify-center text-sm transition-colors" title="Lista de puntos">•</button>
        <button type="button" onClick={() => execCommand('insertOrderedList')} className="w-8 h-8 rounded-lg hover:bg-slate-200 flex items-center justify-center text-sm transition-colors" title="Lista numerada">1.</button>
        <div className="w-px h-5 bg-slate-200 mx-1" />
        <label className="w-8 h-8 rounded-lg hover:bg-slate-200 flex items-center justify-center cursor-pointer transition-colors" title="Color de texto">
          <span className="text-sm font-semibold text-slate-600">A</span>
          <input type="color" className="w-0 h-0 opacity-0" onChange={e => execCommand('foreColor', e.target.value)} />
        </label>
        <button type="button" onClick={() => execCommand('removeFormat')} className="w-8 h-8 rounded-lg hover:bg-slate-200 flex items-center justify-center text-xs text-slate-400 transition-colors" title="Limpiar formato">✕</button>
      </div>
      {/* Editor area */}
      <div
        ref={editorRef}
        contentEditable
        className="min-h-[300px] px-4 py-3 text-sm text-slate-800 outline-none"
        style={{ touchAction: 'auto' }}
        onInput={() => { if (editorRef.current) onChange(editorRef.current.innerHTML) }}
        onFocus={() => setIsActive(true)}
        onBlur={() => setIsActive(false)}
        suppressContentEditableWarning={true}
        data-placeholder={placeholder}
      />
      <style>{`[data-placeholder]:empty:not(:focus):before { content: attr(data-placeholder); color: #94a3b8; pointer-events: none; }`}</style>
    </div>
  )
}

const fi = 'w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 bg-white transition-colors'
