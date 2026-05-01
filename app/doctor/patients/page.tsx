'use client'

import { useState, useEffect, useTransition } from 'react'
import {
  Users, Plus, Search, Phone, Mail, FileText, X, ChevronRight, ChevronDown,
  ArrowLeft, Save, CheckCircle, Clock, AlertCircle, MessageCircle,
  Filter, User, Edit3, Hash, Zap, Calendar, Droplet, Heart, AlertTriangle, UserCheck, Image as ImageIcon, Upload,
  Sparkles, Loader2, Send, FolderHeart, ExternalLink, Pencil, Trash2, ClipboardList
} from 'lucide-react'
import { getPatients, addPatient, updatePatient, getDoctorId, getConsultations, createConsultation, updateConsultationStatus, updateConsultationNotes, type Patient, type Consultation } from './actions'
import { createClient } from '@/lib/supabase/client'
import NewAppointmentFlow from '@/components/appointment-flow/NewAppointmentFlow'
import PatientForm, { type PatientFormData } from '@/components/patient/PatientForm'
// RONDA 40: componente compartido de drag & drop
import UploadDropZone from '@/components/shared/UploadDropZone'
// RONDA 46: renderer de markdown ligero para outputs de Gemini
import MarkdownText from '@/components/shared/MarkdownText'
// AUDIT FIX 2026-04-28 (C-9): sanitizer para HTML rich-text (defense-in-depth).
import { sanitizeHtml } from '@/lib/sanitize-html'

interface PatientPackageInfo {
  patientId: string
  pendingSessions: number
  totalSessions: number
  usedSessions: number
}

// Estados de PAGO: solo 2 — Pendiente | Aprobado. No existe "Cancelado" ni "Rechazado".
const PAYMENT_STATUS = {
  pending:  { label: 'Pendiente', color: 'bg-amber-100 text-amber-700',     icon: <Clock className="w-3 h-3" /> },
  approved: { label: 'Aprobado',  color: 'bg-emerald-100 text-emerald-700', icon: <CheckCircle className="w-3 h-3" /> },
  // Aliases legacy (mapean a pending para datos viejos)
  unpaid:            { label: 'Pendiente', color: 'bg-amber-100 text-amber-700', icon: <Clock className="w-3 h-3" /> },
  pending_approval:  { label: 'Pendiente', color: 'bg-amber-100 text-amber-700', icon: <Clock className="w-3 h-3" /> },
  cancelled:         { label: 'Pendiente', color: 'bg-amber-100 text-amber-700', icon: <Clock className="w-3 h-3" /> },
}

const SOURCE_LABELS: Record<string, string> = { manual: 'Manual', invitation: 'Invitación', whatsapp: 'WhatsApp', consultorio: 'Consultorio', redes_sociales: 'Redes Sociales', seguro: 'Seguro', otro: 'Otro' }

const CHANNEL_OPTIONS = [
  { value: 'consultorio', label: 'Consultorio' },
  { value: 'redes_sociales', label: 'Redes Sociales' },
  { value: 'seguro', label: 'Seguro' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'invitation', label: 'Invitación' },
  { value: 'otro', label: 'Otro' },
]

type View = 'list' | 'detail' | 'new-consultation'
// RONDA 40: nueva pestaña "Seguimiento" (Shared Health Space)
type DetailTab = 'consultas' | 'historial' | 'seguimiento'

export default function PatientsPage() {
  const [doctorId, setDoctorId] = useState<string | null>(null)
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [view, setView] = useState<View>('list')
  const [selected, setSelected] = useState<Patient | null>(null)
  const [consultations, setConsultations] = useState<Consultation[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [filterSource, setFilterSource] = useState<string>('all')
  const [detailTab, setDetailTab] = useState<DetailTab>('consultas')
  const [isPending, startTransition] = useTransition()
  // Historial Médico — consulta seleccionada en sidebar (default: la más reciente)
  const [selectedConsultaId, setSelectedConsultaId] = useState<string | null>(null)
  // Resumen IA del paciente (Gemini)
  const [aiSummary, setAiSummary] = useState<string>('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  // RONDA 40: estado del modulo Seguimiento (shared_files)
  const [sharedFiles, setSharedFiles] = useState<import('@/lib/shared-files').SharedFile[]>([])
  const [sharedLoading, setSharedLoading] = useState(false)
  const [unreadByPatient, setUnreadByPatient] = useState<Record<string, number>>({})
  const [newInstructionTitle, setNewInstructionTitle] = useState('')
  const [newInstructionDesc, setNewInstructionDesc] = useState('')
  const [savingInstruction, setSavingInstruction] = useState(false)
  const [doctorUploadModal, setDoctorUploadModal] = useState(false)
  const [doctorUploadTitle, setDoctorUploadTitle] = useState('')
  const [doctorUploadDesc, setDoctorUploadDesc] = useState('')
  // RONDA 43: estado para editar tarea/archivo existente
  const [editingFile, setEditingFile] = useState<import('@/lib/shared-files').SharedFile | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [savingEditFile, setSavingEditFile] = useState(false)
  // Modal NewAppointmentFlow unificado (reemplaza la vista inline new-consultation)
  const [showNewAppointmentFlow, setShowNewAppointmentFlow] = useState(false)
  // RONDA 19b: PatientForm unificado para crear y editar
  const [patientFormOpen, setPatientFormOpen] = useState(false)
  const [patientFormInitial, setPatientFormInitial] = useState<PatientFormData | null>(null)
  const [patientFormSaving, setPatientFormSaving] = useState(false)

  // Edit patient
  const [editing, setEditing] = useState(false)
  const [editPat, setEditPat] = useState({ full_name: '', age: '', birth_date: '', phone: '', cedula: '', email: '', sex: '', notes: '', blood_type: '', allergies: '', chronic_conditions: '', emergency_contact_name: '', emergency_contact_phone: '', address: '', city: '', source: '' })
  const [editError, setEditError] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  // New patient form
  const [newPat, setNewPat] = useState({ full_name: '', age: '', birth_date: '', phone: '', cedula: '', email: '', sex: '', notes: '', source: '' })

  // Auto-calculate age from birth_date
  const calcAgeFromBirthDate = (dateStr: string): string => {
    if (!dateStr) return ''
    const birth = new Date(dateStr)
    const today = new Date()
    let age = today.getFullYear() - birth.getFullYear()
    const m = today.getMonth() - birth.getMonth()
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
    return age >= 0 ? String(age) : ''
  }
  const [patError, setPatError] = useState('')

  // New consultation form
  const [newConsult, setNewConsult] = useState({ chief_complaint: '', notes: '', diagnosis: '', treatment: '', payment_status: 'pending' as 'pending' | 'approved', plan_id: '', payment_method: '', payment_reference: '' })
  const [consultError, setConsultError] = useState('')
  const [consultSuccess, setConsultSuccess] = useState('')
  const [packageInfo, setPackageInfo] = useState<Record<string, PatientPackageInfo>>({})

  // Pricing plans + payment methods for new consultation
  const [pricingPlans, setPricingPlans] = useState<{ id: string; name: string; price_usd: number; duration_minutes: number }[]>([])
  const [doctorPaymentMethods, setDoctorPaymentMethods] = useState<string[]>([])
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [uploadingReceipt, setUploadingReceipt] = useState(false)

  const PAYMENT_METHODS = [
    { value: 'efectivo', label: 'Efectivo USD' },
    { value: 'efectivo_bs', label: 'Efectivo Bs' },
    { value: 'pago_movil', label: 'Pago Móvil' },
    { value: 'transferencia', label: 'Transferencia' },
    { value: 'zelle', label: 'Zelle' },
    { value: 'binance', label: 'Binance' },
    { value: 'pos', label: 'POS / Punto de venta' },
    { value: 'seguro', label: 'Seguro' },
  ]

  const requiresReceipt = (method: string) => !['efectivo', 'efectivo_bs', 'pos', ''].includes(method)

  useEffect(() => {
    getDoctorId().then(async (id) => {
      if (!id) return
      setDoctorId(id)
      getPatients(id).then(p => { setPatients(p); setLoading(false) })

      // Load package info
      loadPackageInfo(id)

      // RONDA 40: cargar contadores de archivos no leidos por doctor
      // (para badge verde en la lista de pacientes)
      loadUnreadCounts(id)

      // Load pricing plans and payment methods
      const supabase = createClient()
      const { data: plans } = await supabase
        .from('pricing_plans')
        .select('id, name, price_usd, duration_minutes')
        .eq('doctor_id', id)
        .eq('is_active', true)
        .order('price_usd')
      setPricingPlans(plans || [])

      const { data: profileData } = await supabase
        .from('profiles')
        .select('payment_methods')
        .eq('id', id)
        .single()
      if (profileData?.payment_methods && Array.isArray(profileData.payment_methods)) {
        setDoctorPaymentMethods(profileData.payment_methods)
      }
    })
  }, [])

  async function loadPackageInfo(docId: string) {
    try {
      const supabase = createClient()
      const { data: pkgs } = await supabase
        .from('patient_packages')
        .select('patient_id, total_sessions, used_sessions')
        .eq('doctor_id', docId)
        .eq('status', 'active')

      const pkgMap: Record<string, PatientPackageInfo> = {}
      if (pkgs) {
        pkgs.forEach(pkg => {
          const pending = pkg.total_sessions - pkg.used_sessions
          pkgMap[pkg.patient_id] = {
            patientId: pkg.patient_id,
            pendingSessions: pending,
            totalSessions: pkg.total_sessions,
            usedSessions: pkg.used_sessions
          }
        })
      }
      setPackageInfo(pkgMap)
    } catch (err) {
      console.error('Error loading package info:', err)
    }
  }

  function startEditPatient(p: Patient) {
    setEditPat({
      full_name: p.full_name || '',
      age: p.age ? String(p.age) : '',
      birth_date: p.birth_date || '',
      phone: p.phone || '',
      cedula: p.cedula || '',
      email: p.email || '',
      sex: p.sex || '',
      notes: p.notes || '',
      blood_type: p.blood_type || '',
      allergies: p.allergies || '',
      chronic_conditions: p.chronic_conditions || '',
      emergency_contact_name: p.emergency_contact_name || '',
      emergency_contact_phone: p.emergency_contact_phone || '',
      address: p.address || '',
      city: p.city || '',
      source: p.source || '',
    })
    setEditError('')
    setEditing(true)
  }

  async function handleSaveEdit() {
    if (!selected || !doctorId) return
    if (!editPat.full_name.trim()) { setEditError('El nombre es obligatorio'); return }
    setSavingEdit(true)
    setEditError('')
    try {
      const res = await updatePatient(selected.id, doctorId, {
        full_name: editPat.full_name,
        age: editPat.age ? parseInt(editPat.age) : null,
        birth_date: editPat.birth_date || null,
        phone: editPat.phone || null,
        cedula: editPat.cedula || null,
        email: editPat.email || null,
        sex: editPat.sex || null,
        notes: editPat.notes || null,
        blood_type: editPat.blood_type || null,
        allergies: editPat.allergies || null,
        chronic_conditions: editPat.chronic_conditions || null,
        emergency_contact_name: editPat.emergency_contact_name || null,
        emergency_contact_phone: editPat.emergency_contact_phone || null,
        address: editPat.address || null,
        city: editPat.city || null,
        source: editPat.source || null,
      })
      if (!res.success) { setEditError(res.error); setSavingEdit(false); return }
      // Update local state
      const updated = { ...selected, ...editPat, age: editPat.age ? parseInt(editPat.age) : null }
      setSelected(updated as Patient)
      setPatients(prev => prev.map(p => p.id === selected.id ? updated as Patient : p))
      setEditing(false)
    } catch (err: any) {
      setEditError(err?.message || 'Error al guardar')
    }
    setSavingEdit(false)
  }

  function openPatient(p: Patient) {
    setSelected(p)
    setView('detail')
    setConsultations([])
    setSelectedConsultaId(null)
    setAiSummary('')
    setAiError('')
    setSharedFiles([])
    getConsultations(p.id).then(list => {
      setConsultations(list)
      // Auto-select la mas reciente (primera del array, ordenada DESC en getConsultations)
      if (list.length > 0) setSelectedConsultaId(list[0].id)
    })
    // RONDA 40: cargar shared_files del paciente
    loadSharedFiles(p.id)
  }

  // RONDA 40: helpers del modulo Seguimiento
  async function loadSharedFiles(patientId: string) {
    setSharedLoading(true)
    try {
      const { listSharedFiles } = await import('@/lib/shared-files')
      const supabase = (await import('@/lib/supabase/client')).createClient()
      const rows = await listSharedFiles(supabase, { patientId })
      setSharedFiles(rows)
    } catch (err) {
      console.error('[loadSharedFiles]', err)
    } finally {
      setSharedLoading(false)
    }
  }

  async function loadUnreadCounts(currentDoctorId: string) {
    try {
      const { countUnreadByDoctorPerPatient } = await import('@/lib/shared-files')
      const supabase = (await import('@/lib/supabase/client')).createClient()
      const counts = await countUnreadByDoctorPerPatient(supabase, currentDoctorId)
      setUnreadByPatient(counts)
    } catch (err) {
      console.error('[loadUnreadCounts]', err)
    }
  }

  // RONDA 19b — handler UNICO para PatientForm. UPDATE si data.id existe, INSERT si no.
  async function handlePatientSubmit(formData: PatientFormData) {
    if (!doctorId) return
    setPatientFormSaving(true)
    try {
      if (formData.id) {
        // EDIT — UPDATE
        const res = await updatePatient(formData.id, doctorId, {
          full_name: formData.full_name,
          age: formData.age ?? null,
          birth_date: formData.birth_date ?? null,
          phone: formData.phone ?? null,
          cedula: formData.cedula ?? null,
          email: formData.email ?? null,
          sex: formData.sex ?? null,
          notes: formData.notes ?? null,
          blood_type: formData.blood_type ?? null,
          allergies: formData.allergies ?? null,
          chronic_conditions: formData.chronic_conditions ?? null,
          emergency_contact_name: formData.emergency_contact_name ?? null,
          emergency_contact_phone: formData.emergency_contact_phone ?? null,
          address: formData.address ?? null,
          city: formData.city ?? null,
        })
        if (!res.success) throw new Error(res.error || 'Error al actualizar')
        // Sincronizar local
        setPatients(prev => prev.map(p => p.id === formData.id ? { ...p, ...formData } as Patient : p))
        if (selected?.id === formData.id) setSelected({ ...selected, ...formData } as Patient)
      } else {
        // CREATE — INSERT
        const res = await addPatient(doctorId, {
          full_name: formData.full_name,
          age: formData.age ?? undefined,
          birth_date: formData.birth_date ?? undefined,
          phone: formData.phone ?? undefined,
          cedula: formData.cedula ?? undefined,
          email: formData.email ?? undefined,
          sex: formData.sex ?? undefined,
          notes: formData.notes ?? undefined,
          blood_type: formData.blood_type ?? undefined,
          allergies: formData.allergies ?? undefined,
          chronic_conditions: formData.chronic_conditions ?? undefined,
          emergency_contact_name: formData.emergency_contact_name ?? undefined,
          emergency_contact_phone: formData.emergency_contact_phone ?? undefined,
          address: formData.address ?? undefined,
          city: formData.city ?? undefined,
          source: 'manual',
        })
        if (!res.success) throw new Error(res.error || 'Error al crear')
        // Recargar lista
        getPatients(doctorId).then(setPatients)
      }
      setPatientFormOpen(false)
      setPatientFormInitial(null)
    } catch (err: any) {
      // Re-throw para que PatientForm lo muestre como error
      throw err
    } finally {
      setPatientFormSaving(false)
    }
  }

  function handleAddPatient(e: React.FormEvent) {
    e.preventDefault()
    if (!newPat.full_name.trim()) { setPatError('El nombre es obligatorio'); return }
    if (!doctorId) return
    setPatError('')
    startTransition(async () => {
      const res = await addPatient(doctorId, {
        full_name: newPat.full_name,
        age: newPat.age ? parseInt(newPat.age) : undefined,
        birth_date: newPat.birth_date || undefined,
        phone: newPat.phone || undefined,
        cedula: newPat.cedula || undefined,
        email: newPat.email || undefined,
        sex: newPat.sex || undefined,
        notes: newPat.notes || undefined,
        source: newPat.source || 'manual',
      })
      if (!res.success) { setPatError(res.error); return }
      setShowAddModal(false)
      setNewPat({ full_name: '', age: '', birth_date: '', phone: '', cedula: '', email: '', sex: '', notes: '', source: '' })
      if (doctorId) getPatients(doctorId).then(setPatients)
    })
  }

  async function handleCreateConsultation(e: React.FormEvent) {
    e.preventDefault()
    if (!selected || !doctorId) return
    if (!newConsult.chief_complaint.trim()) { setConsultError('Ingresa el motivo de consulta'); return }
    setConsultError('')
    setUploadingReceipt(true)

    try {
      // Find selected plan details
      const selectedPlan = pricingPlans.find(p => p.id === newConsult.plan_id)
      const planAmount = selectedPlan?.price_usd || 0
      const planName = selectedPlan?.name || ''

      // Upload receipt if provided
      let receiptUrl: string | null = null
      if (receiptFile) {
        const supabase = createClient()
        const ext = receiptFile.name.split('.').pop()
        const path = `${doctorId}/${selected.id}/${Date.now()}.${ext}`
        const { error: uploadErr } = await supabase.storage.from('payment-receipts').upload(path, receiptFile, { upsert: false })
        if (uploadErr) { setConsultError(`Error al subir comprobante: ${uploadErr.message}`); setUploadingReceipt(false); return }
        const { data: publicUrl } = supabase.storage.from('payment-receipts').getPublicUrl(path)
        receiptUrl = publicUrl.publicUrl
      }

      // Create consultation via API (auto-creates linked appointment)
      const res = await fetch('/api/doctor/consultations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: selected.id,
          chief_complaint: newConsult.chief_complaint,
          notes: newConsult.notes || null,
          amount: planAmount,
          plan_name: planName,
          payment_method: newConsult.payment_method || null,
          payment_reference: newConsult.payment_reference || null,
          payment_receipt_url: receiptUrl,
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Error al crear consulta')

      setConsultSuccess(`Consulta creada: ${result.code}`)
      setNewConsult({ chief_complaint: '', notes: '', diagnosis: '', treatment: '', payment_status: 'pending', plan_id: '', payment_method: '', payment_reference: '' })
      setReceiptFile(null)
      setView('detail')
      getConsultations(selected.id).then(setConsultations)
    } catch (err: any) {
      setConsultError(err?.message || 'Error al crear consulta')
    }
    setUploadingReceipt(false)
  }

  function handleStatusChange(consultId: string, status: 'pending' | 'approved') {
    startTransition(async () => {
      await updateConsultationStatus(consultId, status)
      if (selected) getConsultations(selected.id).then(setConsultations)
    })
  }

  const filtered = patients.filter(p => {
    const q = search.toLowerCase()
    const matchSearch = !q || p.full_name.toLowerCase().includes(q) || (p.phone ?? '').includes(q) || (p.cedula ?? '').includes(q)
    const matchSource = filterSource === 'all' || p.source === filterSource
    return matchSearch && matchSource
  })

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');* { font-family: 'Inter', sans-serif; }.g-bg{background:linear-gradient(135deg,#00C4CC 0%,#0891b2 100%)}`}</style>

      {/* ── LIST VIEW ── */}
      {view === 'list' && (
        <div className="max-w-5xl space-y-5">
          {/* Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex-1">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Pacientes</h1>
              <p className="text-sm text-slate-500">{patients.length} paciente{patients.length !== 1 ? 's' : ''} registrado{patients.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
              <a href="https://wa.me" target="_blank" rel="noreferrer" className="flex items-center justify-center sm:justify-start gap-2 px-4 py-2 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                <MessageCircle className="w-4 h-4 text-emerald-500" />
                <span>WhatsApp</span>
              </a>
              <button onClick={() => { setPatientFormInitial(null); setPatientFormOpen(true) }} className="g-bg flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-opacity">
                <Plus className="w-4 h-4" /> <span>Nuevo paciente</span>
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre, teléfono o cédula..." className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 bg-white" />
            </div>
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-3 shrink-0">
              <Filter className="w-4 h-4 text-slate-400 hidden sm:block" />
              <select value={filterSource} onChange={e => setFilterSource(e.target.value)} className="text-sm text-slate-600 outline-none bg-transparent py-2.5 pr-2 flex-1 sm:flex-none">
                <option value="all">Todos los canales</option>
                <option value="consultorio">Consultorio</option>
                <option value="redes_sociales">Redes Sociales</option>
                <option value="seguro">Seguro</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="invitation">Invitación</option>
                <option value="manual">Manual</option>
                <option value="otro">Otro</option>
              </select>
            </div>
          </div>

          {/* List */}
          {loading ? (
            <div className="flex items-center justify-center py-20 text-slate-400">
              <svg className="animate-spin w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              Cargando pacientes...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                <Users className="w-7 h-7 text-slate-300" />
              </div>
              <p className="text-slate-600 font-semibold">No hay pacientes aún</p>
              <p className="text-slate-400 text-sm mt-1">Agrega tu primer paciente manualmente o envía una invitación.</p>
              <button onClick={() => { setPatientFormInitial(null); setPatientFormOpen(true) }} className="mt-4 g-bg text-white px-4 py-2 rounded-xl text-sm font-semibold">
                Agregar paciente
              </button>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              {filtered.map((p, i) => {
                const pkg = packageInfo[p.id]
                return (
                <button key={p.id} onClick={() => openPatient(p)} className={`w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors text-left ${i < filtered.length - 1 ? 'border-b border-slate-100' : ''}`}>
                  <div className="w-9 h-9 rounded-full bg-teal-50 flex items-center justify-center shrink-0">
                    <span className="text-teal-600 font-bold text-sm">{p.full_name.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-900 text-sm truncate">{p.full_name}</p>
                      {/* RONDA 40: badge verde con punto pulsante si el paciente subio archivos no leidos */}
                      {(unreadByPatient[p.id] || 0) > 0 && (
                        <span title={`${unreadByPatient[p.id]} archivo(s) nuevo(s) del paciente`} className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 shrink-0 border border-emerald-300">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                          </span>
                          {unreadByPatient[p.id]} nuevo{unreadByPatient[p.id] !== 1 ? 's' : ''}
                        </span>
                      )}
                      {p.source && p.source !== 'manual' && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-50 text-teal-600">{SOURCE_LABELS[p.source] ?? p.source}</span>
                      )}
                      {pkg && pkg.pendingSessions > 0 && (
                        <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 shrink-0">
                          <Zap className="w-2.5 h-2.5" />
                          {pkg.pendingSessions} cita{pkg.pendingSessions !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      {p.phone && <span className="text-xs text-slate-400 flex items-center gap-1"><Phone className="w-3 h-3" />{p.phone}</span>}
                      {p.cedula && <span className="text-xs text-slate-400">{p.cedula}</span>}
                      {(() => { const a = getDisplayAge(p); return a != null ? <span className="text-xs text-slate-400">{a} años</span> : null })()}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                </button>
              )
              })}

            </div>
          )}
        </div>
      )}

      {/* ── DETAIL VIEW ── */}
      {view === 'detail' && selected && (
        <div className="max-w-3xl space-y-5">
          <div className="flex items-center gap-3">
            <button onClick={() => setView('list')} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-700 transition-colors">
              <ArrowLeft className="w-4 h-4" /> Pacientes
            </button>
          </div>

          {/* Patient card with profile info */}
          <div className="space-y-4">
            {/* Main patient header */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row items-start gap-4">
                <div className="w-16 h-16 rounded-xl bg-teal-50 flex items-center justify-center shrink-0 overflow-hidden">
                  {selected.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={selected.avatar_url} alt={selected.full_name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-teal-600 font-bold text-2xl">{selected.full_name.charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-bold text-slate-900 break-words">{selected.full_name}</h2>
                  <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-4 mt-2 text-sm text-slate-500">
                    {(() => {
                      const a = getDisplayAge(selected)
                      const sexo = selected.sex === 'female' ? 'Femenino' : selected.sex === 'male' ? 'Masculino' : ''
                      if (a == null && !sexo) return null
                      return (
                        <span className="flex items-center gap-1">
                          <User className="w-3.5 h-3.5" />
                          {a != null ? `${a} años` : ''}{a != null && sexo ? ' · ' : ''}{sexo}
                        </span>
                      )
                    })()}
                    {selected.phone && <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{selected.phone}</span>}
                    {selected.email && <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{selected.email}</span>}
                    {selected.cedula && <span className="flex items-center gap-1"><Hash className="w-3.5 h-3.5" />{selected.cedula}</span>}
                  </div>
                  {selected.notes && <p className="text-sm text-slate-400 mt-2 italic">{selected.notes}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {selected.auth_user_id ? (
                    <span className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-blue-50 text-blue-600 border border-blue-200">
                      <UserCheck className="w-3.5 h-3.5" /> Sincronizado
                    </span>
                  ) : (
                    <button
                      onClick={() => {
                        // RONDA 19b: usar PatientForm unificado en modo EDIT
                        setPatientFormInitial({
                          id: selected.id,
                          full_name: selected.full_name || '',
                          cedula: selected.cedula || '',
                          email: selected.email || '',
                          phone: selected.phone || '',
                          birth_date: selected.birth_date || '',
                          age: selected.age ?? null,
                          sex: (selected.sex as any) ?? '',
                          blood_type: selected.blood_type || '',
                          address: selected.address || '',
                          city: selected.city || '',
                          allergies: selected.allergies || '',
                          chronic_conditions: selected.chronic_conditions || '',
                          emergency_contact_name: selected.emergency_contact_name || '',
                          emergency_contact_phone: selected.emergency_contact_phone || '',
                          notes: selected.notes || '',
                        })
                        setPatientFormOpen(true)
                      }}
                      className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
                      title="Editar paciente"
                    >
                      <Edit3 className="w-4 h-4" /> <span className="hidden sm:inline">Editar</span>
                    </button>
                  )}
                  <button
                    onClick={() => { setShowNewAppointmentFlow(true); setConsultSuccess(''); setConsultError('') }}
                    className="g-bg flex items-center justify-center sm:justify-start gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white hover:opacity-90 sm:whitespace-nowrap"
                  >
                    <Plus className="w-4 h-4" /> <span>Nueva consulta</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Active packages / sessions card */}
            {packageInfo[selected.id] && packageInfo[selected.id].pendingSessions > 0 && (
              <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 sm:p-6">
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="w-4 h-4 text-violet-600" />
                  <h3 className="text-sm font-semibold text-violet-800">Paquete de sesiones activo</h3>
                </div>
                <div className="flex items-center gap-6">
                  <div>
                    <p className="text-3xl font-extrabold text-violet-700">{packageInfo[selected.id].pendingSessions}</p>
                    <p className="text-xs text-violet-500 font-medium mt-0.5">sesiones pagadas sin agendar</p>
                  </div>
                  <div className="flex-1">
                    <div className="w-full h-3 bg-violet-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-violet-500 rounded-full transition-all"
                        style={{ width: `${Math.max(5, ((packageInfo[selected.id].totalSessions - packageInfo[selected.id].pendingSessions) / packageInfo[selected.id].totalSessions) * 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-violet-400 mt-1">
                      {packageInfo[selected.id].totalSessions - packageInfo[selected.id].pendingSessions} de {packageInfo[selected.id].totalSessions} usadas
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ──────────────────────────────────────────────────────────
                2026-04-30: Rediseño UX/UI — secciones colapsables.
                Pattern Notion: cada sección es un accordion con:
                  • icono + título + lápiz para editar inline + chevron expand
                  • Siempre visibles (no se ocultan si están vacías). Si están
                    vacías muestran placeholder "Sin información — Editar".
                  • Por default: Datos personales abierta. Médicos y Emergencia
                    cerradas (menos críticas en vista rápida).
                ────────────────────────────────────────────────────────── */}

            <PatientCollapsibleSection
              icon={<UserCheck className="w-4 h-4 text-slate-600" />}
              title="Datos personales"
              defaultOpen
              hasData={!!(selected.birth_date || selected.sex || selected.address || selected.city)}
              onEdit={() => {
                setPatientFormInitial({
                  id: selected.id,
                  full_name: selected.full_name || '',
                  cedula: selected.cedula || '',
                  email: selected.email || '',
                  phone: selected.phone || '',
                  birth_date: selected.birth_date || '',
                  age: selected.age ?? null,
                  sex: (selected.sex as any) ?? '',
                  blood_type: selected.blood_type || '',
                  address: selected.address || '',
                  city: selected.city || '',
                  allergies: selected.allergies || '',
                  chronic_conditions: selected.chronic_conditions || '',
                  emergency_contact_name: selected.emergency_contact_name || '',
                  emergency_contact_phone: selected.emergency_contact_phone || '',
                  notes: selected.notes || '',
                })
                setPatientFormOpen(true)
              }}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <PatientField label="Fecha de nacimiento" value={
                  selected.birth_date
                    ? new Date(selected.birth_date).toLocaleDateString('es-VE', { day: 'numeric', month: 'long', year: 'numeric' })
                    : null
                } />
                <PatientField label="Edad" value={(() => {
                  const a = getDisplayAge(selected)
                  return a != null ? `${a} años` : null
                })()} />
                <PatientField label="Sexo" value={
                  selected.sex === 'male' ? 'Masculino' :
                  selected.sex === 'female' ? 'Femenino' :
                  selected.sex === 'other' ? 'Otro' : null
                } />
                <PatientField label="Ciudad" value={selected.city} />
                <PatientField label="Dirección" value={selected.address} fullWidth />
              </div>
            </PatientCollapsibleSection>

            <PatientCollapsibleSection
              icon={<Heart className="w-4 h-4 text-red-500" />}
              title="Datos médicos"
              hasData={!!(selected.blood_type || selected.allergies || selected.chronic_conditions)}
              onEdit={() => {
                setPatientFormInitial({
                  id: selected.id,
                  full_name: selected.full_name || '',
                  cedula: selected.cedula || '',
                  email: selected.email || '',
                  phone: selected.phone || '',
                  birth_date: selected.birth_date || '',
                  age: selected.age ?? null,
                  sex: (selected.sex as any) ?? '',
                  blood_type: selected.blood_type || '',
                  address: selected.address || '',
                  city: selected.city || '',
                  allergies: selected.allergies || '',
                  chronic_conditions: selected.chronic_conditions || '',
                  emergency_contact_name: selected.emergency_contact_name || '',
                  emergency_contact_phone: selected.emergency_contact_phone || '',
                  notes: selected.notes || '',
                })
                setPatientFormOpen(true)
              }}
            >
              <div className="space-y-3">
                <div className="flex items-start gap-2">
                  <Droplet className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                  <PatientField label="Tipo de sangre" value={selected.blood_type} flush />
                </div>
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                  <PatientField label="Alergias" value={selected.allergies} flush />
                </div>
                <div className="flex items-start gap-2">
                  <Clock className="w-4 h-4 text-teal-500 mt-0.5 shrink-0" />
                  <PatientField label="Condiciones crónicas" value={selected.chronic_conditions} flush />
                </div>
              </div>
            </PatientCollapsibleSection>

            <PatientCollapsibleSection
              icon={<AlertCircle className="w-4 h-4 text-orange-500" />}
              title="Contacto de emergencia"
              hasData={!!(selected.emergency_contact_name || selected.emergency_contact_phone)}
              onEdit={() => {
                setPatientFormInitial({
                  id: selected.id,
                  full_name: selected.full_name || '',
                  cedula: selected.cedula || '',
                  email: selected.email || '',
                  phone: selected.phone || '',
                  birth_date: selected.birth_date || '',
                  age: selected.age ?? null,
                  sex: (selected.sex as any) ?? '',
                  blood_type: selected.blood_type || '',
                  address: selected.address || '',
                  city: selected.city || '',
                  allergies: selected.allergies || '',
                  chronic_conditions: selected.chronic_conditions || '',
                  emergency_contact_name: selected.emergency_contact_name || '',
                  emergency_contact_phone: selected.emergency_contact_phone || '',
                  notes: selected.notes || '',
                })
                setPatientFormOpen(true)
              }}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <PatientField label="Nombre del contacto" value={selected.emergency_contact_name} />
                <PatientField label="Teléfono" value={selected.emergency_contact_phone} icon={<Phone className="w-3 h-3" />} />
              </div>
            </PatientCollapsibleSection>

            {/* Notas internas — solo si existe */}
            {selected.notes && (
              <PatientCollapsibleSection
                icon={<ClipboardList className="w-4 h-4 text-slate-500" />}
                title="Notas internas"
                hasData={true}
                onEdit={() => {
                  setPatientFormInitial({
                    id: selected.id,
                    full_name: selected.full_name || '',
                    cedula: selected.cedula || '',
                    email: selected.email || '',
                    phone: selected.phone || '',
                    birth_date: selected.birth_date || '',
                    age: selected.age ?? null,
                    sex: (selected.sex as any) ?? '',
                    blood_type: selected.blood_type || '',
                    address: selected.address || '',
                    city: selected.city || '',
                    allergies: selected.allergies || '',
                    chronic_conditions: selected.chronic_conditions || '',
                    emergency_contact_name: selected.emergency_contact_name || '',
                    emergency_contact_phone: selected.emergency_contact_phone || '',
                    notes: selected.notes || '',
                  })
                  setPatientFormOpen(true)
                }}
              >
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{selected.notes}</p>
              </PatientCollapsibleSection>
            )}
          </div>

          {/* Consultations with Tabs */}
          <div>
            {/* Tab buttons */}
            <div className="flex gap-0 mb-4 border-b-2 border-slate-200 overflow-x-auto">
              <button
                onClick={() => setDetailTab('consultas')}
                className={`px-4 py-2 text-sm font-semibold transition-colors whitespace-nowrap ${
                  detailTab === 'consultas'
                    ? 'border-b-2 border-teal-500 text-teal-600 -mb-0.5'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                Historial de Consultas
              </button>
              <button
                onClick={() => setDetailTab('historial')}
                className={`px-4 py-2 text-sm font-semibold transition-colors whitespace-nowrap ${
                  detailTab === 'historial'
                    ? 'border-b-2 border-teal-500 text-teal-600 -mb-0.5'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                Historial Médico
              </button>
              {/* RONDA 40: tab Seguimiento del Paciente con badge verde si hay archivos sin leer */}
              <button
                onClick={async () => {
                  setDetailTab('seguimiento')
                  // marcar como leidos al entrar a la pestaña
                  if (selected && doctorId) {
                    const { markAllReadByDoctor } = await import('@/lib/shared-files')
                    const supabase = (await import('@/lib/supabase/client')).createClient()
                    await markAllReadByDoctor(supabase, { doctorId, patientId: selected.id })
                    setUnreadByPatient(prev => ({ ...prev, [selected.id]: 0 }))
                  }
                }}
                className={`relative px-4 py-2 text-sm font-semibold transition-colors whitespace-nowrap ${
                  detailTab === 'seguimiento'
                    ? 'border-b-2 border-teal-500 text-teal-600 -mb-0.5'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                Seguimiento
                {selected && (unreadByPatient[selected.id] || 0) > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500 text-white text-[10px] font-bold animate-pulse">
                    {unreadByPatient[selected.id]}
                  </span>
                )}
              </button>
            </div>

            {/* Consultas Tab */}
            {detailTab === 'consultas' && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="w-4 h-4 text-slate-500" />
                  <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{consultations.length}</span>
                </div>

                {consultations.length === 0 ? (
                  <div className="bg-white border border-dashed border-slate-200 rounded-xl py-10 text-center">
                    <p className="text-slate-400 text-sm">No hay consultas registradas para este paciente.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {consultations.map(c => {
                      const st = PAYMENT_STATUS[c.payment_status]
                      return (
                        <div key={c.id} className="bg-white border border-slate-200 rounded-xl p-5">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-mono font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{c.consultation_code}</span>
                                <span className="text-xs text-slate-400">{new Date(c.consultation_date).toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
                              </div>
                              {c.chief_complaint && <p className="text-sm font-semibold text-slate-800">{c.chief_complaint}</p>}
                              {c.notes && <p className="text-xs text-slate-500 mt-1 leading-relaxed">{c.notes}</p>}
                              {c.diagnosis && <p className="text-xs text-slate-600 mt-1"><strong>Dx:</strong> {c.diagnosis}</p>}
                              {c.treatment && <p className="text-xs text-slate-600"><strong>Tx:</strong> {c.treatment}</p>}
                            </div>
                            <div className="shrink-0 flex flex-col items-end gap-2">
                              <span className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${st.color}`}>
                                {st.icon} {st.label}
                              </span>
                              {/* Estado de pago — solo 2 estados. Un pago no se cancela. */}
                              <select
                                value={c.payment_status === 'approved' ? 'approved' : 'pending'}
                                onChange={e => handleStatusChange(c.id, e.target.value as 'pending' | 'approved')}
                                disabled={isPending}
                                className="text-xs border border-slate-200 rounded-lg px-2 py-1 outline-none focus:border-teal-400 text-slate-600 cursor-pointer"
                              >
                                <option value="pending">Pendiente</option>
                                <option value="approved">Aprobado</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Historial Médico Tab */}
            {detailTab === 'historial' && (
              <div className="space-y-4">
                {/* Banner de Resumen IA con Gemini */}
                {consultations.length > 0 && (
                  <div className="bg-gradient-to-r from-violet-50 to-teal-50 border border-violet-200 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-teal-500 flex items-center justify-center flex-shrink-0">
                        <Sparkles className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-800">Resumen del paciente con IA</p>
                        <p className="text-xs text-slate-600 mt-0.5">Gemini analizará las {consultations.length} consultas y te dará un resumen ejecutivo: patrones, evolución y datos clave.</p>
                        {aiError && <p className="text-xs text-red-600 mt-2">{aiError}</p>}
                        {aiSummary && (
                          <div className="mt-3 bg-white border border-violet-100 rounded-lg p-3 max-h-72 overflow-y-auto">
                            {/* RONDA 46: render markdown (bold, listas, headers) en vez de texto plano */}
                            <MarkdownText
                              text={aiSummary}
                              className="text-sm text-slate-700 leading-relaxed"
                            />
                          </div>
                        )}
                      </div>
                      <button
                        onClick={async () => {
                          if (!selected) return
                          setAiLoading(true); setAiError(''); setAiSummary('')
                          try {
                            const supabase = createClient()
                            const { data: { session } } = await supabase.auth.getSession()
                            if (!session?.access_token) { setAiError('Sesión expirada. Recarga.'); setAiLoading(false); return }
                            const res = await fetch('/api/doctor/ai', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                              body: JSON.stringify({ action: 'patient_history', patientId: selected.id }),
                            })
                            const data = await res.json()
                            if (!res.ok) { setAiError(data.error || 'Error de IA'); }
                            else setAiSummary(data.result || 'Sin respuesta')
                          } catch (e: any) { setAiError(e?.message || 'Error') }
                          setAiLoading(false)
                        }}
                        disabled={aiLoading}
                        className="px-3 py-2 bg-gradient-to-r from-violet-500 to-teal-500 hover:from-violet-600 hover:to-teal-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 flex-shrink-0"
                      >
                        {aiLoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analizando…</> : <><Sparkles className="w-3.5 h-3.5" /> Generar resumen</>}
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                  {/* Left sidebar with dates */}
                  <div className="sm:col-span-3 bg-white border border-slate-200 rounded-xl overflow-hidden max-h-[480px] overflow-y-auto">
                    {consultations.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-400">
                        No hay consultas
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {consultations.map(c => {
                          const isActive = selectedConsultaId === c.id
                          return (
                            <button
                              key={c.id}
                              onClick={() => setSelectedConsultaId(c.id)}
                              className={`w-full text-left px-4 py-3 transition-colors text-sm border-l-2 ${
                                isActive
                                  ? 'bg-teal-50 border-l-teal-500'
                                  : 'border-l-transparent hover:bg-slate-50'
                              }`}
                            >
                              <p className={`font-semibold text-xs ${isActive ? 'text-teal-700' : 'text-slate-700'}`}>
                                {new Date(c.consultation_date).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: '2-digit' })}
                              </p>
                              <p className="text-xs text-slate-500 mt-0.5 truncate">{c.chief_complaint || 'Consulta'}</p>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* Right side with full consultation content */}
                  <div className="sm:col-span-9">
                    {consultations.length === 0 ? (
                      <div className="bg-white border border-dashed border-slate-200 rounded-xl py-10 text-center">
                        <p className="text-slate-400 text-sm">No hay consultas para este paciente.</p>
                      </div>
                    ) : (() => {
                      // Buscar la consulta seleccionada (fallback: primera/mas reciente)
                      const c = consultations.find(x => x.id === selectedConsultaId) || consultations[0]
                      if (!c) return null
                      const st = PAYMENT_STATUS[c.payment_status]
                      return (
                        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                          <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-100">
                            <div>
                              <p className="text-sm font-semibold text-slate-800">{c.chief_complaint || 'Consulta'}</p>
                              <p className="text-xs text-slate-500 mt-1">{new Date(c.consultation_date).toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
                            </div>
                            <span className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${st.color}`}>
                              {st.icon} {st.label}
                            </span>
                          </div>
                          {!c.notes && !c.diagnosis && !c.treatment && (
                            <p className="text-xs text-slate-400 italic py-4 text-center">Esta consulta no tiene notas, diagnóstico ni tratamiento registrados.</p>
                          )}
                          {/* AUDIT FIX 2026-04-28 (C-9): sanitize HTML rendered from BD. */}
                          {c.notes && (
                            <div>
                              <p className="text-xs font-semibold text-slate-600 uppercase mb-2">Notas</p>
                              <div className="text-sm text-slate-700 leading-relaxed prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeHtml(c.notes) }} />
                            </div>
                          )}
                          {c.diagnosis && (
                            <div>
                              <p className="text-xs font-semibold text-slate-600 uppercase mb-2">Diagnóstico</p>
                              <div className="text-sm text-slate-700 prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeHtml(c.diagnosis) }} />
                            </div>
                          )}
                          {c.treatment && (
                            <div>
                              <p className="text-xs font-semibold text-slate-600 uppercase mb-2">Tratamiento</p>
                              <div className="text-sm text-slate-700 prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeHtml(c.treatment) }} />
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                </div>
              </div>
            )}

            {/* RONDA 40 — Tab "Seguimiento del Paciente" (Shared Health Space) */}
            {detailTab === 'seguimiento' && selected && (
              <div className="space-y-4">
                {/* RONDA 44: header explicito de a quien le estoy mandando, para evitar
                    confusiones cuando el doctor tiene varios pacientes con nombres parecidos */}
                <div className={`rounded-xl px-4 py-3 flex items-center gap-3 ${
                  (selected as any).auth_user_id
                    ? 'bg-emerald-50 border border-emerald-200'
                    : 'bg-slate-50 border border-slate-200'
                }`}>
                  <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                    (selected as any).auth_user_id
                      ? 'bg-emerald-500 text-white' : 'bg-slate-300 text-white'
                  }`}>
                    {selected.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">
                      Estás trabajando con: {selected.full_name}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {selected.email || selected.cedula || 'Sin email registrado'}
                      {(selected as any).auth_user_id ? ' · ✓ Cuenta vinculada' : ' · ✗ Sin cuenta'}
                    </p>
                  </div>
                </div>

                {/* RONDA 43: warning si el paciente NO tiene cuenta vinculada */}
                {!(selected as any).auth_user_id && (
                  <div className="bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-bold text-amber-900">Este paciente aún no tiene cuenta</p>
                      <p className="text-xs text-amber-800 mt-0.5">
                        Las tareas y archivos que envíes quedarán guardados en tu historial, pero el paciente no
                        podrá verlos desde su portal hasta que se registre con su email o por el link de invitación.
                      </p>
                    </div>
                  </div>
                )}

                {/* Crear instruccion / tarea para el paciente */}
                <div className="bg-gradient-to-br from-teal-50 to-cyan-50 border border-teal-200 rounded-xl p-4 sm:p-5">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-9 h-9 rounded-xl bg-teal-500 flex items-center justify-center flex-shrink-0">
                      <Send className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-slate-800">Pedirle algo al paciente</p>
                      <p className="text-xs text-slate-600 mt-0.5">Crea una tarea o pídele que adjunte un examen, foto o documento. Le aparecerá como pendiente.</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <input
                      value={newInstructionTitle}
                      onChange={e => setNewInstructionTitle(e.target.value)}
                      placeholder="Ej: Radiografía de tórax, Foto del moretón..."
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-teal-400 outline-none"
                    />
                    <textarea
                      value={newInstructionDesc}
                      onChange={e => setNewInstructionDesc(e.target.value)}
                      placeholder="Instrucciones (opcional): cómo tomar la foto, qué examen pedir, etc."
                      rows={2}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none focus:border-teal-400 outline-none"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={async () => {
                          if (!doctorId || !selected || !newInstructionTitle.trim()) return
                          setSavingInstruction(true)
                          try {
                            const { createInstruction } = await import('@/lib/shared-files')
                            const supabase = createClient()
                            const { error } = await createInstruction(supabase, {
                              doctorId,
                              patientId: selected.id,
                              title: newInstructionTitle.trim(),
                              description: newInstructionDesc.trim() || null,
                            })
                            if (error) {
                              alert(`Error: ${error}`)
                            } else {
                              setNewInstructionTitle('')
                              setNewInstructionDesc('')
                              await loadSharedFiles(selected.id)
                            }
                          } finally {
                            setSavingInstruction(false)
                          }
                        }}
                        disabled={savingInstruction || !newInstructionTitle.trim()}
                        className="flex items-center gap-1.5 px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white text-sm font-bold rounded-lg disabled:opacity-50"
                      >
                        {savingInstruction ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        Enviar tarea
                      </button>
                      <button
                        onClick={() => {
                          setDoctorUploadTitle(newInstructionTitle.trim())
                          setDoctorUploadDesc(newInstructionDesc.trim())
                          setDoctorUploadModal(true)
                        }}
                        className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-bold rounded-lg"
                      >
                        <Upload className="w-4 h-4" /> Subir archivo
                      </button>
                    </div>
                  </div>
                </div>

                {/* Feed de archivos compartidos */}
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-4 sm:px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900">Historial compartido ({sharedFiles.length})</h3>
                    {sharedLoading && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
                  </div>
                  {sharedFiles.length === 0 ? (
                    <div className="text-center py-12 px-4">
                      <FolderHeart className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                      <p className="text-sm text-slate-500 font-medium">Sin archivos compartidos aún</p>
                      <p className="text-xs text-slate-400 mt-1">Empieza pidiéndole al paciente un examen o foto.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {sharedFiles.map(f => {
                        const isImage = f.file_type && ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(f.file_type)
                        // RONDA 42: tipos correctamente diferenciados
                        const isInstructionTask = f.category === 'instruction'
                        const isComment = f.category === 'comment'
                        const isPendingTask = isInstructionTask && f.status === 'pending'
                        const isCompletedTask = isInstructionTask && f.status === 'completed'
                        return (
                          <div key={f.id} className="p-4 sm:p-5 flex items-start gap-3">
                            <div className={`shrink-0 p-2.5 rounded-lg ${
                              isPendingTask ? 'bg-amber-50 text-amber-600' :
                              isCompletedTask ? 'bg-emerald-50 text-emerald-600' :
                              isComment ? 'bg-slate-100 text-slate-600' :
                              isImage ? 'bg-teal-50 text-teal-600' :
                              'bg-red-50 text-red-600'
                            }`}>
                              {isInstructionTask ? <Clock className="w-5 h-5" /> :
                                isComment ? <Send className="w-5 h-5" /> :
                                isImage ? <ImageIcon className="w-5 h-5" /> :
                                <FileText className="w-5 h-5" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-bold text-slate-900 truncate">{f.title}</p>
                                <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                                  f.created_by === 'doctor' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                                }`}>
                                  {f.created_by === 'doctor' ? 'Tú' : 'Paciente'}
                                </span>
                                {/* RONDA 42: chip de estado correcto segun status */}
                                {isPendingTask && (
                                  <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                                    Pendiente
                                  </span>
                                )}
                                {isCompletedTask && (
                                  <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                                    Respondida
                                  </span>
                                )}
                                {isComment && (
                                  <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                                    Comentario
                                  </span>
                                )}
                              </div>
                              {f.description && (
                                <p className="text-xs text-slate-600 mt-1 line-clamp-2">{f.description}</p>
                              )}
                              <p className="text-[10px] text-slate-400 mt-1">
                                {new Date(f.created_at).toLocaleString('es-VE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                {f.file_size_bytes && <> · {(f.file_size_bytes / 1024).toFixed(0)} KB</>}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {f.file_url && (
                                <a href={f.file_url} target="_blank" rel="noopener noreferrer"
                                  className="p-2 text-teal-600 hover:bg-teal-50 rounded-lg transition-colors" title="Abrir archivo">
                                  <ExternalLink className="w-4 h-4" />
                                </a>
                              )}
                              {/* RONDA 43: lapiz + papelera SOLO si el item es del doctor (created_by='doctor') */}
                              {f.created_by === 'doctor' && (
                                <>
                                  <button
                                    onClick={() => {
                                      setEditingFile(f)
                                      setEditTitle(f.title)
                                      setEditDesc(f.description || '')
                                    }}
                                    className="p-2 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                                    title="Editar"
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={async () => {
                                      if (!confirm(`¿Eliminar "${f.title}"? Esta acción no se puede deshacer.`)) return
                                      const { deleteSharedFile } = await import('@/lib/shared-files')
                                      const supabase = createClient()
                                      const { error } = await deleteSharedFile(supabase, { id: f.id, fileUrl: f.file_url })
                                      if (error) alert(`Error: ${error}`)
                                      else if (selected) await loadSharedFiles(selected.id)
                                    }}
                                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                    title="Eliminar"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* RONDA 40 — Modal de subida de archivo (doctor) */}
      {doctorUploadModal && selected && doctorId && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-3" onClick={() => setDoctorUploadModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-3.5 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Subir archivo al paciente</h3>
              <button onClick={() => setDoctorUploadModal(false)} className="text-slate-400 hover:text-slate-600 p-1">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Título</label>
                <input
                  type="text"
                  value={doctorUploadTitle}
                  onChange={e => setDoctorUploadTitle(e.target.value)}
                  placeholder="Ej: Resultados de laboratorio"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:border-teal-400 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Comentario (opcional)</label>
                <textarea
                  value={doctorUploadDesc}
                  onChange={e => setDoctorUploadDesc(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm resize-none focus:border-teal-400 outline-none"
                />
              </div>
              {/* RONDA 41: opción de enviar SOLO comentario sin adjuntar */}
              <button
                onClick={async () => {
                  if (!doctorUploadDesc.trim()) {
                    alert('Escribe un comentario o adjunta un archivo')
                    return
                  }
                  const { replyWithComment } = await import('@/lib/shared-files')
                  const supabase = createClient()
                  const { error } = await replyWithComment(supabase, {
                    doctorId,
                    patientId: selected.id,
                    title: doctorUploadTitle.trim() || 'Comentario del doctor',
                    description: doctorUploadDesc.trim(),
                    createdBy: 'doctor',
                  })
                  if (error) {
                    alert(`Error: ${error}`)
                  } else {
                    setDoctorUploadTitle('')
                    setDoctorUploadDesc('')
                    setDoctorUploadModal(false)
                    await loadSharedFiles(selected.id)
                  }
                }}
                disabled={!doctorUploadDesc.trim()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white text-sm font-bold rounded-xl disabled:opacity-50 transition-colors"
              >
                <Send className="w-4 h-4" /> Enviar solo comentario
              </button>

              <div className="flex items-center gap-2 text-xs text-slate-400">
                <div className="flex-1 border-t border-slate-200"></div>
                <span>o adjuntar archivo</span>
                <div className="flex-1 border-t border-slate-200"></div>
              </div>

              <UploadDropZone
                onUpload={async (file) => {
                  const { uploadSharedFile } = await import('@/lib/shared-files')
                  const supabase = createClient()
                  const { error } = await uploadSharedFile(supabase, {
                    file,
                    doctorId,
                    patientId: selected.id,
                    title: doctorUploadTitle.trim() || file.name,
                    description: doctorUploadDesc.trim() || null,
                    createdBy: 'doctor',
                  })
                  if (error) throw new Error(error)
                  setDoctorUploadTitle('')
                  setDoctorUploadDesc('')
                  setDoctorUploadModal(false)
                  await loadSharedFiles(selected.id)
                }}
                label="Suelta o selecciona el archivo"
              />
            </div>
          </div>
        </div>
      )}

      {/* RONDA 43 — Modal de edicion de tarea/archivo existente */}
      {editingFile && selected && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-3" onClick={() => !savingEditFile && setEditingFile(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-3.5 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Pencil className="w-4 h-4" /> Editar
              </h3>
              <button onClick={() => !savingEditFile && setEditingFile(null)} className="text-slate-400 hover:text-slate-600 p-1">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Título</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:border-teal-400 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Descripción</label>
                <textarea
                  value={editDesc}
                  onChange={e => setEditDesc(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm resize-none focus:border-teal-400 outline-none"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    setSavingEditFile(true)
                    try {
                      const { updateSharedFile } = await import('@/lib/shared-files')
                      const supabase = createClient()
                      const { error } = await updateSharedFile(supabase, {
                        id: editingFile.id,
                        title: editTitle.trim() || editingFile.title,
                        description: editDesc.trim() || null,
                      })
                      if (error) {
                        alert(`Error: ${error}`)
                      } else {
                        setEditingFile(null)
                        if (selected) await loadSharedFiles(selected.id)
                      }
                    } finally {
                      setSavingEditFile(false)
                    }
                  }}
                  disabled={savingEditFile || !editTitle.trim()}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-500 hover:bg-teal-600 text-white text-sm font-bold rounded-xl disabled:opacity-50 transition-colors"
                >
                  {savingEditFile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar cambios
                </button>
              </div>

              {/* Si esta tarea NO tiene archivo aun, permitir adjuntar uno */}
              {!editingFile.file_url && (
                <>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <div className="flex-1 border-t border-slate-200"></div>
                    <span>o adjuntar un archivo a esta tarea</span>
                    <div className="flex-1 border-t border-slate-200"></div>
                  </div>
                  <UploadDropZone
                    onUpload={async (file) => {
                      const { attachFileToExisting } = await import('@/lib/shared-files')
                      const supabase = createClient()
                      const { error } = await attachFileToExisting(supabase, {
                        id: editingFile.id,
                        file,
                        patientId: selected.id,
                      })
                      if (error) throw new Error(error)
                      setEditingFile(null)
                      await loadSharedFiles(selected.id)
                    }}
                    label="Adjuntar archivo a esta tarea"
                    helperText="PDF, JPG o PNG. Máximo 20MB."
                  />
                </>
              )}

              {/* Si YA tiene archivo, mostrar reemplazar */}
              {editingFile.file_url && (
                <>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <div className="flex-1 border-t border-slate-200"></div>
                    <span>archivo actual</span>
                    <div className="flex-1 border-t border-slate-200"></div>
                  </div>
                  <a
                    href={editingFile.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-teal-600 hover:text-teal-700 font-semibold"
                  >
                    <ExternalLink className="w-4 h-4" /> Ver archivo adjunto
                  </a>
                  <UploadDropZone
                    onUpload={async (file) => {
                      const { attachFileToExisting } = await import('@/lib/shared-files')
                      const supabase = createClient()
                      const { error } = await attachFileToExisting(supabase, {
                        id: editingFile.id,
                        file,
                        patientId: selected.id,
                      })
                      if (error) throw new Error(error)
                      setEditingFile(null)
                      await loadSharedFiles(selected.id)
                    }}
                    label="Reemplazar archivo"
                    helperText="Sube un nuevo archivo para reemplazar el actual."
                    variant="compact"
                  />
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── NEW CONSULTATION VIEW ── */}
      {view === 'new-consultation' && selected && (
        <div className="max-w-2xl space-y-5">
          <button onClick={() => setView('detail')} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-700 transition-colors">
            <ArrowLeft className="w-4 h-4" /> {selected.full_name}
          </button>

          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-9 h-9 rounded-xl g-bg flex items-center justify-center">
                <Edit3 className="w-4 h-4 text-white" />
              </div>
              <div>
                <h2 className="font-bold text-slate-900">Nueva consulta</h2>
                <p className="text-xs text-slate-400">Paciente: {selected.full_name}</p>
              </div>
            </div>

            {consultError && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">{consultError}</div>
            )}

            <form onSubmit={handleCreateConsultation} className="space-y-4">
              {/* Motivo de consulta */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Motivo de consulta <span className="text-red-400">*</span></label>
                <input value={newConsult.chief_complaint} onChange={e => setNewConsult(p => ({ ...p, chief_complaint: e.target.value }))} placeholder="Ej: Dolor de cabeza persistente..." className={fi} />
              </div>

              {/* Plan / Servicio */}
              {pricingPlans.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Plan o servicio</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {pricingPlans.map(plan => (
                      <button
                        key={plan.id} type="button"
                        onClick={() => setNewConsult(p => ({ ...p, plan_id: p.plan_id === plan.id ? '' : plan.id }))}
                        className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all ${newConsult.plan_id === plan.id ? 'border-teal-400 bg-teal-50' : 'border-slate-200 hover:border-slate-300 bg-white'}`}
                      >
                        <p className="text-sm font-semibold text-slate-800">{plan.name}</p>
                        <p className="text-xs text-slate-500 mt-0.5">${plan.price_usd} USD · {plan.duration_minutes} min</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Método de pago + referencia (shown when plan selected) */}
              {newConsult.plan_id && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Método de pago</label>
                    <select
                      value={newConsult.payment_method}
                      onChange={e => setNewConsult(p => ({ ...p, payment_method: e.target.value }))}
                      className={fi}
                    >
                      <option value="">-- Selecciona método de pago --</option>
                      {PAYMENT_METHODS.filter(m => doctorPaymentMethods.length === 0 || doctorPaymentMethods.includes(m.value)).map(m => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Referencia / Nro. comprobante</label>
                    <input value={newConsult.payment_reference} onChange={e => setNewConsult(p => ({ ...p, payment_reference: e.target.value }))} placeholder="Ej: #12345, últimos 4 dígitos..." className={fi} />
                  </div>

                  {/* Comprobante upload */}
                  {newConsult.payment_method && requiresReceipt(newConsult.payment_method) && (
                    <div className="border border-dashed border-slate-300 rounded-xl p-4 space-y-2 bg-slate-50/50">
                      <p className="text-sm font-medium text-slate-700">Adjuntar comprobante <span className="text-xs text-slate-400">(opcional)</span></p>
                      <label className="flex items-center justify-center border-2 border-dashed border-teal-300/50 rounded-xl p-4 cursor-pointer hover:bg-white/80 transition-colors">
                        <input type="file" accept="image/*,application/pdf" onChange={e => setReceiptFile(e.target.files?.[0] || null)} className="hidden" />
                        <div className="text-center">
                          <Upload className="w-5 h-5 mx-auto mb-1 text-teal-500" />
                          <p className="text-sm font-medium text-slate-700">{receiptFile ? receiptFile.name : 'Sube comprobante (JPG, PNG, PDF)'}</p>
                        </div>
                      </label>
                      {receiptFile && <p className="text-xs text-slate-500">{receiptFile.name} ({(receiptFile.size / 1024 / 1024).toFixed(2)} MB)</p>}
                    </div>
                  )}
                </div>
              )}

              {/* Notas clínicas */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Notas de la consulta</label>
                <textarea value={newConsult.notes} onChange={e => setNewConsult(p => ({ ...p, notes: e.target.value }))} rows={3} placeholder="Anamnesis, síntomas, observaciones..." className={fi + ' resize-none'} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Diagnóstico</label>
                  <input value={newConsult.diagnosis} onChange={e => setNewConsult(p => ({ ...p, diagnosis: e.target.value }))} placeholder="Ej: Hipertensión arterial..." className={fi} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Tratamiento</label>
                  <input value={newConsult.treatment} onChange={e => setNewConsult(p => ({ ...p, treatment: e.target.value }))} placeholder="Ej: Metoprolol 50mg..." className={fi} />
                </div>
              </div>

              <button type="submit" disabled={uploadingReceipt} className="g-bg w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white hover:opacity-90 disabled:opacity-60">
                {uploadingReceipt ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Guardando...</> : <><Save className="w-4 h-4" />Guardar consulta</>}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── ADD PATIENT MODAL ── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-900">Nuevo paciente</h3>
              <button onClick={() => { setShowAddModal(false); setPatError('') }} className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <form onSubmit={handleAddPatient} className="p-6 space-y-4">
              {patError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{patError}</p>}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Nombre completo <span className="text-red-400">*</span></label>
                <input value={newPat.full_name} onChange={e => setNewPat(p => ({ ...p, full_name: e.target.value }))} placeholder="María González" className={fi} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Fecha de nacimiento</label>
                  <input type="date" value={newPat.birth_date}
                    onChange={e => {
                      const bd = e.target.value
                      const calculatedAge = calcAgeFromBirthDate(bd)
                      setNewPat(p => ({ ...p, birth_date: bd, age: calculatedAge }))
                    }}
                    className={fi} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Edad</label>
                  <input type="number" min="0" max="150" value={newPat.age} onChange={e => setNewPat(p => ({ ...p, age: e.target.value }))} placeholder="35" className={fi} />
                  {newPat.birth_date && <p className="text-xs text-slate-400 mt-1">Calculada automáticamente</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Sexo</label>
                  <select value={newPat.sex} onChange={e => setNewPat(p => ({ ...p, sex: e.target.value }))} className={fi}>
                    <option value="">Seleccionar...</option>
                    <option value="female">Femenino</option>
                    <option value="male">Masculino</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Teléfono</label>
                <input type="tel" value={newPat.phone} onChange={e => setNewPat(p => ({ ...p, phone: e.target.value }))} placeholder="+58 412 000 0000" className={fi} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Cédula</label>
                  <input value={newPat.cedula} onChange={e => setNewPat(p => ({ ...p, cedula: e.target.value }))} placeholder="V-12345678" className={fi} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                  <input type="email" value={newPat.email} onChange={e => setNewPat(p => ({ ...p, email: e.target.value }))} placeholder="paciente@email.com" className={fi} />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Notas</label>
                <textarea value={newPat.notes} onChange={e => setNewPat(p => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Alergias, condiciones previas..." className={fi + ' resize-none'} />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Canal de captación</label>
                <select value={newPat.source} onChange={e => setNewPat(p => ({ ...p, source: e.target.value }))} className={fi}>
                  <option value="">Seleccionar canal...</option>
                  {CHANNEL_OPTIONS.map(ch => (
                    <option key={ch.value} value={ch.value}>{ch.label}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-400 mt-1">¿Por dónde llegó este paciente?</p>
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => { setShowAddModal(false); setPatError('') }} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancelar</button>
                <button type="submit" disabled={isPending} className="flex-1 g-bg py-2.5 rounded-xl text-sm font-bold text-white hover:opacity-90 disabled:opacity-60">
                  {isPending ? 'Guardando...' : 'Agregar paciente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── EDIT PATIENT MODAL ── */}
      {editing && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
              <h3 className="font-bold text-slate-900">Editar paciente</h3>
              <button onClick={() => setEditing(false)} className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {editError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{editError}</p>}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Nombre completo <span className="text-red-400">*</span></label>
                <input value={editPat.full_name} onChange={e => setEditPat(p => ({ ...p, full_name: e.target.value }))} className={fi} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Fecha de nacimiento</label>
                  <input type="date" value={editPat.birth_date}
                    onChange={e => {
                      const bd = e.target.value
                      const calculatedAge = calcAgeFromBirthDate(bd)
                      setEditPat(p => ({ ...p, birth_date: bd, age: calculatedAge }))
                    }}
                    className={fi} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Edad</label>
                  <input type="number" min="0" max="150" value={editPat.age} onChange={e => setEditPat(p => ({ ...p, age: e.target.value }))} className={fi} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Sexo</label>
                  <select value={editPat.sex} onChange={e => setEditPat(p => ({ ...p, sex: e.target.value }))} className={fi}>
                    <option value="">Seleccionar...</option>
                    <option value="female">Femenino</option>
                    <option value="male">Masculino</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Teléfono</label>
                <input type="tel" value={editPat.phone} onChange={e => setEditPat(p => ({ ...p, phone: e.target.value }))} className={fi} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Cédula</label>
                  <input value={editPat.cedula} onChange={e => setEditPat(p => ({ ...p, cedula: e.target.value }))} className={fi} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                  <input type="email" value={editPat.email} onChange={e => setEditPat(p => ({ ...p, email: e.target.value }))} className={fi} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Dirección</label>
                  <input value={editPat.address} onChange={e => setEditPat(p => ({ ...p, address: e.target.value }))} className={fi} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Ciudad</label>
                  <input value={editPat.city} onChange={e => setEditPat(p => ({ ...p, city: e.target.value }))} className={fi} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Tipo de sangre</label>
                  <select value={editPat.blood_type} onChange={e => setEditPat(p => ({ ...p, blood_type: e.target.value }))} className={fi}>
                    <option value="">Seleccionar...</option>
                    <option value="A+">A+</option>
                    <option value="A-">A-</option>
                    <option value="B+">B+</option>
                    <option value="B-">B-</option>
                    <option value="AB+">AB+</option>
                    <option value="AB-">AB-</option>
                    <option value="O+">O+</option>
                    <option value="O-">O-</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Alergias</label>
                  <input value={editPat.allergies} onChange={e => setEditPat(p => ({ ...p, allergies: e.target.value }))} placeholder="Penicilina, mariscos..." className={fi} />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Condiciones crónicas</label>
                <input value={editPat.chronic_conditions} onChange={e => setEditPat(p => ({ ...p, chronic_conditions: e.target.value }))} placeholder="Hipertensión, diabetes..." className={fi} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Contacto emergencia (nombre)</label>
                  <input value={editPat.emergency_contact_name} onChange={e => setEditPat(p => ({ ...p, emergency_contact_name: e.target.value }))} className={fi} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Contacto emergencia (teléfono)</label>
                  <input type="tel" value={editPat.emergency_contact_phone} onChange={e => setEditPat(p => ({ ...p, emergency_contact_phone: e.target.value }))} className={fi} />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Notas</label>
                <textarea value={editPat.notes} onChange={e => setEditPat(p => ({ ...p, notes: e.target.value }))} rows={2} className={fi + ' resize-none'} />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Canal de captación</label>
                <select value={editPat.source} onChange={e => setEditPat(p => ({ ...p, source: e.target.value }))} className={fi}>
                  <option value="">Seleccionar canal...</option>
                  {CHANNEL_OPTIONS.map(ch => (
                    <option key={ch.value} value={ch.value}>{ch.label}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setEditing(false)} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancelar</button>
                <button type="button" onClick={handleSaveEdit} disabled={savingEdit} className="flex-1 g-bg py-2.5 rounded-xl text-sm font-bold text-white hover:opacity-90 disabled:opacity-60">
                  {savingEdit ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* === Modal Nueva Consulta UNIFICADO ===
          Mismo NewAppointmentFlow que /agenda y /consultations.
          Pre-rellena el paciente seleccionado, no se puede editar. */}
      <NewAppointmentFlow
        open={showNewAppointmentFlow}
        onClose={() => setShowNewAppointmentFlow(false)}
        onSuccess={() => {
          setShowNewAppointmentFlow(false)
          // Refrescar consultas del paciente
          if (selected) getConsultations(selected.id).then(setConsultations)
        }}
        initialContext={{
          patientId: selected?.id,
          origin: 'patient_sheet',
        }}
      />

      {/* === Modal UNIFICADO de PatientForm — crear y editar (RONDA 19b) ===
          Reemplaza los 2 modales viejos: handleAddPatient y handleSaveEdit. */}
      {patientFormOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl g-bg flex items-center justify-center">
                  <User className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="font-bold text-slate-900">
                    {patientFormInitial?.id ? 'Editar paciente' : 'Nuevo paciente'}
                  </h2>
                  <p className="text-xs text-slate-400">
                    {patientFormInitial?.id ? 'Actualiza la información clínica del paciente' : 'Completa los datos para registrar al paciente'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setPatientFormOpen(false); setPatientFormInitial(null) }}
                className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4 text-slate-600" />
              </button>
            </div>
            <PatientForm
              initialData={patientFormInitial}
              submitting={patientFormSaving}
              onSubmit={handlePatientSubmit}
              onCancel={() => { setPatientFormOpen(false); setPatientFormInitial(null) }}
            />
          </div>
        </div>
      )}
    </>
  )
}

const fi = 'w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 bg-white transition-colors'

// Helper: derivar edad desde fecha de nacimiento si patients.age no está set.
// Pacientes registrados sin la columna `age` (o con valor stale) muestran "No
// registrado" si solo confiábamos en la columna — ahora calculamos al vuelo
// cuando tenemos birth_date.
function getDisplayAge(p: { age?: number | null; birth_date?: string | null }): number | null {
  if (p.age != null && p.age >= 0) return p.age
  if (!p.birth_date) return null
  const birth = new Date(p.birth_date)
  if (isNaN(birth.getTime())) return null
  const now = new Date()
  let years = now.getFullYear() - birth.getFullYear()
  const monthDiff = now.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) years--
  return years >= 0 ? years : null
}

// ════════════════════════════════════════════════════════════════════════════
// Componentes UX/UI del módulo de pacientes (rediseño 2026-04-30)
// Pattern Notion: secciones colapsables con header acción inline.
// ════════════════════════════════════════════════════════════════════════════

function PatientCollapsibleSection({
  icon, title, hasData, defaultOpen = false, onEdit, children,
}: {
  icon: React.ReactNode
  title: string
  hasData: boolean
  defaultOpen?: boolean
  onEdit: () => void
  children: React.ReactNode
}) {
  // Si la sección está vacía, abierta por default para que el doctor vea el CTA
  const initiallyOpen = defaultOpen || !hasData
  const [open, setOpen] = useState(initiallyOpen)

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 p-4 sm:px-6 sm:py-4 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {icon}
          <h3 className="text-sm font-semibold text-slate-700 truncate">{title}</h3>
          {!hasData && (
            <span className="shrink-0 text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
              Sin datos
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onEdit() }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onEdit() } }}
            className="p-1.5 rounded-md text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors cursor-pointer"
            title="Editar"
            aria-label="Editar sección"
          >
            <Pencil className="w-3.5 h-3.5" />
          </span>
          <ChevronDown
            className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {open && (
        <div className="px-4 sm:px-6 pb-4 sm:pb-5 pt-1 border-t border-slate-100">
          {hasData ? children : (
            <button
              onClick={onEdit}
              className="w-full mt-3 py-3 px-4 rounded-lg border-2 border-dashed border-slate-200 text-xs font-semibold text-slate-500 hover:border-teal-300 hover:text-teal-600 hover:bg-teal-50/30 transition-colors flex items-center justify-center gap-1.5"
            >
              <Pencil className="w-3.5 h-3.5" /> Agregar información
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function PatientField({
  label, value, fullWidth, flush, icon,
}: {
  label: string
  value: string | null | undefined
  fullWidth?: boolean
  flush?: boolean // sin padding wrapping (cuando se usa con icon arriba)
  icon?: React.ReactNode
}) {
  if (flush) {
    return (
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">{label}</p>
        <p className="text-sm text-slate-800 mt-0.5">
          {value || <span className="text-slate-400 italic">No registrado</span>}
        </p>
      </div>
    )
  }
  return (
    <div className={fullWidth ? 'sm:col-span-2' : ''}>
      <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-0.5">{label}</p>
      <p className="text-sm text-slate-800 flex items-center gap-1.5">
        {icon}
        {value || <span className="text-slate-400 italic">No registrado</span>}
      </p>
    </div>
  )
}
