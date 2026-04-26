'use client'

import { useState, useEffect, useTransition } from 'react'
import {
  Users, Plus, Search, Phone, Mail, FileText, X, ChevronRight,
  ArrowLeft, Save, CheckCircle, Clock, AlertCircle, MessageCircle,
  Filter, User, Edit3, Hash, Zap, Calendar, Droplet, Heart, AlertTriangle, UserCheck, Image as ImageIcon, Upload,
  Sparkles, Loader2
} from 'lucide-react'
import { getPatients, addPatient, updatePatient, getDoctorId, getConsultations, createConsultation, updateConsultationStatus, updateConsultationNotes, type Patient, type Consultation } from './actions'
import { createClient } from '@/lib/supabase/client'

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
type DetailTab = 'consultas' | 'historial'

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
    getConsultations(p.id).then(list => {
      setConsultations(list)
      // Auto-select la mas reciente (primera del array, ordenada DESC en getConsultations)
      if (list.length > 0) setSelectedConsultaId(list[0].id)
    })
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
              <button onClick={() => setShowAddModal(true)} className="g-bg flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-opacity">
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
              <button onClick={() => setShowAddModal(true)} className="mt-4 g-bg text-white px-4 py-2 rounded-xl text-sm font-semibold">
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
                      {p.age && <span className="text-xs text-slate-400">{p.age} años</span>}
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
                    {selected.age && <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" />{selected.age} años · {selected.sex === 'female' ? 'Femenino' : selected.sex === 'male' ? 'Masculino' : ''}</span>}
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
                      onClick={() => startEditPatient(selected)}
                      className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
                      title="Editar paciente"
                    >
                      <Edit3 className="w-4 h-4" /> <span className="hidden sm:inline">Editar</span>
                    </button>
                  )}
                  <button
                    onClick={() => { setView('new-consultation'); setConsultSuccess(''); setConsultError('') }}
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

            {/* Personal data section */}
            {(selected.birth_date || selected.address || selected.city) && (
              <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6">
                <div className="flex items-center gap-2 mb-4">
                  <UserCheck className="w-4 h-4 text-slate-600" />
                  <h3 className="text-sm font-semibold text-slate-700">Datos personales</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {selected.birth_date && (
                    <div>
                      <p className="text-xs text-slate-500 font-medium uppercase mb-1">Fecha de nacimiento</p>
                      <p className="text-sm text-slate-800">{new Date(selected.birth_date).toLocaleDateString('es-VE', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                    </div>
                  )}
                  {selected.address && (
                    <div>
                      <p className="text-xs text-slate-500 font-medium uppercase mb-1">Dirección</p>
                      <p className="text-sm text-slate-800">{selected.address}</p>
                    </div>
                  )}
                  {selected.city && (
                    <div>
                      <p className="text-xs text-slate-500 font-medium uppercase mb-1">Ciudad</p>
                      <p className="text-sm text-slate-800">{selected.city}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Medical data section */}
            {(selected.blood_type || selected.allergies || selected.chronic_conditions) && (
              <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Heart className="w-4 h-4 text-red-500" />
                  <h3 className="text-sm font-semibold text-slate-700">Datos médicos</h3>
                </div>
                <div className="space-y-3">
                  {selected.blood_type && (
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <Droplet className="w-4 h-4 text-red-400" />
                        <div>
                          <p className="text-xs text-slate-500 font-medium uppercase">Tipo de sangre</p>
                          <p className="text-sm font-semibold text-slate-800">{selected.blood_type}</p>
                        </div>
                      </div>
                    </div>
                  )}
                  {selected.allergies && (
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                      <div className="flex-1">
                        <p className="text-xs text-slate-500 font-medium uppercase mb-1">Alergias</p>
                        <p className="text-sm text-slate-800">{selected.allergies}</p>
                      </div>
                    </div>
                  )}
                  {selected.chronic_conditions && (
                    <div className="flex items-start gap-2">
                      <Clock className="w-4 h-4 text-teal-500 mt-0.5 shrink-0" />
                      <div className="flex-1">
                        <p className="text-xs text-slate-500 font-medium uppercase mb-1">Condiciones crónicas</p>
                        <p className="text-sm text-slate-800">{selected.chronic_conditions}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Emergency contact section */}
            {(selected.emergency_contact_name || selected.emergency_contact_phone) && (
              <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6">
                <div className="flex items-center gap-2 mb-4">
                  <AlertCircle className="w-4 h-4 text-orange-500" />
                  <h3 className="text-sm font-semibold text-slate-700">Contacto de emergencia</h3>
                </div>
                <div className="space-y-2">
                  {selected.emergency_contact_name && (
                    <p className="text-sm text-slate-800"><span className="font-medium">Nombre:</span> {selected.emergency_contact_name}</p>
                  )}
                  {selected.emergency_contact_phone && (
                    <p className="text-sm text-slate-800 flex items-center gap-2"><Phone className="w-3.5 h-3.5 text-slate-500" /><span className="font-medium">Teléfono:</span> {selected.emergency_contact_phone}</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Consultations with Tabs */}
          <div>
            {/* Tab buttons */}
            <div className="flex gap-0 mb-4 border-b-2 border-slate-200">
              <button
                onClick={() => setDetailTab('consultas')}
                className={`px-4 py-2 text-sm font-semibold transition-colors ${
                  detailTab === 'consultas'
                    ? 'border-b-2 border-teal-500 text-teal-600 -mb-0.5'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                Historial de Consultas
              </button>
              <button
                onClick={() => setDetailTab('historial')}
                className={`px-4 py-2 text-sm font-semibold transition-colors ${
                  detailTab === 'historial'
                    ? 'border-b-2 border-teal-500 text-teal-600 -mb-0.5'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                Historial Médico
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
                            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{aiSummary}</p>
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
                          {c.notes && (
                            <div>
                              <p className="text-xs font-semibold text-slate-600 uppercase mb-2">Notas</p>
                              <div className="text-sm text-slate-700 leading-relaxed prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: c.notes }} />
                            </div>
                          )}
                          {c.diagnosis && (
                            <div>
                              <p className="text-xs font-semibold text-slate-600 uppercase mb-2">Diagnóstico</p>
                              <div className="text-sm text-slate-700 prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: c.diagnosis }} />
                            </div>
                          )}
                          {c.treatment && (
                            <div>
                              <p className="text-xs font-semibold text-slate-600 uppercase mb-2">Tratamiento</p>
                              <div className="text-sm text-slate-700 prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: c.treatment }} />
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                </div>
              </div>
            )}
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
    </>
  )
}

const fi = 'w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 bg-white transition-colors'
