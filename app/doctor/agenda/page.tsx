'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Calendar, Clock, Plus, ChevronLeft, ChevronRight, Link2, Check, Trash2, AlertCircle, CheckCircle, ClipboardList, Search, X, Settings, Stethoscope, Upload, Loader2, Package, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import NewAppointmentFlow from '@/components/appointment-flow/NewAppointmentFlow'

const toast = { success: (msg: string) => alert(msg), error: (msg: string) => alert(msg) }

// ── Types ────────────────────────────────────────────────────────────────────

type ScheduleConfig = {
  slot_duration: number    // minutos por cita
  buffer_minutes: number   // minutos entre citas
  advance_booking_days: number
  auto_approve: boolean
}

type AvailabilitySlot = {
  id?: string
  day_of_week: number     // 0=Lun, 6=Dom
  start_time: string      // HH:MM
  end_time: string        // HH:MM
  is_enabled: boolean
}

type CalendarAppointment = {
  id: string              // cuando source='consultation' este es consultations.id, NO appointments.id
  appointment_id?: string | null  // el ID real de la fila en appointments (para RPCs)
  patient_name: string
  date: string            // YYYY-MM-DD
  isoDate: string         // full ISO
  time: string            // HH:MM
  endTime: string         // HH:MM (calculado)
  chief_complaint?: string
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'
  source: 'consultation' | 'appointment'
  consultation_code?: string
  appointment_code?: string
  plan_name?: string
  plan_price?: number
  patient_phone?: string | null
  patient_email?: string | null
  patient_cedula?: string | null
  meet_link?: string | null
}

type PendingAppointment = {
  id: string
  patient_name: string
  patient_phone: string | null
  patient_email: string | null
  patient_cedula: string | null
  scheduled_at: string
  chief_complaint: string | null
  plan_name: string | null
  plan_price: number | null
  status: string
  appointment_code?: string
  payment_method?: string | null
  payment_receipt_url?: string | null
  appointment_mode?: string | null
  package_id?: string | null
  session_number?: number | null
  total_sessions?: number | null
}

// ── Constants ────────────────────────────────────────────────────────────────

const DAYS_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const DAYS_FULL = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const MONTHS_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const DURATION_OPTIONS = [15, 20, 30, 45, 60]
const BUFFER_OPTIONS = [0, 5, 10, 15, 30]

const DEFAULT_CONFIG: ScheduleConfig = {
  slot_duration: 30,
  buffer_minutes: 0,
  advance_booking_days: 30,
  auto_approve: false,
}

const DEFAULT_SLOTS: AvailabilitySlot[] = [
  { day_of_week: 0, start_time: '08:00', end_time: '12:00', is_enabled: true },
  { day_of_week: 0, start_time: '14:00', end_time: '17:00', is_enabled: true },
  { day_of_week: 1, start_time: '08:00', end_time: '12:00', is_enabled: true },
  { day_of_week: 1, start_time: '14:00', end_time: '17:00', is_enabled: true },
  { day_of_week: 2, start_time: '08:00', end_time: '12:00', is_enabled: true },
  { day_of_week: 3, start_time: '08:00', end_time: '12:00', is_enabled: true },
  { day_of_week: 3, start_time: '14:00', end_time: '17:00', is_enabled: true },
  { day_of_week: 4, start_time: '08:00', end_time: '12:00', is_enabled: true },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function getWeekDates(offset = 0): Date[] {
  const today = new Date()
  const monday = new Date(today)
  monday.setDate(today.getDate() - today.getDay() + 1 + offset * 7)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

function getMonthDates(year: number, month: number): (Date | null)[] {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startPad = (firstDay.getDay() + 6) % 7
  const cells: (Date | null)[] = []
  for (let i = 0; i < startPad; i++) cells.push(null)
  for (let d = 1; d <= lastDay.getDate(); d++) cells.push(new Date(year, month, d))
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

function toHHMM(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + mins
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/** Generate time slots for a day based on availability and config */
function generateTimeSlots(
  dayOfWeek: number,
  availSlots: AvailabilitySlot[],
  config: ScheduleConfig
): { time: string; endTime: string }[] {
  const daySlots = availSlots.filter(s => s.day_of_week === dayOfWeek && s.is_enabled)
  const result: { time: string; endTime: string }[] = []

  for (const slot of daySlots) {
    const blockStart = timeToMinutes(slot.start_time)
    const blockEnd = timeToMinutes(slot.end_time)
    const step = config.slot_duration + config.buffer_minutes
    let current = blockStart

    while (current + config.slot_duration <= blockEnd) {
      const startStr = `${String(Math.floor(current / 60)).padStart(2, '0')}:${String(current % 60).padStart(2, '0')}`
      const endStr = addMinutes(startStr, config.slot_duration)
      result.push({ time: startStr, endTime: endStr })
      current += step
    }
  }

  return result
}

/** Check if a time falls on a valid slot boundary */
function isValidSlotTime(time: string, dayOfWeek: number, availSlots: AvailabilitySlot[], config: ScheduleConfig): boolean {
  const validSlots = generateTimeSlots(dayOfWeek, availSlots, config)
  return validSlots.some(s => s.time === time)
}

function dateToYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── Component ────────────────────────────────────────────────────────────────

type CalendarView = 'week' | 'month' | 'day'
type AgendaTab = 'calendar'

export default function AgendaPage() {
  const router = useRouter()
  const today = new Date()
  const [weekOffset, setWeekOffset] = useState(0)
  const [monthYear, setMonthYear] = useState({ year: today.getFullYear(), month: today.getMonth() })
  const [selectedDate, setSelectedDate] = useState(today)
  const [calView, setCalView] = useState<CalendarView>('month')
  const [tab, setTab] = useState<AgendaTab>('calendar')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [doctorId, setDoctorId] = useState<string | null>(null)

  // Schedule config
  const [config, setConfig] = useState<ScheduleConfig>(DEFAULT_CONFIG)
  const [availSlots, setAvailSlots] = useState<AvailabilitySlot[]>(DEFAULT_SLOTS)

  // Calendar data (real from DB)
  const [allAppointments, setAllAppointments] = useState<CalendarAppointment[]>([])
  const [pendingAppointments, setPendingAppointments] = useState<PendingAppointment[]>([])

  // UI state
  const [accepting, setAccepting] = useState<string | null>(null)
  const [uploadingReceipt, setUploadingReceipt] = useState<string | null>(null)
  const [searchText, setSearchText] = useState('')
  const [rescheduling, setRescheduling] = useState<PendingAppointment | null>(null)
  const [newDateTime, setNewDateTime] = useState('')
  const [rescheduleDate, setRescheduleDate] = useState<string | null>(null)
  const [rescheduleTime, setRescheduleTime] = useState<string | null>(null)
  const [rescheduleWeekOffset, setRescheduleWeekOffset] = useState(0)
  const [detailAppt, setDetailAppt] = useState<CalendarAppointment | null>(null)
  const [showConfigPanel, setShowConfigPanel] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'>('all')

  // Google Calendar Sync
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ message: string; success: boolean } | null>(null)

  // Delete confirmation
  const [deletingAppt, setDeletingAppt] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<CalendarAppointment | null>(null)
  // Modal custom para cambiar estado de cita (reemplaza window.confirm)
  const [statusAction, setStatusAction] = useState<{ type: 'completed' | 'cancelled' | 'no_show'; appt: CalendarAppointment } | null>(null)
  const [statusReason, setStatusReason] = useState('')
  const [statusSaving, setStatusSaving] = useState(false)

  // Nueva consulta desde agenda
  const [showNewConsulta, setShowNewConsulta] = useState(false)
  const [patients, setPatients] = useState<{ id: string; full_name: string; phone: string | null }[]>([])
  const [pricingPlans, setPricingPlans] = useState<{ id: string; name: string; price_usd: number; duration_minutes: number }[]>([])
  const [newConsulta, setNewConsulta] = useState({
    patient_id: '',
    date: '',
    time: '',
    reason: '',
    plan_id: '',
    payment_method: '' as string,
    payment_reference: '',
  })
  const [creatingConsulta, setCreatingConsulta] = useState(false)
  const [doctorPaymentMethods, setDoctorPaymentMethods] = useState<string[]>([])
  const [newReceiptFile, setNewReceiptFile] = useState<File | null>(null)
  const requiresReceiptForNew = (method: string) => !['efectivo', 'efectivo_bs', 'pos', ''].includes(method)

  const weekDates = getWeekDates(weekOffset)
  const monthCells = getMonthDates(monthYear.year, monthYear.month)

  // ── Load data from DB ────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setDoctorId(user.id)

    // 1. Load schedule config + availability from API
    try {
      const schedRes = await fetch('/api/doctor/schedule')
      if (schedRes.ok) {
        const sched = await schedRes.json()
        if (sched.config) setConfig(sched.config)
        if (sched.slots && sched.slots.length > 0) {
          setAvailSlots(sched.slots.map((s: any) => ({
            id: s.id,
            day_of_week: s.day_of_week,
            start_time: s.start_time?.slice(0, 5) || s.start_time,
            end_time: s.end_time?.slice(0, 5) || s.end_time,
            is_enabled: s.is_enabled,
          })))
        }
      }
    } catch { /* use defaults */ }

    // Load patients for "nueva consulta" modal
    const { data: patientsList } = await supabase
      .from('patients')
      .select('id, full_name, phone')
      .eq('doctor_id', user.id)
      .order('full_name')
    setPatients(patientsList || [])

    // Load pricing plans for "nueva consulta" modal
    const { data: plans } = await supabase
      .from('pricing_plans')
      .select('id, name, price_usd, duration_minutes')
      .eq('doctor_id', user.id)
      .eq('is_active', true)
      .order('price_usd')
    setPricingPlans(plans || [])

    // Load doctor's active payment methods from profile
    const { data: profileData } = await supabase
      .from('profiles')
      .select('payment_methods')
      .eq('id', user.id)
      .single()
    if (profileData?.payment_methods && Array.isArray(profileData.payment_methods)) {
      setDoctorPaymentMethods(profileData.payment_methods)
    }

    // 2. Load CONFIRMED consultations (only recent + future — last 30 days + next 60 days)
    const pastCutoff = new Date()
    pastCutoff.setDate(pastCutoff.getDate() - 30)
    const futureCutoff = new Date()
    futureCutoff.setDate(futureCutoff.getDate() + 60)

    // Cargar consultas con el STATUS real del appointment vinculado (join)
    const { data: consults } = await supabase
      .from('consultations')
      .select(`
        id, consultation_code, consultation_date, chief_complaint, payment_status,
        appointment_id, amount,
        patients(full_name, phone, email),
        appointments:appointment_id(status)
      `)
      .eq('doctor_id', user.id)
      .gte('consultation_date', pastCutoff.toISOString())
      .lte('consultation_date', futureCutoff.toISOString())
      .order('consultation_date', { ascending: true })

    const slotDuration = config.slot_duration || 30
    const consultAppts: CalendarAppointment[] = (consults ?? []).map(c => {
      const d = new Date(c.consultation_date)
      const timeStr = toHHMM(d)
      // Status real: si tiene appointment vinculado, usamos su status; si no, 'confirmed' por legado.
      const apptObj = Array.isArray((c as any).appointments) ? (c as any).appointments[0] : (c as any).appointments
      const realStatus = (apptObj?.status as CalendarAppointment['status']) || 'confirmed'
      return {
        id: c.id,
        appointment_id: c.appointment_id ?? null,
        patient_name: (!Array.isArray(c.patients) && c.patients) ? (c.patients as any).full_name : 'Paciente',
        date: dateToYMD(d),
        isoDate: c.consultation_date,
        time: timeStr,
        endTime: addMinutes(timeStr, slotDuration),
        chief_complaint: c.chief_complaint ?? undefined,
        status: realStatus,
        source: 'consultation' as const,
        consultation_code: c.consultation_code,
        patient_phone: (!Array.isArray(c.patients) && c.patients) ? (c.patients as any).phone : null,
        patient_email: (!Array.isArray(c.patients) && c.patients) ? (c.patients as any).email : null,
      }
    })

    // 3. Load PENDING appointments (not yet accepted)
    const { data: pending } = await supabase
      .from('appointments')
      .select('id, scheduled_at, chief_complaint, patient_name, patient_phone, patient_email, patient_cedula, plan_name, plan_price, status, appointment_code, payment_method, payment_receipt_url, appointment_mode, package_id, session_number')
      .eq('doctor_id', user.id)
      .eq('status', 'scheduled')
      .order('scheduled_at', { ascending: true })

    // 4. Load ALL active-lifecycle appointments (confirmed, completed, cancelled, no_show)
    //    para que los filtros del calendario funcionen correctamente. Pending ya se carga en #3.
    const { data: confirmed } = await supabase
      .from('appointments')
      .select('id, scheduled_at, chief_complaint, patient_name, patient_phone, patient_email, plan_name, plan_price, status, appointment_code, meet_link')
      .eq('doctor_id', user.id)
      .in('status', ['confirmed', 'completed', 'cancelled', 'no_show'])
      .gte('scheduled_at', pastCutoff.toISOString())
      .lte('scheduled_at', futureCutoff.toISOString())
      .order('scheduled_at', { ascending: true })

    // Deduplicate: remove confirmed appointments that already have a linked consultation
    const consultAppointmentIds = new Set((consults ?? []).filter(c => c.appointment_id).map(c => c.appointment_id))
    const confirmedAppts: CalendarAppointment[] = (confirmed ?? [])
      .filter(a => {
        // Skip if this appointment already has a consultation linked
        if (consultAppointmentIds.has(a.id)) return false
        // Also skip if same patient + similar time (within 1 hour)
        return !consultAppts.some(c => {
          const timeDiff = Math.abs(new Date(c.isoDate).getTime() - new Date(a.scheduled_at).getTime())
          return c.patient_name === a.patient_name && timeDiff < 3600000
        })
      })
      .map(a => {
        const d = new Date(a.scheduled_at)
        const timeStr = toHHMM(d)
        return {
          id: a.id,
          patient_name: a.patient_name,
          date: dateToYMD(d),
          isoDate: a.scheduled_at,
          time: timeStr,
          endTime: addMinutes(timeStr, slotDuration),
          chief_complaint: a.chief_complaint ?? undefined,
          status: 'confirmed' as const,
          source: 'appointment' as const,
          appointment_code: a.appointment_code,
          plan_name: a.plan_name,
          plan_price: a.plan_price,
          patient_phone: a.patient_phone,
          patient_email: a.patient_email,
          meet_link: a.meet_link,
        }
      })

    setAllAppointments([...consultAppts, ...confirmedAppts])

    // Enrich pending appointments with package total_sessions
    const pendingList = (pending ?? []) as PendingAppointment[]
    const packageIds = [...new Set(pendingList.filter(p => p.package_id).map(p => p.package_id!))]
    if (packageIds.length > 0) {
      const { data: pkgs } = await supabase
        .from('patient_packages')
        .select('id, total_sessions')
        .in('id', packageIds)
      const pkgMap = new Map((pkgs || []).map(p => [p.id, p.total_sessions]))
      pendingList.forEach(p => {
        if (p.package_id) p.total_sessions = pkgMap.get(p.package_id) || null
      })
    }

    setPendingAppointments(pendingList)
    setLoading(false)
  }, [config.slot_duration])

  useEffect(() => { loadData() }, [loadData])

  // ── Save availability to DB ──────────────────────────────────────────────

  async function saveSchedule() {
    setSaving(true)
    try {
      const res = await fetch('/api/doctor/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config,
          slots: availSlots.map(s => ({
            day_of_week: s.day_of_week,
            start_time: s.start_time,
            end_time: s.end_time,
            is_enabled: s.is_enabled,
          })),
        }),
      })
      if (!res.ok) throw new Error('Error guardando')
      toast.success('Disponibilidad guardada')
    } catch (e) {
      console.error(e)
      toast.error('Error al guardar')
    }
    setSaving(false)
  }

  // ── Accept / Reject appointments ────────────────────────────────────────

  async function acceptAppointment(appt: PendingAppointment) {
    if (!doctorId) return
    setAccepting(appt.id)
    const supabase = createClient()

    try {
      // Validate slot time
      const apptDate = new Date(appt.scheduled_at)
      const dayOfWeek = (apptDate.getDay() + 6) % 7 // 0=Monday
      const timeStr = toHHMM(apptDate)

      if (!isValidSlotTime(timeStr, dayOfWeek, availSlots, config)) {
        const validSlots = generateTimeSlots(dayOfWeek, availSlots, config)
        if (validSlots.length > 0) {
          toast.error(`Horario ${timeStr} no es válido. Horarios disponibles: ${validSlots.slice(0, 5).map(s => s.time).join(', ')}...`)
        } else {
          toast.error(`No hay horarios disponibles para ${DAYS_FULL[dayOfWeek]}`)
        }
        setAccepting(null)
        return
      }

      // Check for conflicts
      const conflict = allAppointments.find(a => {
        if (a.date !== dateToYMD(apptDate)) return false
        const aStart = timeToMinutes(a.time)
        const aEnd = timeToMinutes(a.endTime)
        const newStart = timeToMinutes(timeStr)
        const newEnd = newStart + config.slot_duration
        return (newStart < aEnd && newEnd > aStart)
      })

      if (conflict) {
        toast.error(`Conflicto: ya hay una cita a las ${conflict.time} con ${conflict.patient_name}`)
        setAccepting(null)
        return
      }

      // Find or create patient
      let patientId: string | null = null
      if (appt.patient_email) {
        const { data: existing } = await supabase
          .from('patients').select('id')
          .eq('doctor_id', doctorId).eq('email', appt.patient_email).maybeSingle()
        if (existing) patientId = existing.id
      }
      if (!patientId && appt.patient_cedula) {
        const { data: existing } = await supabase
          .from('patients').select('id')
          .eq('doctor_id', doctorId).eq('cedula', appt.patient_cedula).maybeSingle()
        if (existing) patientId = existing.id
      }
      if (!patientId) {
        const { data: patient } = await supabase
          .from('patients')
          .insert({ doctor_id: doctorId, full_name: appt.patient_name, phone: appt.patient_phone, email: appt.patient_email, cedula: appt.patient_cedula, source: 'booking' })
          .select().single()
        if (!patient) throw new Error('Error creando paciente')
        patientId = patient.id
      }

      // Create consultation via API
      const res = await fetch('/api/doctor/consultations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: patientId,
          appointment_id: appt.id,
          chief_complaint: appt.chief_complaint || 'Consulta agendada online',
          consultation_date: appt.scheduled_at,
          amount: appt.plan_price || 0,
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Error creando consulta')

      // Update local state
      setPendingAppointments(prev => prev.filter(a => a.id !== appt.id))
      const newAppt: CalendarAppointment = {
        id: result.consultation?.id || appt.id,
        patient_name: appt.patient_name,
        date: dateToYMD(apptDate),
        isoDate: appt.scheduled_at,
        time: timeStr,
        endTime: addMinutes(timeStr, config.slot_duration),
        chief_complaint: appt.chief_complaint ?? undefined,
        status: 'confirmed',
        source: 'consultation',
        consultation_code: result.code,
        appointment_code: appt.appointment_code,
        plan_name: appt.plan_name ?? undefined,
        plan_price: appt.plan_price ?? undefined,
        patient_phone: appt.patient_phone,
        patient_email: appt.patient_email,
      }
      setAllAppointments(prev => [...prev, newAppt])
      toast.success(`Consulta ${result.code} confirmada`)
    } catch (e: any) {
      console.error(e)
      toast.error(e.message || 'Error al aprobar')
    }
    setAccepting(null)
  }

  async function rejectAppointment(apptId: string) {
    const supabase = createClient()
    await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', apptId)
    setPendingAppointments(prev => prev.filter(a => a.id !== apptId))
  }

  async function handleUploadReceipt(apptId: string, file: File) {
    setUploadingReceipt(apptId)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const ext = file.name.split('.').pop() || 'jpg'
      const filePath = `receipts/${user.id}/${apptId}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('payment-receipts')
        .upload(filePath, file, { upsert: true })

      if (uploadError) {
        // If bucket doesn't exist, try public bucket
        const { error: uploadError2 } = await supabase.storage
          .from('public')
          .upload(filePath, file, { upsert: true })
        if (uploadError2) throw uploadError2
        const { data: urlData } = supabase.storage.from('public').getPublicUrl(filePath)
        await supabase.from('appointments').update({ payment_receipt_url: urlData.publicUrl }).eq('id', apptId)
        setPendingAppointments(prev => prev.map(a => a.id === apptId ? { ...a, payment_receipt_url: urlData.publicUrl } : a))
      } else {
        const { data: urlData } = supabase.storage.from('payment-receipts').getPublicUrl(filePath)
        await supabase.from('appointments').update({ payment_receipt_url: urlData.publicUrl }).eq('id', apptId)
        setPendingAppointments(prev => prev.map(a => a.id === apptId ? { ...a, payment_receipt_url: urlData.publicUrl } : a))
      }

      toast.success('Comprobante subido correctamente')
    } catch (err) {
      console.error('Upload error:', err)
      toast.error('Error al subir comprobante')
    }
    setUploadingReceipt(null)
  }

  async function confirmReschedule() {
    if (!rescheduling || !rescheduleDate || !rescheduleTime) return
    try {
      const rescheduledDate = new Date(rescheduleDate + 'T' + rescheduleTime + ':00').toISOString()

      // Call API which updates appointment + consultation + Google Calendar
      const res = await fetch('/api/doctor/reschedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId: rescheduling.id, newDate: rescheduledDate }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Error al reagendar')
      }

      setPendingAppointments(prev => prev.map(a =>
        a.id === rescheduling.id ? { ...a, scheduled_at: rescheduledDate } : a
      ))
      toast.success('Cita reagendada (calendario actualizado)')
      setRescheduling(null)
      setRescheduleDate(null)
      setRescheduleTime(null)
      setRescheduleWeekOffset(0)
    } catch (e: any) {
      console.error(e)
      toast.error(e?.message || 'Error al reagendar')
    }
  }

  // ── Google Calendar Sync ─────────────────────────────────────────────────

  async function handleCalendarSync() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch('/api/doctor/calendar-sync', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setSyncResult({ message: data.error || 'Error en sync', success: false })
        toast.error(data.error || 'Error al sincronizar')
      } else {
        setSyncResult({ message: data.message, success: true })
        toast.success(data.message || 'Sincronización completada')
        // Reload appointments to reflect changes
        loadData()
      }
    } catch (err: any) {
      setSyncResult({ message: err?.message || 'Error de conexión', success: false })
      toast.error('Error al sincronizar con Google Calendar')
    }
    setSyncing(false)
    // Auto-hide result after 6 seconds
    setTimeout(() => setSyncResult(null), 6000)
  }

  // ── Delete appointment (cascade) ─────────────────────────────────────────

  async function deleteAppointmentCascade(appt: CalendarAppointment) {
    setDeletingAppt(appt.id)
    try {
      if (appt.source === 'consultation') {
        // Delete via consultation endpoint (cascades to appointment, EHR, prescriptions, GCal)
        const res = await fetch(`/api/doctor/consultations?id=${appt.id}`, { method: 'DELETE' })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Error al eliminar')
      } else {
        // Delete via appointment endpoint (cascades to consultations, EHR, prescriptions, GCal)
        const res = await fetch(`/api/doctor/appointments?id=${appt.id}`, { method: 'DELETE' })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Error al eliminar')
      }

      // Remove from local state
      setAllAppointments(prev => prev.filter(a => a.id !== appt.id))
      setPendingAppointments(prev => prev.filter(a => a.id !== appt.id))
      setDetailAppt(null)
      setConfirmDelete(null)
      toast.success('Cita eliminada correctamente')
    } catch (err: any) {
      console.error('Delete error:', err)
      toast.error(err?.message || 'Error al eliminar la cita')
    }
    setDeletingAppt(null)
  }

  // ── Get appointments for a specific date ─────────────────────────────────

  function getApptsByDate(d: Date): CalendarAppointment[] {
    const ymd = dateToYMD(d)
    const pendingAsAppts: CalendarAppointment[] = pendingAppointments.map(p => {
      const pd = new Date(p.scheduled_at)
      const timeStr = toHHMM(pd)
      return {
        id: p.id,
        patient_name: p.patient_name,
        date: dateToYMD(pd),
        isoDate: p.scheduled_at,
        time: timeStr,
        endTime: addMinutes(timeStr, config.slot_duration),
        chief_complaint: p.chief_complaint ?? undefined,
        status: 'scheduled' as const,
        source: 'appointment' as const,
        appointment_code: p.appointment_code,
        plan_name: p.plan_name ?? undefined,
        plan_price: p.plan_price ?? undefined,
        patient_phone: p.patient_phone,
        patient_email: p.patient_email,
      }
    })
    return [...allAppointments, ...pendingAsAppts]
      .filter(a => a.date === ymd)
      .filter(a => statusFilter === 'all' || a.status === statusFilter)
      .sort((a, b) => a.time.localeCompare(b.time))
  }

  // Week appointments
  const weekAppts = allAppointments
    .filter(a => {
      const d = new Date(a.isoDate)
      return d >= weekDates[0] && d <= weekDates[6]
    })
    .filter(a => statusFilter === 'all' || a.status === statusFilter)

  // ── Availability helpers ─────────────────────────────────────────────────

  function toggleSlot(idx: number) {
    setAvailSlots(prev => prev.map((s, i) => i === idx ? { ...s, is_enabled: !s.is_enabled } : s))
  }
  function removeSlot(idx: number) {
    setAvailSlots(prev => prev.filter((_, i) => i !== idx))
  }
  function addSlot(day: number) {
    setAvailSlots(prev => [...prev, { day_of_week: day, start_time: '09:00', end_time: '12:00', is_enabled: true }])
  }
  function updateSlotTime(idx: number, field: 'start_time' | 'end_time', value: string) {
    setAvailSlots(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s))
  }

  async function createConsultaFromAgenda() {
    if (!newConsulta.patient_id || !newConsulta.date || !newConsulta.time) {
      toast.error('Completa paciente, fecha y hora')
      return
    }
    if (!newConsulta.plan_id) {
      toast.error('Selecciona un plan de consulta')
      return
    }
    setCreatingConsulta(true)
    try {
      const selectedPlan = pricingPlans.find(p => p.id === newConsulta.plan_id)
      const consultationDate = new Date(`${newConsulta.date}T${newConsulta.time}:00`).toISOString()

      // Upload receipt if provided
      let receiptUrl: string | null = null
      if (newReceiptFile) {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const ext = newReceiptFile.name.split('.').pop()
          const path = `${user.id}/${newConsulta.patient_id}/${Date.now()}.${ext}`
          const { error: uploadErr } = await supabase.storage.from('payment-receipts').upload(path, newReceiptFile, { upsert: false })
          if (!uploadErr) {
            const { data: publicUrl } = supabase.storage.from('payment-receipts').getPublicUrl(path)
            receiptUrl = publicUrl.publicUrl
          }
        }
      }

      const res = await fetch('/api/doctor/consultations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: newConsulta.patient_id,
          chief_complaint: newConsulta.reason || null,
          consultation_date: consultationDate,
          amount: selectedPlan?.price_usd || 0,
          plan_name: selectedPlan?.name || null,
          payment_method: newConsulta.payment_method || null,
          payment_reference: newConsulta.payment_reference || null,
          payment_receipt_url: receiptUrl,
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Error al crear')
      toast.success('Consulta creada y agregada a la agenda')
      setShowNewConsulta(false)
      setNewReceiptFile(null)
      setNewConsulta({ patient_id: '', date: '', time: '', reason: '', plan_id: '', payment_method: '', payment_reference: '' })
      await loadData()
    } catch (err: any) {
      console.error(err)
      toast.error(err.message || 'Error al crear consulta')
    } finally {
      setCreatingConsulta(false)
    }
  }

  // BUG-8: usar NewAppointmentFlow (acordeón estilo booking público) en lugar del modal inline
  const [showNewFlow, setShowNewFlow] = useState(false)
  const [newFlowSlotStart, setNewFlowSlotStart] = useState<string | undefined>(undefined)

  function openNewConsultaForDate(date: Date, time?: string) {
    const t = time || '09:00'
    const isoLocal = `${dateToYMD(date)}T${t}:00`
    setNewFlowSlotStart(isoLocal)
    setShowNewFlow(true)
  }

  const prevMonth = () => setMonthYear(({ year, month }) => month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 })
  const nextMonth = () => setMonthYear(({ year, month }) => month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 })

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');* { font-family: 'Inter', sans-serif; }.g-bg{background:linear-gradient(135deg,#00C4CC 0%,#0891b2 100%)}.day-hover:hover { background: rgba(0,196,204,0.06); transition: background 0.2s; }`}</style>

      <div className="max-w-5xl space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex-1">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Agenda</h1>
            <p className="text-sm text-slate-500 mt-1">
              Citas cada {config.slot_duration} min
              {config.buffer_minutes > 0 && ` · ${config.buffer_minutes} min entre citas`}
              {' · '}{allAppointments.length} consultas
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleCalendarSync}
              disabled={syncing}
              title="Sincronizar con Google Calendar"
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-all border ${
                syncing
                  ? 'bg-blue-50 border-blue-200 text-blue-500 cursor-wait'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50'
              }`}
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{syncing ? 'Sincronizando...' : 'Sync Calendar'}</span>
            </button>
            <button
              onClick={() => openNewConsultaForDate(selectedDate)}
              className="flex items-center gap-2 px-4 py-2 g-bg text-white rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Nueva consulta
            </button>
          </div>
        </div>

        {/* Sync result banner */}
        {syncResult && (
          <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium ${
            syncResult.success
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}>
            {syncResult.success ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span className="flex-1">{syncResult.message}</span>
            <button onClick={() => setSyncResult(null)} className="opacity-50 hover:opacity-100">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* ═══ CALENDAR TAB ═══ */}
        {tab === 'calendar' && (
          <div className="space-y-4">
            {/* View toggle + nav */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3">
              <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5 shrink-0">
                {(['week', 'month', 'day'] as CalendarView[]).map(v => (
                  <button key={v} onClick={() => { setCalView(v); if (v !== 'day') setSelectedDate(today) }}
                    className={`px-2 sm:px-3 py-1 rounded-md text-xs font-semibold transition-all ${calView === v ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-500'}`}>
                    {v === 'week' ? 'Semana' : v === 'month' ? 'Mes' : 'Día'}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between sm:justify-start gap-2 sm:gap-3">
                <button onClick={() => {
                  if (calView === 'week') setWeekOffset(v => v - 1)
                  else if (calView === 'month') prevMonth()
                  else setSelectedDate(d => new Date(d.getTime() - 86400000))
                }} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center"><ChevronLeft className="w-4 h-4 text-slate-500" /></button>
                <p className="text-xs sm:text-sm font-semibold text-slate-700 min-w-[180px] sm:min-w-[220px] text-center">
                  {calView === 'week' ? `${weekDates[0].toLocaleDateString('es-VE', { day: '2-digit', month: 'long' })} – ${weekDates[6].toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' })}`
                    : calView === 'month' ? `${MONTHS_ES[monthYear.month]} ${monthYear.year}`
                    : selectedDate.toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
                <button onClick={() => {
                  if (calView === 'week') setWeekOffset(v => v + 1)
                  else if (calView === 'month') nextMonth()
                  else setSelectedDate(d => new Date(d.getTime() + 86400000))
                }} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center"><ChevronRight className="w-4 h-4 text-slate-500" /></button>
              </div>

              <button onClick={() => { setWeekOffset(0); setMonthYear({ year: today.getFullYear(), month: today.getMonth() }); setSelectedDate(today) }}
                className="text-xs font-semibold text-teal-600 hover:text-teal-700 px-3 py-1 rounded-lg hover:bg-teal-50 transition-colors shrink-0">Hoy</button>
            </div>

            {/* Filtros: Cita (Agendada/Aprobada/Rechazada) + Consulta (Asistió/No asistió) */}
            <div className="flex flex-wrap gap-1.5">
              {([
                { key: 'all',       label: 'Todas',       active: 'bg-slate-800   text-white border-slate-800' },
                { key: 'scheduled', label: 'Agendadas',   active: 'bg-amber-500   text-white border-amber-500' },
                { key: 'confirmed', label: 'Aprobadas',   active: 'bg-teal-500    text-white border-teal-500' },
                { key: 'cancelled', label: 'Rechazadas',  active: 'bg-red-500     text-white border-red-500' },
                { key: 'completed', label: 'Asistió',     active: 'bg-emerald-500 text-white border-emerald-500' },
                { key: 'no_show',   label: 'No asistió',  active: 'bg-orange-500  text-white border-orange-500' },
              ] as const).map(f => (
                <button
                  key={f.key}
                  onClick={() => setStatusFilter(f.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                    statusFilter === f.key ? f.active : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* WEEK VIEW */}
            {calView === 'week' && (
              <>
                <div className="grid grid-cols-7 gap-1 sm:gap-2 pb-2">
                  {weekDates.map((date, idx) => {
                    const isToday = date.toDateString() === today.toDateString()
                    const dayAppts = getApptsByDate(date)
                    return (
                      <button key={idx} onClick={() => { setCalView('day'); setSelectedDate(date) }}
                        className={`rounded-lg sm:rounded-xl border p-2 sm:p-3 min-h-[100px] sm:min-h-[120px] cursor-pointer text-left day-hover ${isToday ? 'border-teal-400 bg-teal-50' : 'border-slate-200 bg-white'}`}>
                        <div className="mb-2">
                          <p className={`text-xs font-semibold ${isToday ? 'text-teal-600' : 'text-slate-400'}`}>{DAYS_SHORT[idx]}</p>
                          <p className={`text-lg font-bold ${isToday ? 'text-teal-700' : 'text-slate-800'}`}>{date.getDate()}</p>
                        </div>
                        {dayAppts.slice(0, 3).map(a => (
                          <div key={a.id} onClick={(e) => { e.stopPropagation(); setDetailAppt(a) }}
                            className={`mb-1 rounded px-1.5 py-0.5 cursor-pointer text-left ${a.status === 'scheduled' ? 'bg-amber-400 hover:bg-amber-500' : 'bg-teal-500 hover:bg-teal-600'}`}>
                            <p className="text-white text-[9px] font-bold">{a.time}</p>
                            <p className="text-white/90 text-[9px] truncate">{a.patient_name}</p>
                          </div>
                        ))}
                        {dayAppts.length > 3 && <p className="text-[9px] text-slate-400 font-semibold">+{dayAppts.length - 3} más</p>}
                        {dayAppts.length === 0 && <p className="text-xs text-slate-300 mt-1">Sin citas</p>}
                      </button>
                    )
                  })}
                </div>

                {!loading && weekAppts.length > 0 && (
                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <div className="px-5 py-3 border-b border-slate-100">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Citas de la semana ({weekAppts.length})</p>
                    </div>
                    {weekAppts.sort((a, b) => a.isoDate.localeCompare(b.isoDate)).map((a, i) => (
                      <div key={a.id} className={`flex items-center gap-4 px-5 py-3.5 ${i < weekAppts.length - 1 ? 'border-b border-slate-100' : ''} hover:bg-slate-50 cursor-pointer`}
                        onClick={() => setDetailAppt(a)}>
                        <div className="w-9 h-9 rounded-xl g-bg flex items-center justify-center shrink-0"><Clock className="w-4 h-4 text-white" /></div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800">{a.patient_name}</p>
                          <p className="text-xs text-slate-400 truncate">
                            {new Date(a.isoDate).toLocaleDateString('es-VE', { weekday: 'short', day: 'numeric', month: 'short' })} · {a.time}–{a.endTime}
                            {a.consultation_code && ` · ${a.consultation_code}`}
                            {a.chief_complaint && ` · ${a.chief_complaint}`}
                          </p>
                        </div>
                        <span className="text-xs font-semibold text-teal-600 bg-teal-50 px-2.5 py-1 rounded-full shrink-0">
                          {a.time}–{a.endTime}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* MONTH VIEW */}
            {calView === 'month' && (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="grid grid-cols-7 border-b border-slate-100">
                  {DAYS_SHORT.map(d => (
                    <div key={d} className="px-2 py-2.5 text-center text-xs font-bold text-slate-400 uppercase tracking-widest">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {monthCells.map((date, idx) => {
                    if (!date) return <div key={`e-${idx}`} className="min-h-[90px] border-b border-r border-slate-100 bg-slate-50/50" />
                    const isToday = date.toDateString() === today.toDateString()
                    const dayAppts = getApptsByDate(date)
                    return (
                      <button key={idx} onClick={() => { setCalView('day'); setSelectedDate(date) }}
                        className={`min-h-[90px] border-b border-r border-slate-100 p-2 cursor-pointer day-hover text-left ${isToday ? 'bg-teal-50' : ''} ${date.getMonth() !== monthYear.month ? 'opacity-40' : ''}`}>
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold mb-1 ${isToday ? 'g-bg text-white' : 'text-slate-700'}`}>{date.getDate()}</div>
                        {dayAppts.slice(0, 2).map(a => (
                          <div key={a.id} onClick={e => { e.stopPropagation(); setDetailAppt(a) }}
                            className={`mb-0.5 rounded px-1.5 py-0.5 w-full text-left ${a.status === 'scheduled' ? 'bg-amber-400' : 'bg-teal-500'}`}>
                            <p className="text-white text-[9px] font-bold truncate">{a.time} {a.patient_name}</p>
                          </div>
                        ))}
                        {dayAppts.length > 2 && <p className="text-[9px] text-slate-400 font-semibold">+{dayAppts.length - 2} más</p>}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* DAY VIEW — Shows real time slots based on availability config */}
            {calView === 'day' && (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                  <p className="text-sm font-bold text-slate-700 uppercase tracking-widest">Horario del día</p>
                  <p className="text-xs text-slate-400">Citas de {config.slot_duration} min{config.buffer_minutes > 0 && ` + ${config.buffer_minutes} min descanso`}</p>
                </div>
                <div className="divide-y divide-slate-100">
                  {(() => {
                    const dayOfWeek = (selectedDate.getDay() + 6) % 7
                    const timeSlots = generateTimeSlots(dayOfWeek, availSlots, config)
                    const dayAppts = getApptsByDate(selectedDate)

                    if (timeSlots.length === 0) {
                      return (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                          <Calendar className="w-10 h-10 text-slate-200 mb-3" />
                          <p className="text-slate-400 text-sm">No hay horarios configurados para {DAYS_FULL[dayOfWeek]}</p>
                          <a href="/doctor/offices" className="mt-3 text-xs text-teal-600 font-semibold hover:text-teal-700 inline-block">
                            Configurar en Consultorios
                          </a>
                        </div>
                      )
                    }

                    return timeSlots.map(slot => {
                      const slotAppt = dayAppts.find(a => a.time === slot.time)
                      const isPast = new Date(`${dateToYMD(selectedDate)}T${slot.time}`) < new Date()

                      return (
                        <div key={slot.time} className={`p-4 ${isPast ? 'opacity-50' : ''} hover:bg-slate-50 transition-colors`}>
                          <div className="flex items-center gap-4">
                            <div className="w-20 text-center shrink-0">
                              <p className="text-sm font-bold text-slate-700">{slot.time}</p>
                              <p className="text-[10px] text-slate-400">{slot.endTime}</p>
                            </div>
                            <div className="flex-1">
                              {slotAppt ? (
                                <button onClick={() => setDetailAppt(slotAppt)}
                                  className={`w-full text-left rounded-lg p-3 border transition-colors ${
                                    slotAppt.status === 'scheduled' ? 'bg-amber-50 border-amber-200 hover:bg-amber-100' : 'bg-teal-50 border-teal-200 hover:bg-teal-100'
                                  }`}>
                                  <div className="flex items-center justify-between">
                                    <p className={`text-sm font-semibold ${slotAppt.status === 'scheduled' ? 'text-amber-700' : 'text-teal-700'}`}>{slotAppt.patient_name}</p>
                                    {slotAppt.consultation_code && <span className="text-[10px] font-mono text-slate-400">{slotAppt.consultation_code}</span>}
                                  </div>
                                  <p className={`text-xs mt-0.5 ${slotAppt.status === 'scheduled' ? 'text-amber-600' : 'text-teal-600'}`}>
                                    {slotAppt.chief_complaint || (slotAppt.status === 'scheduled' ? 'Agendada' : 'Confirmada')}
                                  </p>
                                </button>
                              ) : (
                                <button
                                  onClick={() => openNewConsultaForDate(selectedDate, slot.time)}
                                  className="w-full h-12 rounded-lg border border-dashed border-slate-200 flex items-center justify-center hover:border-teal-300 hover:bg-teal-50/50 transition-all group cursor-pointer"
                                >
                                  <span className="text-xs text-slate-300 group-hover:hidden">Disponible</span>
                                  <span className="text-xs text-teal-500 font-medium hidden group-hover:flex items-center gap-1">
                                    <Plus className="w-3 h-3" /> Agendar consulta
                                  </span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })
                  })()}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Approval panel and availability tab removed — see Cobros and Consultorios */}

        {/* ═══ APPOINTMENT DETAIL MODAL ═══ */}
        {detailAppt && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-900">Detalles de cita</h2>
                <button onClick={() => setDetailAppt(null)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase">Paciente</p>
                  <p className="text-lg font-bold text-slate-900 mt-1">{detailAppt.patient_name}</p>
                  {detailAppt.patient_phone && <p className="text-xs text-slate-500 mt-0.5">{detailAppt.patient_phone}</p>}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase">Fecha</p>
                    <p className="text-sm font-semibold text-slate-700 mt-1">{new Date(detailAppt.isoDate).toLocaleDateString('es-VE')}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase">Horario</p>
                    <p className="text-sm font-semibold text-slate-700 mt-1">{detailAppt.time} – {detailAppt.endTime}</p>
                  </div>
                </div>

                {(detailAppt.consultation_code || detailAppt.appointment_code) && (
                  <div className="grid grid-cols-2 gap-3">
                    {detailAppt.consultation_code && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase">Código consulta</p>
                        <p className="text-sm font-mono text-teal-600 mt-1">{detailAppt.consultation_code}</p>
                      </div>
                    )}
                    {detailAppt.appointment_code && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase">Código cita</p>
                        <p className="text-sm font-mono text-slate-600 mt-1">{detailAppt.appointment_code}</p>
                      </div>
                    )}
                  </div>
                )}

                {detailAppt.chief_complaint && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase">Motivo</p>
                    <p className="text-sm text-slate-700 mt-1">{detailAppt.chief_complaint}</p>
                  </div>
                )}

                {detailAppt.plan_name && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500">{detailAppt.plan_name}</span>
                    {detailAppt.plan_price != null && <span className="text-sm font-bold text-emerald-600">${detailAppt.plan_price}</span>}
                  </div>
                )}

                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase">Estado</p>
                  <span className={`inline-block mt-1 text-xs font-semibold px-2.5 py-1 rounded-full ${
                    detailAppt.status === 'scheduled' ? 'bg-amber-50 text-amber-600'
                    : detailAppt.status === 'confirmed' ? 'bg-teal-50 text-teal-600'
                    : detailAppt.status === 'completed' ? 'bg-emerald-50 text-emerald-600'
                    : 'bg-red-50 text-red-600'
                  }`}>
                    {detailAppt.status === 'scheduled' ? 'Pendiente' : detailAppt.status === 'confirmed' ? 'Confirmada' : detailAppt.status === 'completed' ? 'Completada' : 'Cancelada'}
                  </span>
                </div>

                {/* Google Meet link */}
                {detailAppt.meet_link && (
                  <div className="bg-gradient-to-r from-teal-50 to-cyan-50 border border-teal-200 rounded-xl p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <svg className="w-5 h-5 text-teal-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                        <div>
                          <p className="text-sm font-semibold text-teal-700">Google Meet</p>
                          <p className="text-xs text-teal-500">Videollamada activa</p>
                        </div>
                      </div>
                      <a
                        href={detailAppt.meet_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-teal-500 hover:bg-teal-600 text-white font-semibold text-xs px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Abrir Meet
                      </a>
                    </div>
                  </div>
                )}
              </div>

              {/* ═══ ACCIONES DE ESTADO DE LA CITA ═══ */}
              {detailAppt.status !== 'completed' && detailAppt.status !== 'cancelled' && (
                <div className="pt-3 border-t border-slate-100 space-y-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Acciones de estado</p>
                  <div className="flex flex-wrap gap-2">
                    {detailAppt.status === 'scheduled' && (
                      <button
                        onClick={async () => {
                          const apptId = detailAppt.appointment_id || detailAppt.id
                          const r = await fetch('/api/doctor/appointment-status', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ appointment_id: apptId, new_status: 'confirmed' }),
                          })
                          const j = await r.json()
                          if (!r.ok) { alert(j.error || 'Error'); return }
                          setDetailAppt({ ...detailAppt, status: 'confirmed' })
                          window.location.reload()
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-700 text-xs font-bold rounded-lg border border-teal-200"
                      >
                        <CheckCircle className="w-3.5 h-3.5" /> Confirmar
                      </button>
                    )}
                    {/* Guard: si viene de consultations SIN appointment_id → no se puede cambiar status */}
                    {detailAppt.source === 'consultation' && !detailAppt.appointment_id ? (
                      <div className="w-full px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                        ⚠️ Esta consulta no tiene cita vinculada. Para cambiar el estado, crea la cita desde "Ir a consulta".
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => setStatusAction({ type: 'completed', appt: detailAppt })}
                          className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-lg"
                        >
                          <CheckCircle className="w-3.5 h-3.5" /> Marcar como atendida
                        </button>
                        <button
                          onClick={() => setStatusAction({ type: 'cancelled', appt: detailAppt })}
                          className="flex items-center gap-1 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold rounded-lg border border-red-200"
                        >
                          Cancelar cita
                        </button>
                        <button
                          onClick={() => setStatusAction({ type: 'no_show', appt: detailAppt })}
                          className="flex items-center gap-1 px-3 py-1.5 bg-orange-50 hover:bg-orange-100 text-orange-700 text-xs font-bold rounded-lg border border-orange-200"
                        >
                          No asistió
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-4">
                <button onClick={() => {
                  router.push(`/doctor/consultations?open=${detailAppt.id}`)
                  setDetailAppt(null)
                }} className="flex-1 py-2 g-bg rounded-lg text-sm font-bold text-white hover:opacity-90 flex items-center justify-center gap-2">
                  <Stethoscope className="w-4 h-4" />
                  Ir a consulta
                </button>
                <button onClick={() => setConfirmDelete(detailAppt)} className="py-2 px-3 border border-red-200 rounded-lg text-sm font-semibold text-red-500 hover:bg-red-50 flex items-center justify-center gap-1">
                  <Trash2 className="w-4 h-4" />
                </button>
                <button onClick={() => setDetailAppt(null)} className="flex-1 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50">Cerrar</button>
              </div>
              {/* Cita 360° — auditoría completa de la cita en 4 pasos */}
              <a
                href={`/doctor/cita-360/${detailAppt.appointment_id || detailAppt.id}`}
                className="mt-3 flex items-center justify-center gap-2 py-2 border border-cyan-200 bg-cyan-50 hover:bg-cyan-100 rounded-lg text-sm font-semibold text-cyan-700"
              >
                🔍 Ver Cita 360° (auditoría completa)
              </a>
            </div>
          </div>
        )}

        {/* ═══ STATUS ACTION MODAL (marcar atendida / cancelar / no asistió) ═══ */}
        {statusAction && (() => {
          const cfg = {
            completed: {
              title: 'Marcar como atendida',
              desc: 'La cita se contará como ingreso y quedará cerrada.',
              accent: 'emerald',
              btnLabel: 'Confirmar',
              showReason: false,
            },
            cancelled: {
              title: 'Cancelar cita',
              desc: 'Si la cita usaba un paquete prepagado, la sesión se restituirá automáticamente.',
              accent: 'red',
              btnLabel: 'Cancelar cita',
              showReason: true,
            },
            no_show: {
              title: 'Paciente no asistió',
              desc: 'Se registrará como "no asistió". Si era un paquete, NO se restituye la sesión.',
              accent: 'orange',
              btnLabel: 'Registrar no-asistencia',
              showReason: false,
            },
          }[statusAction.type]

          return (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4" onClick={() => !statusSaving && setStatusAction(null)}>
              <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    cfg.accent === 'emerald' ? 'bg-emerald-100 text-emerald-600'
                    : cfg.accent === 'red' ? 'bg-red-100 text-red-600'
                    : 'bg-orange-100 text-orange-600'
                  }`}>
                    <CheckCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">{cfg.title}</h2>
                    <p className="text-xs text-slate-500">{statusAction.appt.patient_name}</p>
                  </div>
                </div>
                <p className="text-sm text-slate-600">{cfg.desc}</p>

                {cfg.showReason && (
                  <div>
                    <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Razón (opcional)</label>
                    <textarea
                      value={statusReason}
                      onChange={e => setStatusReason(e.target.value)}
                      rows={2}
                      placeholder="Ej: el paciente reagendó"
                      className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none focus:border-teal-400 outline-none"
                    />
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => { setStatusAction(null); setStatusReason('') }}
                    disabled={statusSaving}
                    className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                    Cancelar
                  </button>
                  <button
                    onClick={async () => {
                      setStatusSaving(true)
                      try {
                        // Si la fila del calendario viene de consultations, resolver appointment_id real
                        const apptId = statusAction.appt.appointment_id || statusAction.appt.id
                        const r = await fetch('/api/doctor/appointment-status', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            appointment_id: apptId,
                            new_status: statusAction.type,
                            reason: statusReason || undefined,
                          }),
                        })
                        const j = await r.json()
                        if (!r.ok) throw new Error(j.error || 'Error')
                        setStatusAction(null)
                        setStatusReason('')
                        setDetailAppt(null)
                        window.location.reload()
                      } catch (e: any) {
                        alert(e.message || 'Error al actualizar')
                      } finally {
                        setStatusSaving(false)
                      }
                    }}
                    disabled={statusSaving}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-60 ${
                      cfg.accent === 'emerald' ? 'bg-emerald-500 hover:bg-emerald-600'
                      : cfg.accent === 'red' ? 'bg-red-500 hover:bg-red-600'
                      : 'bg-orange-500 hover:bg-orange-600'
                    }`}>
                    {statusSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    {cfg.btnLabel}
                  </button>
                </div>
              </div>
            </div>
          )
        })()}

        {/* ═══ DELETE CONFIRMATION MODAL ═══ */}
        {confirmDelete && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                  <Trash2 className="w-5 h-5 text-red-500" />
                </div>
                <h2 className="text-lg font-bold text-slate-900">Eliminar cita</h2>
              </div>
              <p className="text-sm text-slate-600">
                ¿Estás seguro de eliminar la cita de <span className="font-bold">{confirmDelete.patient_name}</span> del {new Date(confirmDelete.isoDate).toLocaleDateString('es-VE')} a las {confirmDelete.time}?
              </p>
              <p className="text-xs text-slate-400">
                Se eliminará la cita, consulta vinculada, historial clínico, recetas y el evento de Google Calendar asociado.
              </p>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setConfirmDelete(null)} className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50">
                  Cancelar
                </button>
                <button
                  onClick={() => deleteAppointmentCascade(confirmDelete)}
                  disabled={deletingAppt === confirmDelete.id}
                  className="flex-1 py-2.5 bg-red-500 text-white rounded-lg text-sm font-bold hover:bg-red-600 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {deletingAppt === confirmDelete.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  {deletingAppt === confirmDelete.id ? 'Eliminando...' : 'Eliminar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ RESCHEDULE MODAL ═══ */}
        {rescheduling && (() => {
          // Generate next 21 days excluding Sundays
          const rDates: string[] = []
          const rToday = new Date()
          for (let d = 1; d <= 30 && rDates.length < 21; d++) {
            const dt = new Date(rToday)
            dt.setDate(rToday.getDate() + d)
            if (dt.getDay() === 0) continue
            rDates.push(dateToYMD(dt))
          }
          const rWeekDates = rDates.slice(rescheduleWeekOffset * 5, rescheduleWeekOffset * 5 + 5)

          // Generate slots for selected date
          let rSlots: { time: string; endTime: string }[] = []
          if (rescheduleDate) {
            const rDateObj = new Date(rescheduleDate + 'T12:00:00')
            const dayOfWeek = (rDateObj.getDay() + 6) % 7
            rSlots = generateTimeSlots(dayOfWeek, availSlots, config)
          }

          // Check which slots are already booked
          const isRescheduleSlotBooked = (date: string, time: string): boolean => {
            return allAppointments.some(a => {
              if (a.id === rescheduling.id) return false // Exclude current appointment
              if (a.date !== date) return false
              const aStart = timeToMinutes(a.time)
              const aEnd = timeToMinutes(a.endTime)
              const newStart = timeToMinutes(time)
              const newEnd = newStart + config.slot_duration
              return (newStart < aEnd && newEnd > aStart)
            })
          }

          return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-900">Reagendar cita</h2>
                <button onClick={() => { setRescheduling(null); setRescheduleDate(null); setRescheduleTime(null); setRescheduleWeekOffset(0) }} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
              </div>

              <div className="bg-slate-50 rounded-lg p-4 space-y-1">
                <p className="text-sm text-slate-600"><span className="font-semibold">Paciente:</span> {rescheduling.patient_name}</p>
                <p className="text-sm text-slate-600"><span className="font-semibold">Actual:</span> {new Date(rescheduling.scheduled_at).toLocaleDateString('es-VE')} · {toHHMM(new Date(rescheduling.scheduled_at))}</p>
              </div>

              {/* Date picker - week navigation */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Selecciona la fecha</p>
                <div className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                  <button onClick={() => setRescheduleWeekOffset(Math.max(0, rescheduleWeekOffset - 1))} disabled={rescheduleWeekOffset === 0}
                    className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center disabled:opacity-30">
                    <ChevronLeft className="w-3.5 h-3.5 text-slate-500" />
                  </button>
                  <span className="text-xs font-semibold text-slate-600">
                    {rWeekDates.length > 0 && (
                      new Date(rWeekDates[0] + 'T12:00:00').toLocaleDateString('es-VE', { day: 'numeric', month: 'short' }) +
                      ' — ' +
                      new Date(rWeekDates[rWeekDates.length - 1] + 'T12:00:00').toLocaleDateString('es-VE', { day: 'numeric', month: 'short' })
                    )}
                  </span>
                  <button onClick={() => setRescheduleWeekOffset(rescheduleWeekOffset + 1)} disabled={(rescheduleWeekOffset + 1) * 5 >= rDates.length}
                    className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center disabled:opacity-30">
                    <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                  </button>
                </div>

                {/* Date cards */}
                <div className="grid grid-cols-5 gap-2">
                  {rWeekDates.map(date => {
                    const d = new Date(date + 'T12:00:00')
                    const dayName = d.toLocaleDateString('es-VE', { weekday: 'short' })
                    const dayNum = d.getDate()
                    const monthName = d.toLocaleDateString('es-VE', { month: 'short' })
                    const isSel = rescheduleDate === date
                    const dayOfWeek = (d.getDay() + 6) % 7
                    const daySlots = generateTimeSlots(dayOfWeek, availSlots, config)
                    const availCount = daySlots.filter(s => !isRescheduleSlotBooked(date, s.time)).length

                    return (
                      <button
                        key={date}
                        onClick={() => { setRescheduleDate(date); setRescheduleTime(null) }}
                        className={`rounded-xl p-2.5 text-center transition-all ${
                          isSel ? 'bg-teal-500 text-white shadow-md' :
                          availCount === 0 ? 'bg-slate-100 text-slate-300 cursor-not-allowed' :
                          'bg-white border border-slate-200 hover:border-teal-300 text-slate-700'
                        }`}
                        disabled={availCount === 0}
                      >
                        <p className={`text-[10px] font-semibold uppercase ${isSel ? 'text-white/80' : 'text-slate-400'}`}>{dayName}</p>
                        <p className={`text-lg font-bold ${isSel ? 'text-white' : ''}`}>{dayNum}</p>
                        <p className={`text-[10px] ${isSel ? 'text-white/70' : 'text-slate-400'}`}>{monthName}</p>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Time slots for selected date */}
              {rescheduleDate && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Horarios disponibles — {new Date(rescheduleDate + 'T12:00:00').toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </p>
                  {rSlots.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-4">No hay horarios configurados para este día</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {rSlots.map(slot => {
                        const booked = isRescheduleSlotBooked(rescheduleDate, slot.time)
                        const isSel = rescheduleTime === slot.time
                        return (
                          <button
                            key={slot.time}
                            onClick={() => { if (!booked) setRescheduleTime(slot.time) }}
                            disabled={booked}
                            className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                              booked ? 'bg-slate-100 text-slate-300 cursor-not-allowed line-through' :
                              isSel ? 'bg-teal-500 text-white shadow-md' :
                              'bg-white border border-slate-200 text-slate-700 hover:border-teal-400 hover:text-teal-600'
                            }`}
                          >
                            {slot.time}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Selection summary */}
              {rescheduleDate && rescheduleTime && (
                <div className="bg-emerald-50 rounded-lg p-3 text-sm text-emerald-700">
                  <span className="font-semibold">Nueva cita:</span>{' '}
                  {new Date(rescheduleDate + 'T12:00:00').toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long' })} a las {rescheduleTime}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button onClick={() => { setRescheduling(null); setRescheduleDate(null); setRescheduleTime(null); setRescheduleWeekOffset(0) }} className="flex-1 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancelar</button>
                <button onClick={confirmReschedule} disabled={!rescheduleDate || !rescheduleTime} className="flex-1 py-2 bg-teal-500 text-white rounded-lg text-sm font-semibold hover:bg-teal-600 disabled:opacity-50">Confirmar</button>
              </div>
            </div>
          </div>
          )
        })()}

        {/* ═══ NUEVA CONSULTA MODAL ═══ */}
        {showNewConsulta && (() => {
          // Generate available dates (next 30 days)
          const ncDates: string[] = []
          const ncToday = new Date()
          // Include today
          ncDates.push(dateToYMD(ncToday))
          for (let d = 1; d <= 30; d++) {
            const dt = new Date(ncToday)
            dt.setDate(ncToday.getDate() + d)
            ncDates.push(dateToYMD(dt))
          }

          // Generate time slots for the selected date
          let ncSlots: { time: string; endTime: string }[] = []
          if (newConsulta.date) {
            const ncDateObj = new Date(newConsulta.date + 'T12:00:00')
            const dayOfWeek = (ncDateObj.getDay() + 6) % 7
            ncSlots = generateTimeSlots(dayOfWeek, availSlots, config)
          }

          // Check which slots are already booked
          const isSlotBooked = (date: string, time: string): boolean => {
            return [...allAppointments, ...pendingAppointments.map(p => {
              const pd = new Date(p.scheduled_at)
              return { date: dateToYMD(pd), time: toHHMM(pd), endTime: addMinutes(toHHMM(pd), config.slot_duration) }
            })].some(a => {
              if (a.date !== date) return false
              const aStart = timeToMinutes(a.time)
              const aEnd = timeToMinutes(a.endTime)
              const newStart = timeToMinutes(time)
              const newEnd = newStart + config.slot_duration
              return (newStart < aEnd && newEnd > aStart)
            })
          }

          // Patient search
          const filteredPatients = patients.filter(p =>
            p.full_name.toLowerCase().includes(searchText.toLowerCase())
          )

          return (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl g-bg flex items-center justify-center">
                      <Stethoscope className="w-5 h-5 text-white" />
                    </div>
                    <h2 className="text-lg font-bold text-slate-900">Nueva consulta</h2>
                  </div>
                  <button onClick={() => { setShowNewConsulta(false); setSearchText('') }} className="text-slate-400 hover:text-slate-600">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Step 1: Select patient */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Paciente</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Buscar paciente..."
                      value={newConsulta.patient_id ? patients.find(p => p.id === newConsulta.patient_id)?.full_name || searchText : searchText}
                      onChange={e => {
                        setSearchText(e.target.value)
                        if (newConsulta.patient_id) setNewConsulta(prev => ({ ...prev, patient_id: '' }))
                      }}
                      className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                    />
                    {newConsulta.patient_id && (
                      <button onClick={() => { setNewConsulta(prev => ({ ...prev, patient_id: '' })); setSearchText('') }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  {!newConsulta.patient_id && searchText.length > 0 && (
                    <div className="border border-slate-200 rounded-lg max-h-36 overflow-y-auto">
                      {filteredPatients.length === 0 ? (
                        <p className="text-xs text-slate-400 p-3 text-center">No se encontró paciente</p>
                      ) : (
                        filteredPatients.slice(0, 8).map(p => (
                          <button
                            key={p.id}
                            onClick={() => { setNewConsulta(prev => ({ ...prev, patient_id: p.id })); setSearchText('') }}
                            className="w-full text-left px-3 py-2 hover:bg-teal-50 text-sm text-slate-700 border-b border-slate-100 last:border-b-0 flex items-center justify-between"
                          >
                            <span className="font-medium">{p.full_name}</span>
                            {p.phone && <span className="text-xs text-slate-400">{p.phone}</span>}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                  {newConsulta.patient_id && (
                    <div className="flex items-center gap-2 bg-teal-50 rounded-lg px-3 py-2">
                      <CheckCircle className="w-4 h-4 text-teal-500" />
                      <span className="text-sm font-semibold text-teal-700">
                        {patients.find(p => p.id === newConsulta.patient_id)?.full_name}
                      </span>
                    </div>
                  )}
                </div>

                {/* Step 2: Select date */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Fecha</label>
                  <input
                    type="date"
                    value={newConsulta.date}
                    min={dateToYMD(new Date())}
                    onChange={e => setNewConsulta(prev => ({ ...prev, date: e.target.value, time: '' }))}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                  />
                </div>

                {/* Step 3: Select time slot */}
                {newConsulta.date && (
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Horario — {new Date(newConsulta.date + 'T12:00:00').toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </label>
                    {ncSlots.length === 0 ? (
                      <div className="bg-slate-50 rounded-lg p-4 text-center">
                        <p className="text-sm text-slate-400">No hay horarios configurados para este día</p>
                        <a href="/doctor/offices" className="text-xs text-teal-600 font-semibold hover:text-teal-700 mt-1 inline-block">
                          Configurar en Consultorios
                        </a>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {ncSlots.map(slot => {
                          const booked = isSlotBooked(newConsulta.date, slot.time)
                          const isSel = newConsulta.time === slot.time
                          return (
                            <button
                              key={slot.time}
                              onClick={() => { if (!booked) setNewConsulta(prev => ({ ...prev, time: slot.time })) }}
                              disabled={booked}
                              className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                                booked ? 'bg-slate-100 text-slate-300 cursor-not-allowed line-through' :
                                isSel ? 'bg-teal-500 text-white shadow-md' :
                                'bg-white border border-slate-200 text-slate-700 hover:border-teal-400 hover:text-teal-600'
                              }`}
                            >
                              {slot.time}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Step 4: Select plan */}
                {newConsulta.time && (
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Plan de consulta <span className="text-red-400">*</span></label>
                    {pricingPlans.length === 0 ? (
                      <div className="bg-amber-50 rounded-lg p-3 text-xs text-amber-700">
                        No tienes planes configurados. <a href="/doctor/services" className="font-bold underline">Configura tus servicios</a>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-2">
                        {pricingPlans.map(plan => (
                          <button
                            key={plan.id}
                            onClick={() => setNewConsulta(prev => ({ ...prev, plan_id: plan.id }))}
                            className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all ${
                              newConsulta.plan_id === plan.id
                                ? 'border-teal-400 bg-teal-50'
                                : 'border-slate-200 hover:border-slate-300 bg-white'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-semibold text-slate-800">{plan.name}</span>
                              <span className="text-sm font-bold text-teal-600">${plan.price_usd.toFixed(2)}</span>
                            </div>
                            <span className="text-xs text-slate-400">{plan.duration_minutes} min</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Step 5: Payment method + reference */}
                {newConsulta.plan_id && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Método de pago <span className="text-red-400">*</span></label>
                      <select
                        value={newConsulta.payment_method}
                        onChange={e => setNewConsulta(prev => ({ ...prev, payment_method: e.target.value }))}
                        className="w-full mt-1.5 px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                      >
                        <option value="">-- Selecciona método de pago --</option>
                        {[
                          { value: 'efectivo', label: 'Efectivo USD' },
                          { value: 'efectivo_bs', label: 'Efectivo Bs' },
                          { value: 'pago_movil', label: 'Pago Móvil' },
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
                      <input
                        type="text"
                        value={newConsulta.payment_reference}
                        onChange={e => setNewConsulta(prev => ({ ...prev, payment_reference: e.target.value }))}
                        placeholder="Ej: #12345, último 4 dígitos..."
                        className="w-full mt-1.5 px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                      />
                    </div>

                    {/* Comprobante upload */}
                    {newConsulta.payment_method && requiresReceiptForNew(newConsulta.payment_method) && (
                      <div className="border border-dashed border-slate-300 rounded-xl p-4 space-y-2 bg-slate-50/50">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Adjuntar comprobante <span className="text-xs font-normal normal-case text-slate-400">(opcional)</span></p>
                        <label className="flex items-center justify-center border-2 border-dashed border-teal-300/50 rounded-xl p-3 cursor-pointer hover:bg-white/80 transition-colors">
                          <input type="file" accept="image/*,application/pdf" onChange={e => setNewReceiptFile(e.target.files?.[0] || null)} className="hidden" />
                          <div className="text-center">
                            <Upload className="w-4 h-4 mx-auto mb-1 text-teal-500" />
                            <p className="text-xs font-medium text-slate-600">{newReceiptFile ? newReceiptFile.name : 'JPG, PNG o PDF'}</p>
                          </div>
                        </label>
                        {newReceiptFile && <p className="text-xs text-slate-500">{(newReceiptFile.size / 1024 / 1024).toFixed(2)} MB</p>}
                      </div>
                    )}
                  </div>
                )}

                {/* Step 6: Reason (optional) */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Motivo de consulta <span className="text-slate-300 font-normal">(opcional)</span></label>
                  <input
                    type="text"
                    value={newConsulta.reason}
                    onChange={e => setNewConsulta(prev => ({ ...prev, reason: e.target.value }))}
                    placeholder="Ej: Control de rutina, seguimiento..."
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
                  />
                </div>

                {/* Summary */}
                {newConsulta.patient_id && newConsulta.date && newConsulta.time && newConsulta.plan_id && (
                  <div className="bg-emerald-50 rounded-lg p-3 text-sm text-emerald-700 space-y-1">
                    <div>
                      <span className="font-semibold">Resumen:</span>{' '}
                      {patients.find(p => p.id === newConsulta.patient_id)?.full_name} —{' '}
                      {new Date(newConsulta.date + 'T12:00:00').toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long' })} a las {newConsulta.time}
                    </div>
                    <div className="text-xs">
                      <span className="font-semibold">Plan:</span> {pricingPlans.find(p => p.id === newConsulta.plan_id)?.name} — ${pricingPlans.find(p => p.id === newConsulta.plan_id)?.price_usd.toFixed(2)}
                      {' · '}<span className="font-semibold">Pago:</span> {newConsulta.payment_method.replace(/_/g, ' ')}
                      {newConsulta.payment_reference && ` · Ref: ${newConsulta.payment_reference}`}
                    </div>
                    {newConsulta.reason && <div className="text-xs"><span className="font-semibold">Motivo:</span> {newConsulta.reason}</div>}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => { setShowNewConsulta(false); setSearchText('') }}
                    className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={createConsultaFromAgenda}
                    disabled={!newConsulta.patient_id || !newConsulta.date || !newConsulta.time || !newConsulta.plan_id || creatingConsulta}
                    className="flex-1 py-2.5 g-bg text-white rounded-lg text-sm font-bold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {creatingConsulta ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    {creatingConsulta ? 'Creando...' : 'Crear consulta'}
                  </button>
                </div>
              </div>
            </div>
          )
        })()}
      </div>

      {/* BUG-8 fix: NewAppointmentFlow estilo booking público (acordeón) */}
      {showNewFlow && (
        <NewAppointmentFlow
          open={showNewFlow}
          onClose={() => setShowNewFlow(false)}
          onSuccess={() => {
            setShowNewFlow(false)
            // Refrescar la agenda para que aparezca la nueva cita
            window.location.reload()
          }}
          initialContext={{
            origin: 'agenda_btn',
            slotStart: newFlowSlotStart,
          }}
        />
      )}
    </>
  )
}
