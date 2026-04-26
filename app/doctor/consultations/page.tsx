'use client'

import { useState, useEffect, useTransition, useRef, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { ClipboardList, Search, Calendar, User, ChevronRight, ArrowLeft, Save, CheckCircle, Clock, AlertCircle, DollarSign, FileText, Stethoscope, Pill, Filter, Plus, X, Check, Printer, Droplet, AlertTriangle, Heart, Sparkles, Wand2, History, Copy, Loader2, Share2, Mail, MessageCircle, ChevronDown, ChevronUp, Trash2, Upload, Play, Square, Timer } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useBcvRate } from '@/lib/useBcvRate'
import DynamicBlocks, { SnapshotBlock } from '@/components/consultation/DynamicBlocks'

type Consultation = {
  id: string
  consultation_code: string
  consultation_date: string
  chief_complaint: string | null
  notes: string | null
  diagnosis: string | null
  treatment: string | null
  status: 'pending' | 'in_progress' | 'completed' | 'no_show'   // Estado de la CONSULTA (no del pago)
  payment_status: 'pending' | 'approved'   // Quitamos 'cancelled' — los pagos no se cancelan
  appointment_id: string | null
  patient_id: string
  patient_name: string
  patient_phone: string | null
  started_at: string | null
  ended_at: string | null
  duration_minutes: number | null
  blocks_snapshot?: Array<{ key: string; label: string; content_type: string; sort_order: number; printable: boolean; send_to_patient: boolean }> | null
  blocks_data?: Record<string, unknown> | null
}

// Estados de CONSULTA
const CONSULTA_STATUS: Record<string, { label: string; color: string; dot: string }> = {
  pending:     { label: 'Pendiente',     color: 'bg-slate-100 text-slate-700',     dot: 'bg-slate-400' },
  in_progress: { label: 'En curso',      color: 'bg-blue-100 text-blue-700',       dot: 'bg-blue-500' },
  completed:   { label: 'Atendida',      color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  no_show:     { label: 'No asistió',    color: 'bg-red-100 text-red-700',         dot: 'bg-red-500' },
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

// Estados de PAGO únicamente (no estados de cita ni de consulta)
// Definición del usuario: Pendiente | Aprobado. NO existe "Rechazado".
const PAYMENT_STATUS: Record<string, { label: string; color: string; dot: string }> = {
  pending:  { label: 'Pendiente', color: 'bg-amber-100 text-amber-700',     dot: 'bg-amber-500' },
  approved: { label: 'Aprobado',  color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
}

// Helper para resolver aliases legacy ('unpaid','pending_approval','cancelled') a 'pending'
function normalizePaymentStatus(s: string | null | undefined): 'pending' | 'approved' {
  return s === 'approved' ? 'approved' : 'pending'
}

type ViewMode = 'list' | 'consultation'
type TimeFilter = 'all' | 'upcoming' | 'past' | 'today'
type ConsultationTab = string  // dinámico según blocks_snapshot del doctor

type Prescripcion = {
  exam_name: string
  notes: string
}

type QuickItem = {
  id: string
  item_type: 'exam' | 'medication'
  name: string
  category: string | null
  details: string | null
}

type SavedPrescription = {
  id: string
  medications: Medication[]
  notes: string | null
  created_at: string
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
  const { rate: bcvRate, toBs } = useBcvRate()

  const [view, setView] = useState<ViewMode>('list')
  const [selected, setSelected] = useState<Consultation | null>(null)
  const [consultations, setConsultations] = useState<Consultation[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [patientSearchText, setPatientSearchText] = useState('')
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all')
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [autoSaving, setAutoSaving] = useState(false)
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [consultationTab, setConsultationTab] = useState<ConsultationTab>('informe')

  // Report fields (editable during consultation)
  const [report, setReport] = useState({ chief_complaint: '', notes: '', diagnosis: '', treatment: '', payment_status: 'pending' as Consultation['payment_status'] })

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
  const [pricingPlans, setPricingPlans] = useState<{ id: string; name: string; price_usd: number; duration_minutes: number }[]>([])
  // Helper to get local datetime string for datetime-local input
  const getLocalDateTimeString = () => {
    const now = new Date()
    const offset = now.getTimezoneOffset()
    const local = new Date(now.getTime() - offset * 60000)
    return local.toISOString().slice(0, 16)
  }

  const [newConsultation, setNewConsultation] = useState({
    patient_id: '',
    consultation_date: getLocalDateTimeString(),
    reason: '',
    plan_id: '',
    payment_reference: '',
    amount: '',
    payment_method: 'efectivo' as 'efectivo' | 'transferencia' | 'pago_movil' | 'zelle' | 'binance' | 'pos' | 'seguro',
    comments: '',
    sendEmail: true,
  })
  const [isCreatingConsultation, setIsCreatingConsultation] = useState(false)
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const requiresReceipt = (method: string) => !['efectivo', 'efectivo_bs', 'pos', ''].includes(method)

  // Schedule / time slot state for new consultation
  type AvailabilitySlot = { day_of_week: number; start_time: string; end_time: string; is_enabled: boolean }
  type BlockedSlot = { blocked_date: string; start_time?: string; end_time?: string }
  const [scheduleSlots, setScheduleSlots] = useState<AvailabilitySlot[]>([])
  const [blockedDates, setBlockedDates] = useState<BlockedSlot[]>([])
  const [slotDuration, setSlotDuration] = useState(30)
  const [bookedTimes, setBookedTimes] = useState<string[]>([])
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [selectedTime, setSelectedTime] = useState<string>('')
  const [weekOffset, setWeekOffset] = useState(0)
  const [scheduleLoaded, setScheduleLoaded] = useState(false)

  // Recipe modal
  const [showRecipe, setShowRecipe] = useState(false)
  const [recipe, setRecipe] = useState<Recipe>({ medications: [], notes: '' })
  const [isSavingRecipe, setIsSavingRecipe] = useState(false)
  const [showPrintRecipe, setShowPrintRecipe] = useState(false)

  // Prescripciones (exámenes que el médico ordena)
  const [prescripciones, setPrescripciones] = useState<Prescripcion[]>([])
  const [isSavingPrescripciones, setIsSavingPrescripciones] = useState(false)

  // Delete confirmation
  const [confirmDeleteConsulta, setConfirmDeleteConsulta] = useState<Consultation | null>(null)
  const [deletingConsulta, setDeletingConsulta] = useState(false)

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

  // Doctor's active payment methods from settings
  const [doctorPaymentMethods, setDoctorPaymentMethods] = useState<string[]>([])

  // Consultation timer state
  const [consultationStarted, setConsultationStarted] = useState(false)
  const [consultationEnded, setConsultationEnded] = useState(false)
  const [consultationStartTime, setConsultationStartTime] = useState<Date | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [showEndConfirm, setShowEndConfirm] = useState(false)
  const [endingConsultation, setEndingConsultation] = useState(false)

  // Template configs for PDFs
  type TemplateConfig = {
    logo_url: string | null
    signature_url: string | null
    font_family: string
    header_text: string
    footer_text: string
    show_logo: boolean
    show_signature: boolean
    primary_color: string
  }
  const defaultTemplateConfig: TemplateConfig = {
    logo_url: null, signature_url: null, font_family: 'Inter',
    header_text: '', footer_text: '', show_logo: true, show_signature: true, primary_color: '#0891b2',
  }
  const [templateConfigs, setTemplateConfigs] = useState<Record<string, TemplateConfig>>({
    informe: { ...defaultTemplateConfig },
    recipe: { ...defaultTemplateConfig },
    prescripciones: { ...defaultTemplateConfig },
    reposo: { ...defaultTemplateConfig },
  })

  // Quick items from templates (doctor_quick_items)
  const [quickExams, setQuickExams] = useState<QuickItem[]>([])
  const [quickMeds, setQuickMeds] = useState<QuickItem[]>([])

  // Saved prescriptions for current consultation
  const [savedPrescriptions, setSavedPrescriptions] = useState<SavedPrescription[]>([])

  const today = new Date().toISOString().split('T')[0]

  // Generate available dates (next 30 days, based on doctor's schedule)
  const availableDates = (() => {
    const dates: { date: string; label: string; dayOfWeek: number }[] = []
    const now = new Date()
    for (let d = 0; d <= 30; d++) {
      const dt = new Date(now)
      dt.setDate(now.getDate() + d)
      const dow = dt.getDay() // 0=Sunday
      const dateStr = dt.toISOString().split('T')[0]
      // If schedule is loaded, only show days that have availability
      if (scheduleLoaded && scheduleSlots.length > 0) {
        const hasSlots = scheduleSlots.some(s => s.day_of_week === dow && s.is_enabled)
        if (!hasSlots) continue
      } else {
        // Default: skip Sundays
        if (dow === 0) continue
      }
      // Skip blocked dates
      if (blockedDates.some(b => b.blocked_date === dateStr)) continue
      const label = dt.toLocaleDateString('es-VE', { weekday: 'short', day: 'numeric', month: 'short' })
      dates.push({ date: dateStr, label, dayOfWeek: dow })
    }
    return dates
  })()

  // Generate time slots for selected date
  const timeSlotsForDate = (() => {
    if (!selectedDate) return []
    const dateObj = new Date(selectedDate + 'T00:00:00')
    const dow = dateObj.getDay()
    const duration = slotDuration || 30

    let daySlots: { start: string; end: string }[] = []
    if (scheduleLoaded && scheduleSlots.length > 0) {
      daySlots = scheduleSlots
        .filter(s => s.day_of_week === dow && s.is_enabled)
        .map(s => ({ start: s.start_time, end: s.end_time }))
    } else {
      // Default schedule
      daySlots = [
        { start: '08:00', end: '12:00' },
        { start: '14:00', end: '18:00' },
      ]
    }

    const slots: string[] = []
    daySlots.forEach(range => {
      const [sh, sm] = range.start.split(':').map(Number)
      const [eh, em] = range.end.split(':').map(Number)
      let current = sh * 60 + sm
      const endMin = eh * 60 + em
      while (current + duration <= endMin) {
        const h = Math.floor(current / 60)
        const m = current % 60
        slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
        current += duration
      }
    })

    return slots
  })()

  // Check if a time slot is booked
  const isTimeBooked = (date: string, time: string) => {
    const slotTime = new Date(`${date}T${time}:00`).getTime()
    const bufferMs = (slotDuration || 30) * 60 * 1000
    return bookedTimes.some(bt => {
      const bookedTime = new Date(bt).getTime()
      return Math.abs(bookedTime - slotTime) < bufferMs
    })
  }

  // Week navigation for dates
  const weekDates = availableDates.slice(weekOffset * 5, weekOffset * 5 + 5)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      try {
        // Cargar perfil del doctor (nombre + template de mensaje)
        const { data: profileData } = await supabase
          .from('profiles')
          .select('full_name, professional_title, share_message_template, payment_methods')
          .eq('id', user.id)
          .single()
        if (profileData) {
          setDoctorName(`${profileData.professional_title || ''} ${profileData.full_name || ''}`.trim())
          if (profileData.share_message_template) setShareTemplate(profileData.share_message_template)
          if (profileData.payment_methods && Array.isArray(profileData.payment_methods)) {
            setDoctorPaymentMethods(profileData.payment_methods)
          }
        }

        // Cargar pacientes con datos médicos
        const { data: patientsData } = await supabase
          .from('patients')
          .select('id, full_name, phone, email, cedula, age, sex, blood_type, allergies, chronic_conditions')
          .eq('doctor_id', user.id)
        setPatients(patientsData ?? [])

        // Cargar quick items (exámenes y medicamentos frecuentes)
        const { data: quickItems } = await supabase
          .from('doctor_quick_items')
          .select('id, item_type, name, category, details')
          .eq('doctor_id', user.id)
          .order('name')
        if (quickItems) {
          setQuickExams(quickItems.filter(i => i.item_type === 'exam'))
          setQuickMeds(quickItems.filter(i => i.item_type === 'medication'))
        }

        // Cargar planes de precios del doctor
        const { data: plansData } = await supabase
          .from('pricing_plans')
          .select('id, name, price_usd, duration_minutes')
          .eq('doctor_id', user.id)
          .eq('is_active', true)
          .order('price_usd')
        setPricingPlans(plansData ?? [])

        // Cargar horario del doctor para bloques de citas
        try {
          const schedRes = await fetch('/api/doctor/schedule')
          if (schedRes.ok) {
            const schedData = await schedRes.json()
            setScheduleSlots(schedData.slots || [])
            setBlockedDates(schedData.blocked || [])
            setSlotDuration(schedData.config?.slot_duration || 30)
            setScheduleLoaded(true)
          }
        } catch { /* schedule not configured */ }

        // Cargar citas existentes para marcar slots ocupados
        const startOfRange = new Date()
        const endOfRange = new Date(Date.now() + 30 * 86400000)
        const { data: existingAppts } = await supabase
          .from('appointments')
          .select('scheduled_at')
          .eq('doctor_id', user.id)
          .gte('scheduled_at', startOfRange.toISOString())
          .lte('scheduled_at', endOfRange.toISOString())
        const { data: existingCons } = await supabase
          .from('consultations')
          .select('consultation_date')
          .eq('doctor_id', user.id)
          .gte('consultation_date', startOfRange.toISOString())
          .lte('consultation_date', endOfRange.toISOString())
        const booked = [
          ...(existingAppts || []).map(a => a.scheduled_at),
          ...(existingCons || []).map(c => c.consultation_date),
        ]
        setBookedTimes(booked)

        // Cargar configuraciones de plantillas para PDFs
        const { data: tplData } = await supabase
          .from('doctor_templates')
          .select('template_type, logo_url, signature_url, font_family, header_text, footer_text, show_logo, show_signature, primary_color')
          .eq('doctor_id', user.id)
        if (tplData) {
          const configs: Record<string, TemplateConfig> = {
            informe: { ...defaultTemplateConfig },
            recipe: { ...defaultTemplateConfig },
            prescripciones: { ...defaultTemplateConfig },
            reposo: { ...defaultTemplateConfig },
          }
          tplData.forEach((t: any) => {
            if (configs[t.template_type]) {
              configs[t.template_type] = {
                logo_url: t.logo_url || null,
                signature_url: t.signature_url || null,
                font_family: t.font_family || 'Inter',
                header_text: t.header_text || '',
                footer_text: t.footer_text || '',
                show_logo: t.show_logo ?? true,
                show_signature: t.show_signature ?? true,
                primary_color: t.primary_color || '#0891b2',
              }
            }
          })
          setTemplateConfigs(configs)
        }

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
          status: (c.status ?? 'pending') as Consultation['status'],
          payment_status: c.payment_status,
          appointment_id: (c as { appointment_id?: string | null }).appointment_id ?? null,
          patient_id: c.patient_id,
          patient_name: !Array.isArray(c.patients) && c.patients ? (c.patients as { full_name: string }).full_name : 'Paciente',
          patient_phone: !Array.isArray(c.patients) && c.patients ? (c.patients as { full_name: string; phone: string | null }).phone : null,
          started_at: c.started_at ?? null,
          ended_at: c.ended_at ?? null,
          duration_minutes: c.duration_minutes ?? null,
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

  async function deleteConsultationCascade(c: Consultation) {
    setDeletingConsulta(true)
    try {
      const res = await fetch(`/api/doctor/consultations?id=${c.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al eliminar')

      // Remove from local state and go back to list
      setConsultations(prev => prev.filter(con => con.id !== c.id))
      setSelected(null)
      setView('list')
      setConfirmDeleteConsulta(null)
      alert('Consulta eliminada correctamente')
    } catch (err: any) {
      console.error('Delete error:', err)
      alert(err?.message || 'Error al eliminar la consulta')
    }
    setDeletingConsulta(false)
  }

  async function updateConsultaStatus(consultationId: string, newStatus: Consultation['status'], appointmentId: string | null) {
    const supabase = createClient()
    try {
      const { error } = await supabase.from('consultations').update({ status: newStatus }).eq('id', consultationId)
      if (error) throw error

      // Sincronizar el appointment.status (atendida → completed | no_show → no_show)
      if (appointmentId) {
        const apptStatus = newStatus === 'completed' ? 'completed' : newStatus === 'no_show' ? 'no_show' : null
        if (apptStatus) {
          await supabase.from('appointments').update({ status: apptStatus }).eq('id', appointmentId)
        }
      }

      // Actualizar estado local
      setSelected(prev => prev ? { ...prev, status: newStatus } : prev)
      setConsultations(prev => prev.map(x => x.id === consultationId ? { ...x, status: newStatus } : x))
    } catch (err: any) {
      console.error('Error updating consulta status:', err)
      alert(err?.message || 'Error al actualizar estado de la consulta')
    }
  }

  async function updatePagoStatus(consultationId: string, newStatus: 'pending' | 'approved', appointmentId: string | null) {
    const supabase = createClient()
    try {
      const { error } = await supabase.from('consultations').update({ payment_status: newStatus }).eq('id', consultationId)
      if (error) throw error

      // Sincronizar payments table — la relación REAL es appointments.payment_id → payments.id
      // (NO existe payments.consultation_id). Necesitamos appointment_id para llegar al payment.
      if (appointmentId) {
        const { data: appt } = await supabase
          .from('appointments')
          .select('payment_id')
          .eq('id', appointmentId)
          .maybeSingle()
        if (appt?.payment_id) {
          await supabase.from('payments').update({
            status: newStatus,
            paid_at: newStatus === 'approved' ? new Date().toISOString() : null,
          }).eq('id', appt.payment_id)
        }
      }

      // Actualizar estado local
      setSelected(prev => prev ? { ...prev, payment_status: newStatus } : prev)
      setReport(prev => ({ ...prev, payment_status: newStatus }))
      setConsultations(prev => prev.map(x => x.id === consultationId ? { ...x, payment_status: newStatus } : x))
    } catch (err: any) {
      console.error('Error updating pago status:', err)
      alert(err?.message || 'Error al actualizar estado del pago')
    }
  }

  async function openConsultation(c: Consultation) {
    // Fetch fresh data from DB to ensure we have latest notes/diagnosis/treatment
    const supabase = createClient()
    try {
      const { data } = await supabase
        .from('consultations')
        .select('id, consultation_code, consultation_date, chief_complaint, notes, diagnosis, treatment, status, payment_status, patient_id, appointment_id, started_at, ended_at, duration_minutes, blocks_snapshot, blocks_data, patients(full_name, phone)')
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
          status: (data.status ?? 'pending') as Consultation['status'],
          payment_status: data.payment_status,
          appointment_id: (data as { appointment_id?: string | null }).appointment_id ?? null,
          patient_id: data.patient_id,
          patient_name: !Array.isArray(data.patients) && data.patients ? (data.patients as { full_name: string }).full_name : c.patient_name,
          patient_phone: !Array.isArray(data.patients) && data.patients ? (data.patients as { full_name: string; phone: string | null }).phone : c.patient_phone,
          started_at: data.started_at ?? null,
          ended_at: data.ended_at ?? null,
          duration_minutes: data.duration_minutes ?? null,
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
    // Load saved prescriptions/recipes for this consultation
    try {
      const supabase = createClient()
      const { data: savedRx } = await supabase
        .from('prescriptions')
        .select('id, medications, notes, created_at')
        .eq('consultation_id', c.id)
        .order('created_at', { ascending: false })
      if (savedRx && savedRx.length > 0) {
        setSavedPrescriptions(savedRx as SavedPrescription[])
        // Load the most recent recipe's medications into the recipe editor
        const latest = savedRx[0]
        const meds = (latest.medications as Medication[]) || []
        setRecipe({ medications: meds, notes: latest.notes || '' })
        // Load exams from saved prescriptions (those that look like exams)
        const examItems = savedRx
          .filter(rx => rx.notes?.startsWith('Examen:'))
          .map(rx => {
            const meds = (rx.medications as Medication[]) || []
            return { exam_name: meds[0]?.name || '', notes: meds[0]?.indications || '' }
          })
        if (examItems.length > 0) {
          setPrescripciones(examItems)
        } else {
          setPrescripciones([])
        }
      } else {
        setSavedPrescriptions([])
        setRecipe({ medications: [], notes: '' })
        setPrescripciones([])
      }
    } catch {
      setSavedPrescriptions([])
      setRecipe({ medications: [], notes: '' })
      setPrescripciones([])
    }
    setView('consultation')
    setSaved(false)
    setConsultationTab('informe')
  }

  async function createNewConsultation() {
    if (!newConsultation.patient_id || !newConsultation.consultation_date) {
      alert('Completa paciente y fecha')
      return
    }
    if (!newConsultation.plan_id) {
      alert('Selecciona un plan o servicio')
      return
    }
    setIsCreatingConsultation(true)
    try {
      // Find selected plan details
      const selectedPlan = pricingPlans.find(p => p.id === newConsultation.plan_id)
      const planAmount = selectedPlan?.price_usd || 0
      const planName = selectedPlan?.name || ''

      // Upload receipt if provided
      let receiptUrl: string | null = null
      if (receiptFile) {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const ext = receiptFile.name.split('.').pop()
          const path = `${user.id}/${newConsultation.patient_id}/${Date.now()}.${ext}`
          const { error: uploadErr } = await supabase.storage.from('payment-receipts').upload(path, receiptFile, { upsert: false })
          if (!uploadErr) {
            const { data: publicUrl } = supabase.storage.from('payment-receipts').getPublicUrl(path)
            receiptUrl = publicUrl.publicUrl
          }
        }
      }

      // 1. Create consultation via API
      const res = await fetch('/api/doctor/consultations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: newConsultation.patient_id,
          chief_complaint: newConsultation.reason || null,
          notes: newConsultation.comments || null,
          consultation_date: new Date(newConsultation.consultation_date).toISOString(),
          amount: planAmount,
          plan_name: planName,
          payment_method: newConsultation.payment_method,
          payment_reference: newConsultation.payment_reference || null,
          payment_receipt_url: receiptUrl,
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Error al crear consulta')

      // 2. If there's an amount and payment method, register the payment
      const consultationId = result.consultation?.id
      if (consultationId && planAmount > 0) {
        await fetch('/api/doctor/payments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            consultation_id: consultationId,
            patient_id: newConsultation.patient_id,
            amount: planAmount,
            payment_method: newConsultation.payment_method,
            payment_reference: newConsultation.payment_reference || null,
          }),
        })
      }

      // 3. Send email notification to patient if enabled
      if (newConsultation.sendEmail) {
        const patient = patients.find(p => p.id === newConsultation.patient_id)
        if (patient?.email) {
          try {
            await fetch('/api/doctor/send-consultation-email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                patientEmail: patient.email,
                patientName: patient.full_name,
                doctorName,
                consultationDate: newConsultation.consultation_date,
                reason: newConsultation.reason || 'Consulta médica',
                comments: newConsultation.comments || '',
                consultationCode: result.consultation?.consultation_code || '',
              }),
            })
          } catch (emailErr) {
            console.error('Error sending email:', emailErr)
            // Don't block consultation creation if email fails
          }
        }
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
          status: (c.status ?? 'pending') as Consultation['status'],
          payment_status: c.payment_status,
          appointment_id: (c as { appointment_id?: string | null }).appointment_id ?? null,
          patient_id: c.patient_id,
          patient_name: !Array.isArray(c.patients) && c.patients ? (c.patients as { full_name: string }).full_name : 'Paciente',
          patient_phone: !Array.isArray(c.patients) && c.patients ? (c.patients as { full_name: string; phone: string | null }).phone : null,
          started_at: c.started_at ?? null,
          ended_at: c.ended_at ?? null,
          duration_minutes: c.duration_minutes ?? null,
        })))
      }

      setShowNewConsultation(false)
      setReceiptFile(null)
      setNewConsultation({
        patient_id: '',
        consultation_date: getLocalDateTimeString(),
        reason: '',
        plan_id: '',
        payment_reference: '',
        amount: '',
        payment_method: 'efectivo',
        comments: '',
        sendEmail: true,
      })
    } catch (err) {
      console.error('Error creating consultation:', err)
      alert('Error al crear consulta')
    } finally {
      setIsCreatingConsultation(false)
    }
  }

  async function saveRecipe() {
    // Permitir receta de texto libre: basta con que haya medicamentos O notas.
    const hasContent = (recipe.medications && recipe.medications.length > 0)
      || (recipe.notes && recipe.notes.replace(/<[^>]*>/g, '').trim().length > 0)
    if (!selected || !hasContent) {
      alert('Agrega al menos un medicamento o escribe notas de la receta')
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
      // Reload saved prescriptions
      const { data: savedRx } = await supabase
        .from('prescriptions')
        .select('id, medications, notes, created_at')
        .eq('consultation_id', selected.id)
        .order('created_at', { ascending: false })
      setSavedPrescriptions((savedRx || []) as SavedPrescription[])
      setShowRecipe(false)
      alert('Receta guardada')
    } catch (err) {
      console.error('Error saving recipe:', err)
      alert('Error al guardar receta')
    } finally {
      setIsSavingRecipe(false)
    }
  }

  // Helper to build PDF HTML using template config
  function buildPdfHtml(templateType: string, title: string, bodyContent: string, patientName: string, code: string, dateStr: string) {
    const cfg = templateConfigs[templateType] || defaultTemplateConfig
    const color = cfg.primary_color || '#0891b2'
    const font = cfg.font_family || 'Inter'

    return `<!DOCTYPE html>
<html>
<head>
  <title>${title} - ${code}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=${font.replace(/ /g, '+')}:wght@400;600;700&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; font-family: '${font}', 'Segoe UI', Arial, sans-serif; }
    body { padding: 40px; color: #1e293b; line-height: 1.6; }
    .header { border-bottom: 3px solid ${color}; padding-bottom: 20px; margin-bottom: 30px; display: flex; align-items: center; justify-content: space-between; }
    .header-left { display: flex; align-items: center; gap: 16px; }
    .header-logo img { max-height: 60px; max-width: 180px; object-fit: contain; }
    .header h1 { color: ${color}; font-size: 24px; }
    .header p { color: #64748b; font-size: 12px; margin-top: 4px; }
    .header-text { font-size: 11px; color: #64748b; text-align: right; max-width: 250px; }
    .meta { display: flex; gap: 40px; margin-bottom: 30px; flex-wrap: wrap; }
    .meta-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; font-weight: 700; }
    .meta-value { font-size: 14px; font-weight: 600; color: #1e293b; margin-top: 2px; }
    .section { margin-bottom: 24px; }
    .section-title { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: ${color}; font-weight: 700; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 12px; }
    .section-content { font-size: 13px; color: #334155; }
    .section-content ul, .section-content ol { padding-left: 20px; }
    .signature { margin-top: 40px; text-align: center; }
    .signature img { max-height: 80px; margin-bottom: 8px; }
    .signature-line { width: 200px; border-top: 1px solid #94a3b8; margin: 0 auto; padding-top: 6px; }
    .signature p { font-size: 11px; color: #64748b; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; text-align: center; }
    .footer p { font-size: 10px; color: #94a3b8; }
    .code { font-family: monospace; background: #f1f5f9; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      ${cfg.show_logo && cfg.logo_url ? '<div class="header-logo"><img src="' + cfg.logo_url + '" alt="Logo" /></div>' : ''}
      <div>
        <h1>${cfg.header_text ? cfg.header_text.split('\\n')[0] || 'Delta' : 'Delta'}</h1>
        <p>${title}</p>
      </div>
    </div>
    ${cfg.header_text && cfg.header_text.includes('\\n') ? '<div class="header-text">' + cfg.header_text.split('\\n').slice(1).join('<br/>') + '</div>' : ''}
  </div>

  <div class="meta">
    <div class="meta-item"><div class="meta-label">Paciente</div><div class="meta-value">${patientName}</div></div>
    <div class="meta-item"><div class="meta-label">Código</div><div class="meta-value code">${code}</div></div>
    <div class="meta-item"><div class="meta-label">Fecha</div><div class="meta-value">${dateStr}</div></div>
    <div class="meta-item"><div class="meta-label">Doctor</div><div class="meta-value">${doctorName}</div></div>
  </div>

  ${bodyContent}

  ${cfg.show_signature && cfg.signature_url ? '<div class="signature"><img src="' + cfg.signature_url + '" alt="Firma" /><div class="signature-line"><p>' + doctorName + '</p></div></div>' : ''}

  <div class="footer">
    ${cfg.footer_text ? '<p>' + cfg.footer_text + '</p>' : '<p>Documento generado por Delta</p>'}
    <p>${code} · ${new Date().toLocaleDateString('es-VE')}</p>
  </div>

  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`
  }

  function generatePDF() {
    if (!selected) return

    const printWindow = window.open('', '_blank')
    if (!printWindow) return

    const dateStr = new Date(selected.consultation_date).toLocaleDateString('es-VE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

    let bodyContent = ''
    if (report.chief_complaint) bodyContent += '<div class="section"><div class="section-title">Motivo de Consulta</div><div class="section-content">' + report.chief_complaint + '</div></div>'
    if (report.notes) bodyContent += '<div class="section"><div class="section-title">Informe Médico</div><div class="section-content">' + report.notes + '</div></div>'
    if (report.diagnosis) bodyContent += '<div class="section"><div class="section-title">Diagnóstico</div><div class="section-content">' + report.diagnosis + '</div></div>'

    if (includeRecipe) {
      if (recipe.medications.length > 0) {
        bodyContent += '<div class="section"><div class="section-title">Medicamentos</div><div class="section-content">'
        bodyContent += recipe.medications.map((m: Medication, i: number) =>
          '<div style="margin-bottom:10px;padding:8px 12px;border:1px solid #e2e8f0;border-radius:6px">' +
          '<div style="font-weight:700;color:#1e293b">' + (i+1) + '. ' + (m.name || '') + '</div>' +
          '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:4px">' +
          (m.dose ? '<span style="font-size:12px;color:#475569"><strong>Dosis:</strong> ' + m.dose + '</span>' : '') +
          (m.frequency ? '<span style="font-size:12px;color:#475569"><strong>Frecuencia:</strong> ' + m.frequency + '</span>' : '') +
          (m.duration ? '<span style="font-size:12px;color:#475569"><strong>Duración:</strong> ' + m.duration + '</span>' : '') +
          '</div>' +
          (m.indications ? '<div style="font-size:12px;color:#64748b;margin-top:2px"><em>' + m.indications + '</em></div>' : '') +
          '</div>'
        ).join('')
        bodyContent += '</div></div>'
      }
      if (report.treatment) bodyContent += '<div class="section"><div class="section-title">Plan de Tratamiento</div><div class="section-content">' + report.treatment + '</div></div>'
    }

    if (includePrescripciones && prescripciones.length > 0) {
      bodyContent += '<div class="section"><div class="section-title">Prescripciones</div><div class="section-content"><ul>' + prescripciones.filter(p => p.exam_name.trim()).map(p => '<li>' + p.exam_name + (p.notes ? ' - ' + p.notes : '') + '</li>').join('') + '</ul></div></div>'
    }

    const htmlContent = buildPdfHtml('informe', 'Informe Médico', bodyContent, selected.patient_name, selected.consultation_code, dateStr)
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

  // ── Consultation Timer Logic ─────────────────────────────────────────────────

  // Format elapsed seconds as MM:SS or HH:MM:SS
  function formatElapsed(secs: number): string {
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const s = secs % 60
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  // Start consultation timer
  async function startConsultationTimer() {
    if (!selected) return
    const now = new Date()
    setConsultationStarted(true)
    setConsultationEnded(false)
    setConsultationStartTime(now)
    setElapsedSeconds(0)

    // Persist started_at to DB
    const supabase = createClient()
    await supabase.from('consultations').update({
      started_at: now.toISOString(),
      ended_at: null,
      duration_minutes: null,
    }).eq('id', selected.id)

    // Update local state
    setSelected(prev => prev ? { ...prev, started_at: now.toISOString(), ended_at: null, duration_minutes: null } : null)
    setConsultations(prev => prev.map(c => c.id === selected.id ? { ...c, started_at: now.toISOString(), ended_at: null, duration_minutes: null } : c))

    // Start interval
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
    timerIntervalRef.current = setInterval(() => {
      setElapsedSeconds(prev => prev + 1)
    }, 1000)
  }

  // End consultation timer + save report
  async function endConsultationTimer() {
    if (!selected || !consultationStartTime) return
    setEndingConsultation(true)

    const endTime = new Date()
    const durationMs = endTime.getTime() - consultationStartTime.getTime()
    const durationMin = Math.round(durationMs / 60000)

    // Stop the interval
    if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null }

    // Save to DB: ended_at, duration, and also save the report
    const supabase = createClient()
    await supabase.from('consultations').update({
      ended_at: endTime.toISOString(),
      duration_minutes: durationMin,
      chief_complaint: report.chief_complaint,
      notes: report.notes,
      diagnosis: report.diagnosis,
      treatment: report.treatment,
      payment_status: report.payment_status,
    }).eq('id', selected.id)

    // Update local state
    setSelected(prev => prev ? { ...prev, ended_at: endTime.toISOString(), duration_minutes: durationMin, ...report } : null)
    setConsultations(prev => prev.map(c => c.id === selected.id ? { ...c, ended_at: endTime.toISOString(), duration_minutes: durationMin, ...report } : c))

    setConsultationEnded(true)
    setShowEndConfirm(false)
    setEndingConsultation(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  // Cleanup timer on unmount or consultation change
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null }
    }
  }, [])

  // When opening a different consultation, restore timer state
  useEffect(() => {
    if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null }
    if (!selected) {
      setConsultationStarted(false)
      setConsultationEnded(false)
      setConsultationStartTime(null)
      setElapsedSeconds(0)
      return
    }
    if (selected.started_at && !selected.ended_at) {
      // Consultation was started but not ended — resume timer
      const start = new Date(selected.started_at)
      setConsultationStarted(true)
      setConsultationEnded(false)
      setConsultationStartTime(start)
      const elapsed = Math.floor((Date.now() - start.getTime()) / 1000)
      setElapsedSeconds(elapsed)
      timerIntervalRef.current = setInterval(() => {
        setElapsedSeconds(prev => prev + 1)
      }, 1000)
    } else if (selected.started_at && selected.ended_at) {
      // Consultation already finished
      setConsultationStarted(true)
      setConsultationEnded(true)
      setConsultationStartTime(new Date(selected.started_at))
      setElapsedSeconds(selected.duration_minutes ? selected.duration_minutes * 60 : 0)
    } else {
      // Not started
      setConsultationStarted(false)
      setConsultationEnded(false)
      setConsultationStartTime(null)
      setElapsedSeconds(0)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id])

  // Auto-save: debounce 3 seconds after any report field changes
  const reportRef = useRef(report)
  reportRef.current = report
  const selectedRef = useRef(selected)
  selectedRef.current = selected

  useEffect(() => {
    if (!selected) return
    // Don't auto-save if the report hasn't been loaded yet (initial open)
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(() => {
      if (!selectedRef.current) return
      const r = reportRef.current
      // Only save if there's some content
      if (!r.chief_complaint && !r.notes && !r.diagnosis && !r.treatment) return
      setAutoSaving(true)
      const supabase = createClient()
      supabase.from('consultations').update({
        chief_complaint: r.chief_complaint,
        notes: r.notes,
        diagnosis: r.diagnosis,
        treatment: r.treatment,
        payment_status: r.payment_status,
      }).eq('id', selectedRef.current.id).then(() => {
        setAutoSaving(false)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
        // Update local list
        setConsultations(prev => prev.map(c => c.id === selectedRef.current?.id ? { ...c, ...r } : c))
      })
    }, 3000)
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report.chief_complaint, report.notes, report.diagnosis, report.treatment, report.payment_status, selected?.id])

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
            {/* Header: estructura compacta de 2 filas
                Fila 1: Volver + Badges de estado (consulta + pago)
                Fila 2: Acciones de status (atendida/no asistió/aprobar pago) | Acciones de archivo (PDF/Imprimir/Eliminar/Compartir) */}
            <div className="space-y-3">
              {/* Fila 1: navegación + badges en vivo */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <button onClick={() => setView('list')} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 transition-colors">
                  <ArrowLeft className="w-4 h-4" /> Volver a consultas
                </button>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${CONSULTA_STATUS[selected.status]?.color || 'bg-slate-100 text-slate-700'}`}
                    title="Estado de la consulta"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${CONSULTA_STATUS[selected.status]?.dot || 'bg-slate-400'}`}></span>
                    Consulta: {CONSULTA_STATUS[selected.status]?.label || selected.status}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${PAYMENT_STATUS[selected.payment_status]?.color || 'bg-slate-100 text-slate-700'}`}
                    title="Estado del pago"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${PAYMENT_STATUS[selected.payment_status]?.dot || 'bg-slate-400'}`}></span>
                    Pago: {PAYMENT_STATUS[selected.payment_status]?.label || selected.payment_status}
                  </span>
                </div>
              </div>

              {/* Fila 2: acciones agrupadas */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                {/* Grupo izquierdo: cambios de status (solo aparecen si aplican) */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {selected.status !== 'completed' && (
                    <button
                      onClick={() => updateConsultaStatus(selected.id, 'completed', selected.appointment_id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-xs font-semibold hover:bg-emerald-600 transition-colors"
                      title="Marcar consulta como atendida"
                    >
                      <Check className="w-3.5 h-3.5" /> Atendida
                    </button>
                  )}
                  {selected.status !== 'no_show' && (
                    <button
                      onClick={() => { if (confirm('¿Confirmas que el paciente NO asistió?')) updateConsultaStatus(selected.id, 'no_show', selected.appointment_id) }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-red-200 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors"
                      title="Marcar como no asistido"
                    >
                      <X className="w-3.5 h-3.5" /> No asistió
                    </button>
                  )}
                  {selected.payment_status !== 'approved' && (
                    <button
                      onClick={() => updatePagoStatus(selected.id, 'approved', selected.appointment_id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-500 text-white rounded-lg text-xs font-semibold hover:bg-teal-600 transition-colors"
                      title="Marcar pago como aprobado"
                    >
                      <DollarSign className="w-3.5 h-3.5" /> Aprobar pago
                    </button>
                  )}
                </div>

                {/* Grupo derecho: acciones de archivo (compactas, solo iconos en sm) */}
                <div className="flex items-center gap-1.5">
                  <button onClick={generatePDF}
                    title="Descargar PDF"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
                    <FileText className="w-3.5 h-3.5" /> <span className="hidden sm:inline">PDF</span>
                  </button>
                  <button onClick={generatePDF}
                    title="Imprimir"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
                    <Printer className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Imprimir</span>
                  </button>
                  <button onClick={() => selected && setConfirmDeleteConsulta(selected)}
                    title="Eliminar consulta"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-red-200 rounded-lg text-xs font-semibold text-red-500 hover:bg-red-50 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Eliminar</span>
                  </button>
                {/* Share Button */}
                <div className="relative">
                  <button onClick={() => setShowShare(!showShare)}
                    title="Compartir"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
                    <Share2 className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Compartir</span>
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
                        <button onClick={async () => {
                          const docs: string[] = []
                          const docLinks: string[] = []
                          const dateStr = new Date(selected.consultation_date).toLocaleDateString('es-VE', { year: 'numeric', month: 'long', day: 'numeric' })

                          // Generate and upload PDFs for selected documents
                          const uploadDoc = async (templateType: string, title: string, bodyContent: string) => {
                            try {
                              const html = buildPdfHtml(templateType, title, bodyContent, selected.patient_name, selected.consultation_code, dateStr)
                              const res = await fetch('/api/doctor/share-pdf', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  htmlContent: html,
                                  fileName: `${templateType}-${selected.consultation_code}`,
                                  consultationCode: selected.consultation_code,
                                }),
                              })
                              const data = await res.json()
                              if (data.url) return data.url
                            } catch (err) { console.error('Upload error:', err) }
                            return null
                          }

                          if (shareItems.informe) {
                            docs.push('informe médico')
                            let body = ''
                            if (report.chief_complaint) body += '<div class="section"><div class="section-title">Motivo</div><div class="section-content">' + report.chief_complaint + '</div></div>'
                            if (report.notes) body += '<div class="section"><div class="section-title">Informe</div><div class="section-content">' + report.notes + '</div></div>'
                            if (report.diagnosis) body += '<div class="section"><div class="section-title">Diagnóstico</div><div class="section-content">' + report.diagnosis + '</div></div>'
                            const url = await uploadDoc('informe', 'Informe Médico', body)
                            if (url) docLinks.push(url)
                          }
                          if (shareItems.recipe && recipe.medications.length > 0) {
                            docs.push('receta')
                            let body = '<div class="section"><div class="section-title">Medicamentos</div>'
                            body += recipe.medications.map((m, i) =>
                              '<div style="margin-bottom:10px;padding:8px;border:1px solid #e2e8f0;border-radius:6px"><strong>' + (i+1) + '. ' + m.name + '</strong>' +
                              (m.dose ? ' | Dosis: ' + m.dose : '') + (m.frequency ? ' | Freq: ' + m.frequency : '') + (m.duration ? ' | Dur: ' + m.duration : '') +
                              (m.indications ? '<br><em>' + m.indications + '</em>' : '') + '</div>'
                            ).join('') + '</div>'
                            const url = await uploadDoc('recipe', 'Receta Médica', body)
                            if (url) docLinks.push(url)
                          }
                          if (shareItems.prescripciones && prescripciones.length > 0) {
                            docs.push('prescripciones')
                            const body = '<div class="section"><div class="section-title">Exámenes</div><div class="section-content"><ul>' +
                              prescripciones.filter(p => p.exam_name.trim()).map(p => '<li>' + p.exam_name + (p.notes ? ' - ' + p.notes : '') + '</li>').join('') + '</ul></div></div>'
                            const url = await uploadDoc('prescripciones', 'Prescripciones', body)
                            if (url) docLinks.push(url)
                          }
                          if (shareItems.reposo && reposoDiagnosis) {
                            docs.push('constancia de reposo')
                            const body = '<div class="section"><div class="section-title">Reposo</div><div class="section-content">Diagnóstico: ' + reposoDiagnosis + '<br>Días: ' + reposoDays + '</div></div>'
                            const url = await uploadDoc('reposo', 'Constancia de Reposo', body)
                            if (url) docLinks.push(url)
                          }

                          if (docs.length === 0) { alert('Selecciona al menos un documento'); return }

                          let message = shareTemplate
                            .replace('{paciente}', selected.patient_name)
                            .replace('{fecha}', new Date(selected.consultation_date).toLocaleDateString('es-VE'))
                            .replace('{documentos}', docs.join(', '))
                            .replace('{doctor}', doctorName)
                            .replace('{codigo}', selected.consultation_code || '')

                          // Append document links
                          if (docLinks.length > 0) {
                            message += '\n\n' + docLinks.map((url, i) => `${docs[i] || 'Documento'}: ${url}`).join('\n')
                          }

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
            </div>

            {/* Medical Report Form with Safari-style Tabs */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              {/* Safari-style Tab Navigation — DINÁMICAS según blocks_snapshot del doctor.
                  Si no hay snapshot (consultas viejas), usamos las 5 tabs clásicas. */}
              <div className="flex items-end gap-1 px-6 pt-4 bg-slate-50 border-b border-slate-200 overflow-x-auto">
                {(() => {
                  const dynamicTabs: { key: string; label: string; isDynamic: boolean }[] = []
                  const snapshot = (selected as Consultation).blocks_snapshot
                  if (snapshot && snapshot.length > 0) {
                    // Tab "Informe" siempre primero (campos clásicos: motivo, diagnóstico, tratamiento)
                    dynamicTabs.push({ key: 'informe', label: 'Informe', isDynamic: false })
                    // Tabs dinámicos según los bloques de la plantilla del doctor
                    const sorted = [...snapshot].sort((a, b) => a.sort_order - b.sort_order)
                    for (const b of sorted) {
                      // No duplicar "informe" si el doctor lo tiene en su plantilla
                      if (b.key === 'chief_complaint' || b.key === 'diagnosis' || b.key === 'treatment') continue
                      dynamicTabs.push({ key: `block:${b.key}`, label: b.label, isDynamic: true })
                    }
                  } else {
                    // Fallback: tabs clásicas para consultas viejas sin snapshot
                    ;[
                      { key: 'informe', label: 'Informe' },
                      { key: 'recipe', label: 'Receta' },
                      { key: 'prescripciones', label: 'Prescripciones' },
                      { key: 'reposo', label: 'Reposo' },
                      { key: 'notas', label: 'Notas' },
                    ].forEach(t => dynamicTabs.push({ ...t, isDynamic: false }))
                  }
                  return dynamicTabs.map(t => (
                    <button
                      key={t.key}
                      onClick={() => setConsultationTab(t.key)}
                      className={`safari-tab text-sm font-semibold transition-all whitespace-nowrap ${
                        consultationTab === t.key
                          ? 'active border-t border-l border-r border-slate-200 text-slate-900'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))
                })()}
              </div>

              {/* Renderer del bloque dinámico actual (cuando consultationTab empieza con "block:") */}
              {consultationTab.startsWith('block:') && (selected as Consultation).blocks_snapshot && (() => {
                const blockKey = consultationTab.replace('block:', '')
                const snapshot = ((selected as Consultation).blocks_snapshot || []) as SnapshotBlock[]
                const oneBlock = snapshot.filter(b => b.key === blockKey)
                const data = (selected as Consultation).blocks_data || {}
                return (
                  <div className="p-6">
                    <DynamicBlocks
                      blocks={oneBlock}
                      values={data}
                      onChange={(key, value) => {
                        // Actualizamos el state local de selected para reflejar el cambio
                        const next = { ...data, [key]: value }
                        ;(selected as Consultation).blocks_data = next
                        // Re-render del componente
                        setSelected({ ...(selected as Consultation), blocks_data: next })
                      }}
                      onSave={async () => {
                        const supabase = createClient()
                        await supabase.from('consultations')
                          .update({ blocks_data: (selected as Consultation).blocks_data || {} })
                          .eq('id', selected!.id)
                        alert('Bloque guardado')
                      }}
                    />
                  </div>
                )
              })()}

              {/* Tab Content — clásico. Solo se muestra si NO estamos en tab dinámica (block:*) */}
              <div className={`p-6 space-y-4 ${consultationTab.startsWith('block:') ? 'hidden' : ''}`}>
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
                        <Pill className="w-3.5 h-3.5" /> {recipe.medications.length > 0 ? 'Editar receta' : 'Generar receta'}
                      </button>
                    </div>

                    {/* Show saved medications summary */}
                    {recipe.medications.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Medicamentos en receta ({recipe.medications.length})</p>
                        {recipe.medications.map((med, idx) => (
                          <div key={idx} className="bg-teal-50 border border-teal-200 rounded-lg p-3">
                            <p className="text-sm font-bold text-teal-900">{med.name}</p>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                              {med.dose && <span className="text-xs text-teal-700">Dosis: {med.dose}</span>}
                              {med.frequency && <span className="text-xs text-teal-700">Frecuencia: {med.frequency}</span>}
                              {med.duration && <span className="text-xs text-teal-700">Duración: {med.duration}</span>}
                            </div>
                            {med.indications && <p className="text-xs text-teal-600 mt-1">{med.indications}</p>}
                          </div>
                        ))}
                      </div>
                    )}

                    <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1.5">
                      <Pill className="w-3.5 h-3.5 text-slate-400" /> Tratamiento / Indicaciones
                    </label>
                    <RichTextEditor value={report.treatment} onChange={html => setReport(p => ({ ...p, treatment: html }))}
                      placeholder="Medicamentos, dosis, indicaciones, próxima cita..." />
                    <div className="flex gap-2 pt-2">
                      <button onClick={() => setShowRecipe(true)}
                        className="flex-1 flex items-center justify-center gap-2 g-bg px-4 py-2.5 rounded-xl text-sm font-bold text-white hover:opacity-90">
                        <Pill className="w-4 h-4" /> {recipe.medications.length > 0 ? 'Editar receta' : 'Generar receta'}
                      </button>
                      <button onClick={() => {
                        const printWindow = window.open('', '_blank')
                        if (!printWindow) return
                        let bodyContent = ''
                        if (recipe.medications.length > 0) {
                          bodyContent += '<div class="section"><div class="section-title">Medicamentos</div>'
                          bodyContent += recipe.medications.map((m, i) =>
                            '<div style="margin-bottom:12px;padding:10px 14px;border:1px solid #e2e8f0;border-radius:8px">' +
                            '<div style="font-size:14px;font-weight:700;color:#1e293b">' + (i+1) + '. ' + (m.name || 'Sin nombre') + '</div>' +
                            '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:6px">' +
                            (m.dose ? '<div style="font-size:12px;color:#475569"><strong>Dosis:</strong> ' + m.dose + '</div>' : '') +
                            (m.frequency ? '<div style="font-size:12px;color:#475569"><strong>Frecuencia:</strong> ' + m.frequency + '</div>' : '') +
                            (m.duration ? '<div style="font-size:12px;color:#475569"><strong>Duración:</strong> ' + m.duration + '</div>' : '') +
                            '</div>' +
                            (m.indications ? '<div style="font-size:12px;color:#64748b;margin-top:4px"><em>' + m.indications + '</em></div>' : '') +
                            '</div>'
                          ).join('') + '</div>'
                        }
                        if (report.treatment) bodyContent += '<div class="section"><div class="section-title">Indicaciones generales</div><div class="section-content">' + report.treatment + '</div></div>'
                        const dateStr = new Date(selected.consultation_date).toLocaleDateString('es-VE', { year: 'numeric', month: 'long', day: 'numeric' })
                        printWindow.document.write(buildPdfHtml('recipe', 'Receta Médica', bodyContent, selected.patient_name, selected.consultation_code, dateStr))
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

                    {/* Quick exams from templates */}
                    {quickExams.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 mb-2">Exámenes frecuentes (clic para agregar):</p>
                        <div className="flex flex-wrap gap-1.5">
                          {quickExams.map(q => (
                            <button key={q.id}
                              onClick={() => setPrescripciones(prev => [...prev, { exam_name: q.name, notes: q.details || '' }])}
                              className="text-xs px-2.5 py-1.5 bg-teal-50 text-teal-700 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors font-medium">
                              + {q.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

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
                            // Reload saved prescriptions
                            const { data: savedRx } = await supabase
                              .from('prescriptions')
                              .select('id, medications, notes, created_at')
                              .eq('consultation_id', selected.id)
                              .order('created_at', { ascending: false })
                            setSavedPrescriptions((savedRx || []) as SavedPrescription[])
                            alert('Prescripciones guardadas')
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
                          const bodyContent = '<div class="section"><div class="section-title">Exámenes Solicitados</div><div class="section-content">' +
                            exams.map((e, i) => '<div style="margin-bottom:12px;padding:10px 14px;border:1px solid #e2e8f0;border-radius:8px"><div style="font-size:14px;font-weight:600;color:#1e293b">' + (i + 1) + '. ' + e.exam_name + '</div>' + (e.notes ? '<div style="font-size:12px;color:#64748b;margin-top:4px">' + e.notes + '</div>' : '') + '</div>').join('') +
                            '</div></div>'
                          const dateStr = new Date(selected.consultation_date).toLocaleDateString('es-VE', { year: 'numeric', month: 'long', day: 'numeric' })
                          printWindow.document.write(buildPdfHtml('prescripciones', 'Prescripción de Exámenes', bodyContent, selected.patient_name, selected.consultation_code, dateStr))
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
                      const bodyContent = '<div class="section"><div class="section-title">Diagnóstico</div><div class="section-content">' + reposoDiagnosis + '</div></div>' +
                        '<div class="section"><div class="section-title">Período de Reposo</div><div class="section-content">Desde: ' +
                        new Date(reposoFrom).toLocaleDateString('es-VE', { year: 'numeric', month: 'long', day: 'numeric' }) + '<br>Hasta: ' +
                        new Date(reposoTo).toLocaleDateString('es-VE', { year: 'numeric', month: 'long', day: 'numeric' }) + '<br>Duración: ' + reposoDays + ' días</div></div>'
                      const dateStr = new Date(selected.consultation_date).toLocaleDateString('es-VE', { year: 'numeric', month: 'long', day: 'numeric' })
                      printWindow.document.write(buildPdfHtml('reposo', 'Constancia de Reposo', bodyContent, selected.patient_name, selected.consultation_code, dateStr))
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

            {/* Consultation Timer */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              {/* Timer display + controls */}
              {!consultationStarted ? (
                <button onClick={startConsultationTimer}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm font-bold text-emerald-700 hover:bg-emerald-100 transition-colors">
                  <Play className="w-4 h-4" /> Iniciar consulta
                </button>
              ) : consultationEnded ? (
                <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-bold text-slate-800">Consulta finalizada</p>
                    <p className="text-xs text-slate-500">
                      Duración: {selected.duration_minutes != null ? `${selected.duration_minutes} min` : formatElapsed(elapsedSeconds)}
                    </p>
                  </div>
                  <Timer className="w-4 h-4 text-slate-400" />
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-3 px-4 py-3 bg-teal-50 border border-teal-200 rounded-lg">
                    <div className="w-2.5 h-2.5 rounded-full bg-teal-500 animate-pulse shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-bold text-teal-800">Consulta en curso</p>
                      <p className="text-lg font-mono font-bold text-teal-700 tabular-nums">{formatElapsed(elapsedSeconds)}</p>
                    </div>
                    <Timer className="w-5 h-5 text-teal-400" />
                  </div>
                  <button onClick={() => setShowEndConfirm(true)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm font-bold text-red-600 hover:bg-red-100 transition-colors">
                    <Square className="w-3.5 h-3.5" /> Finalizar consulta
                  </button>
                </div>
              )}

              {!consultationStarted && (
                <p className="text-xs text-slate-400 text-center">Opcional: registra el tiempo de la consulta</p>
              )}
            </div>

            {/* Save button + auto-save status */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {autoSaving ? (
                    <><Loader2 className="w-4 h-4 text-teal-500 animate-spin" /><span className="text-xs text-teal-600 font-medium">Guardando...</span></>
                  ) : saved ? (
                    <><CheckCircle className="w-4 h-4 text-green-500" /><span className="text-xs text-green-600 font-medium">Guardado</span></>
                  ) : (
                    <><Clock className="w-4 h-4 text-slate-400" /><span className="text-xs text-slate-500">Auto-guardado activo</span></>
                  )}
                </div>
                <button onClick={saveReport} disabled={isPending || autoSaving}
                  className="flex items-center gap-2 g-bg px-4 py-2 rounded-lg text-sm font-bold text-white hover:opacity-90 disabled:opacity-60 transition-opacity">
                  {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Guardar consulta
                </button>
              </div>
              <p className="text-xs text-slate-500">Los cambios se guardan automaticamente. El informe queda registrado en el historial clinico del paciente.</p>
            </div>

            {/* End Consultation Confirmation Modal */}
            {showEndConfirm && (
              <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowEndConfirm(false)}>
                <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center shrink-0">
                      <Timer className="w-6 h-6 text-amber-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">Finalizar consulta</h3>
                      <p className="text-sm text-slate-500">Tiempo transcurrido: {formatElapsed(elapsedSeconds)}</p>
                    </div>
                  </div>
                  <p className="text-sm text-slate-600">¿Deseas finalizar la consulta y guardar el informe? Se registrará la duración de la consulta.</p>
                  <div className="flex gap-3">
                    <button onClick={() => setShowEndConfirm(false)}
                      className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-200 transition-colors">
                      Cancelar
                    </button>
                    <button onClick={endConsultationTimer} disabled={endingConsultation}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 g-bg text-white rounded-lg text-sm font-bold hover:opacity-90 disabled:opacity-60 transition-opacity">
                      {endingConsultation ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                      Sí, finalizar
                    </button>
                  </div>
                </div>
              </div>
            )}
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
                {selected.duration_minutes != null && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Duración</span>
                    <span className="font-semibold text-slate-800 flex items-center gap-1">
                      <Timer className="w-3 h-3 text-teal-500" />
                      {selected.duration_minutes} min
                    </span>
                  </div>
                )}
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
                    {(['pending','approved'] as const).map(key => {
                      const val = PAYMENT_STATUS[key]
                      const active = normalizePaymentStatus(report.payment_status) === key
                      return (
                        <button key={key} onClick={() => setReport(p => ({ ...p, payment_status: key as Consultation['payment_status'] }))}
                          className={`w-full text-left py-2 px-3 rounded-lg text-xs font-bold border-2 transition-all ${active ? val.color + ' border-current' : 'border-slate-200 text-slate-500 bg-white hover:bg-slate-50'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full inline-block mr-2 ${active ? val.dot : 'bg-slate-300'}`} />{val.label}
                        </button>
                      )
                    })}
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
                            <div className="text-right">
                              <span className="font-semibold text-slate-800">${appointmentData.plan_price.toFixed(2)}</span>
                              {bcvRate && <span className="block text-[10px] text-slate-400">{toBs(appointmentData.plan_price)}</span>}
                            </div>
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

              {/* Quick medications from templates */}
              {quickMeds.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-2">Medicamentos frecuentes (clic para agregar):</p>
                  <div className="flex flex-wrap gap-1.5">
                    {quickMeds.map(q => (
                      <button key={q.id}
                        onClick={() => setRecipe(p => ({
                          ...p,
                          medications: [...p.medications, { name: q.name, dose: q.details || '', frequency: '', duration: '', indications: '' }]
                        }))}
                        className="text-xs px-2.5 py-1.5 bg-teal-50 text-teal-700 border border-teal-200 rounded-lg hover:bg-teal-100 transition-colors font-medium">
                        + {q.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

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
                    {(c.payment_status === 'approved') && <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full hidden sm:inline-block" title="Pago aprobado">Aprobada</span>}
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
                {/* Step 1: Patient search (identical to agenda) */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Paciente <span className="text-red-400">*</span></label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Buscar paciente..."
                      value={newConsultation.patient_id ? patients.find(p => p.id === newConsultation.patient_id)?.full_name || patientSearchText : patientSearchText}
                      onChange={e => {
                        setPatientSearchText(e.target.value)
                        if (newConsultation.patient_id) setNewConsultation(p => ({ ...p, patient_id: '' }))
                      }}
                      className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                    />
                    {newConsultation.patient_id && (
                      <button onClick={() => { setNewConsultation(p => ({ ...p, patient_id: '' })); setPatientSearchText('') }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  {!newConsultation.patient_id && patientSearchText.length > 0 && (
                    <div className="border border-slate-200 rounded-lg max-h-36 overflow-y-auto">
                      {patients.filter(p => p.full_name.toLowerCase().includes(patientSearchText.toLowerCase())).length === 0 ? (
                        <p className="text-xs text-slate-400 p-3 text-center">No se encontro paciente</p>
                      ) : (
                        patients.filter(p => p.full_name.toLowerCase().includes(patientSearchText.toLowerCase())).slice(0, 8).map(p => (
                          <button key={p.id}
                            onClick={() => { setNewConsultation(prev => ({ ...prev, patient_id: p.id })); setPatientSearchText('') }}
                            className="w-full text-left px-3 py-2 hover:bg-teal-50 text-sm text-slate-700 border-b border-slate-100 last:border-b-0 flex items-center justify-between">
                            <span className="font-medium">{p.full_name}</span>
                            {p.phone && <span className="text-xs text-slate-400">{p.phone}</span>}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                  {newConsultation.patient_id && (
                    <div className="flex items-center gap-2 bg-teal-50 rounded-lg px-3 py-2">
                      <CheckCircle className="w-4 h-4 text-teal-500" />
                      <span className="text-sm font-semibold text-teal-700">
                        {patients.find(p => p.id === newConsultation.patient_id)?.full_name}
                      </span>
                    </div>
                  )}
                </div>

                {/* Step 2: Date and time slot selection */}
                <div className="space-y-3">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Fecha y hora</label>

                  {/* Date selector */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <button type="button" onClick={() => setWeekOffset(Math.max(0, weekOffset - 1))} disabled={weekOffset === 0}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 disabled:opacity-30 transition-colors">
                        <ChevronDown className="w-4 h-4 rotate-90" />
                      </button>
                      <span className="text-xs text-slate-400">Selecciona un día</span>
                      <button type="button" onClick={() => setWeekOffset(weekOffset + 1)} disabled={weekOffset * 5 + 5 >= availableDates.length}
                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 disabled:opacity-30 transition-colors">
                        <ChevronDown className="w-4 h-4 -rotate-90" />
                      </button>
                    </div>
                    <div className="grid grid-cols-5 gap-1.5">
                      {weekDates.map(d => {
                        const isSelected = selectedDate === d.date
                        const isToday = d.date === today
                        return (
                          <button key={d.date} type="button"
                            onClick={() => { setSelectedDate(d.date); setSelectedTime(''); setNewConsultation(p => ({ ...p, consultation_date: '' })) }}
                            className={`py-2 px-1 rounded-xl text-center transition-all border-2 ${
                              isSelected
                                ? 'border-teal-400 bg-teal-50 text-teal-700'
                                : 'border-slate-100 bg-white hover:border-teal-200 text-slate-600'
                            }`}>
                            <p className="text-[10px] font-medium capitalize">{d.label.split(' ')[0]}</p>
                            <p className={`text-sm font-bold ${isToday ? 'text-teal-600' : ''}`}>{d.label.split(' ').slice(1).join(' ')}</p>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Time slot grid */}
                  {selectedDate && (
                    <div>
                      <p className="text-xs text-slate-400 mb-2">Horarios disponibles</p>
                      {timeSlotsForDate.length === 0 ? (
                        <div className="bg-amber-50 rounded-lg p-3 text-xs text-amber-700">
                          No hay horarios disponibles para este día. Configura tu disponibilidad en Agenda.
                        </div>
                      ) : (
                        <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5">
                          {timeSlotsForDate.map(time => {
                            const booked = isTimeBooked(selectedDate, time)
                            const isSelected = selectedTime === time
                            return (
                              <button key={time} type="button"
                                disabled={booked}
                                onClick={() => {
                                  setSelectedTime(time)
                                  const dateTimeISO = new Date(`${selectedDate}T${time}:00`).toISOString()
                                  setNewConsultation(p => ({ ...p, consultation_date: dateTimeISO }))
                                }}
                                className={`py-2 px-2 rounded-lg text-xs font-semibold transition-all ${
                                  booked
                                    ? 'bg-slate-100 text-slate-300 cursor-not-allowed line-through'
                                    : isSelected
                                    ? 'bg-teal-500 text-white shadow-md'
                                    : 'bg-white border border-slate-200 text-slate-600 hover:border-teal-300 hover:text-teal-600'
                                }`}>
                                {time}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {selectedDate && selectedTime && (
                    <div className="flex items-center gap-2 bg-teal-50 rounded-lg px-3 py-2">
                      <CheckCircle className="w-4 h-4 text-teal-500" />
                      <span className="text-sm font-semibold text-teal-700">
                        {new Date(`${selectedDate}T${selectedTime}:00`).toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long' })} a las {selectedTime}
                      </span>
                    </div>
                  )}
                </div>

                {/* Step 3: Reason */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Motivo de consulta</label>
                  <input type="text" placeholder="Ej: Revision general, dolor de cabeza..." value={newConsultation.reason}
                    onChange={e => setNewConsultation(p => ({ ...p, reason: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none" />
                </div>

                {/* Step 4: Plan selector */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Plan de consulta <span className="text-red-400">*</span></label>
                  {pricingPlans.length === 0 ? (
                    <div className="bg-amber-50 rounded-lg p-3 text-xs text-amber-700">
                      No tienes planes configurados. <a href="/doctor/services" className="font-bold underline">Configura tus servicios</a>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2">
                      {pricingPlans.map(plan => (
                        <button key={plan.id} type="button"
                          onClick={() => setNewConsultation(p => ({ ...p, plan_id: plan.id, amount: String(plan.price_usd) }))}
                          className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all ${newConsultation.plan_id === plan.id ? 'border-teal-400 bg-teal-50' : 'border-slate-200 hover:border-slate-300 bg-white'}`}>
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-slate-800">{plan.name}</span>
                            <div className="text-right">
                              <span className="text-sm font-bold text-teal-600">${plan.price_usd.toFixed(2)}</span>
                              {bcvRate && <span className="block text-[11px] text-slate-400">{toBs(plan.price_usd)}</span>}
                            </div>
                          </div>
                          <span className="text-xs text-slate-400">{plan.duration_minutes} min</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Step 5: Payment method + reference */}
                {newConsultation.plan_id && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Metodo de pago <span className="text-red-400">*</span></label>
                      <select
                        value={newConsultation.payment_method}
                        onChange={e => setNewConsultation(p => ({ ...p, payment_method: e.target.value as any }))}
                        className="w-full mt-1.5 px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none">
                        <option value="">-- Selecciona metodo de pago --</option>
                        {[
                          { value: 'efectivo', label: 'Efectivo USD' },
                          { value: 'efectivo_bs', label: 'Efectivo Bs' },
                          { value: 'pago_movil', label: 'Pago Movil' },
                          { value: 'transferencia', label: 'Transferencia' },
                          { value: 'zelle', label: 'Zelle' },
                          { value: 'binance', label: 'Binance' },
                          { value: 'pos', label: 'POS / Punto de venta' },
                          { value: 'seguro', label: 'Seguro' },
                        ].filter(m => doctorPaymentMethods.length === 0 || doctorPaymentMethods.includes(m.value)).map(m => (
                          <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Referencia / Nro. comprobante</label>
                      <input type="text" value={newConsultation.payment_reference}
                        onChange={e => setNewConsultation(p => ({ ...p, payment_reference: e.target.value }))}
                        placeholder="Ej: #12345, ultimo 4 digitos..."
                        className="w-full mt-1.5 px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none" />
                    </div>

                    {/* Comprobante upload */}
                    {newConsultation.payment_method && requiresReceipt(newConsultation.payment_method) && (
                      <div className="border border-dashed border-slate-300 rounded-xl p-4 space-y-2 bg-slate-50/50">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Adjuntar comprobante <span className="text-xs font-normal normal-case text-slate-400">(opcional)</span></p>
                        <label className="flex items-center justify-center border-2 border-dashed border-teal-300/50 rounded-xl p-3 cursor-pointer hover:bg-white/80 transition-colors">
                          <input type="file" accept="image/*,application/pdf" onChange={e => setReceiptFile(e.target.files?.[0] || null)} className="hidden" />
                          <div className="text-center">
                            <Upload className="w-4 h-4 mx-auto mb-1 text-teal-500" />
                            <p className="text-xs font-medium text-slate-600">{receiptFile ? receiptFile.name : 'JPG, PNG o PDF'}</p>
                          </div>
                        </label>
                        {receiptFile && <p className="text-xs text-slate-500">{(receiptFile.size / 1024 / 1024).toFixed(2)} MB</p>}
                      </div>
                    )}
                  </div>
                )}

                {/* Step 6: Comments */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Comentarios / Notas</label>
                  <textarea placeholder="Notas adicionales sobre la consulta..." value={newConsultation.comments}
                    onChange={e => setNewConsultation(p => ({ ...p, comments: e.target.value }))}
                    rows={3}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none resize-none" />
                </div>

                {/* Email notification toggle */}
                <label className="flex items-center gap-3 cursor-pointer p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <input type="checkbox" checked={newConsultation.sendEmail}
                    onChange={e => setNewConsultation(p => ({ ...p, sendEmail: e.target.checked }))}
                    className="w-4 h-4 rounded border-slate-300 accent-teal-500" />
                  <div>
                    <span className="text-sm font-semibold text-slate-700">Enviar correo al paciente</span>
                    <p className="text-xs text-slate-500">Se enviara un email con los detalles de la consulta</p>
                  </div>
                </label>
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
        {/* ═══ DELETE CONFIRMATION MODAL ═══ */}
        {confirmDeleteConsulta && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                  <Trash2 className="w-5 h-5 text-red-500" />
                </div>
                <h2 className="text-lg font-bold text-slate-900">Eliminar consulta</h2>
              </div>
              <p className="text-sm text-slate-600">
                ¿Estás seguro de eliminar la consulta de <span className="font-bold">{confirmDeleteConsulta.patient_name}</span> ({confirmDeleteConsulta.consultation_code})?
              </p>
              <p className="text-xs text-slate-400">
                Se eliminará la consulta, cita vinculada en agenda, historial clínico, recetas, registros financieros y el evento de Google Calendar asociado.
              </p>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setConfirmDeleteConsulta(null)} className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50">
                  Cancelar
                </button>
                <button
                  onClick={() => deleteConsultationCascade(confirmDeleteConsulta)}
                  disabled={deletingConsulta}
                  className="flex-1 py-2.5 bg-red-500 text-white rounded-lg text-sm font-bold hover:bg-red-600 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {deletingConsulta ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  {deletingConsulta ? 'Eliminando...' : 'Eliminar'}
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
