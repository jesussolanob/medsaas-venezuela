'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Calendar, Clock, Plus, ChevronLeft, ChevronRight, Link2, Check, Trash2, AlertCircle, CheckCircle, ClipboardList, Search, X, Settings, Stethoscope, Upload, Loader2, Package } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

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
  id: string
  patient_name: string
  date: string            // YYYY-MM-DD
  isoDate: string         // full ISO
  time: string            // HH:MM
  endTime: string         // HH:MM (calculado)
  chief_complaint?: string
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled'
  source: 'consultation' | 'appointment'
  consultation_code?: string
  appointment_code?: string
  plan_name?: string
  plan_price?: number
  patient_phone?: string | null
  patient_email?: string | null
  patient_cedula?: string | null
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
type AgendaTab = 'calendar' | 'availability'

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
  const [statusFilter, setStatusFilter] = useState<'all' | 'scheduled' | 'confirmed' | 'completed' | 'cancelled'>('all')

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

    // 2. Load CONFIRMED consultations (only recent + future — last 30 days + next 60 days)
    const pastCutoff = new Date()
    pastCutoff.setDate(pastCutoff.getDate() - 30)
    const futureCutoff = new Date()
    futureCutoff.setDate(futureCutoff.getDate() + 60)

    const { data: consults } = await supabase
      .from('consultations')
      .select('id, consultation_code, consultation_date, chief_complaint, payment_status, appointment_id, amount, patients(full_name, phone, email)')
      .eq('doctor_id', user.id)
      .gte('consultation_date', pastCutoff.toISOString())
      .lte('consultation_date', futureCutoff.toISOString())
      .order('consultation_date', { ascending: true })

    const slotDuration = config.slot_duration || 30
    const consultAppts: CalendarAppointment[] = (consults ?? []).map(c => {
      const d = new Date(c.consultation_date)
      const timeStr = toHHMM(d)
      return {
        id: c.id,
        patient_name: (!Array.isArray(c.patients) && c.patients) ? (c.patients as any).full_name : 'Paciente',
        date: dateToYMD(d),
        isoDate: c.consultation_date,
        time: timeStr,
        endTime: addMinutes(timeStr, slotDuration),
        chief_complaint: c.chief_complaint ?? undefined,
        status: 'confirmed' as const,
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

    // 4. Load CONFIRMED appointments (already accepted, show in calendar)
    const { data: confirmed } = await supabase
      .from('appointments')
      .select('id, scheduled_at, chief_complaint, patient_name, patient_phone, patient_email, plan_name, plan_price, status, appointment_code')
      .eq('doctor_id', user.id)
      .eq('status', 'confirmed')
      .order('scheduled_at', { ascending: true })

    const confirmedAppts: CalendarAppointment[] = (confirmed ?? [])
      .filter(a => !consultAppts.some(c => c.isoDate === a.scheduled_at && c.patient_name === a.patient_name))
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
    const supabase = createClient()
    try {
      const rescheduledDate = new Date(rescheduleDate + 'T' + rescheduleTime + ':00').toISOString()
      await supabase
        .from('appointments')
        .update({ scheduled_at: rescheduledDate })
        .eq('id', rescheduling.id)

      setPendingAppointments(prev => prev.map(a =>
        a.id === rescheduling.id ? { ...a, scheduled_at: rescheduledDate } : a
      ))
      toast.success('Cita reagendada')
      setRescheduling(null)
      setRescheduleDate(null)
      setRescheduleTime(null)
      setRescheduleWeekOffset(0)
    } catch (e) {
      console.error(e)
      toast.error('Error al reagendar')
    }
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
          <div className="flex gap-2">
            <div className="flex gap-1 bg-slate-100 rounded-xl p-1 shrink-0">
              {(['calendar', 'availability'] as AgendaTab[]).map(t => (
                <button key={t} onClick={() => setTab(t)} className={`px-3 sm:px-4 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${tab === t ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                  {t === 'calendar' ? 'Calendario' : 'Disponibilidad'}
                </button>
              ))}
            </div>
          </div>
        </div>

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

            {/* Status filter */}
            <div className="flex flex-wrap gap-1.5">
              {([
                { key: 'all', label: 'Todas', color: 'slate' },
                { key: 'scheduled', label: 'Agendadas', color: 'amber' },
                { key: 'confirmed', label: 'Confirmadas', color: 'blue' },
                { key: 'completed', label: 'Completadas', color: 'emerald' },
                { key: 'cancelled', label: 'Canceladas', color: 'red' },
              ] as const).map(f => (
                <button
                  key={f.key}
                  onClick={() => setStatusFilter(f.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                    statusFilter === f.key
                      ? f.key === 'all' ? 'bg-slate-800 text-white border-slate-800'
                        : f.key === 'scheduled' ? 'bg-amber-500 text-white border-amber-500'
                        : f.key === 'confirmed' ? 'bg-blue-500 text-white border-blue-500'
                        : f.key === 'completed' ? 'bg-emerald-500 text-white border-emerald-500'
                        : 'bg-red-500 text-white border-red-500'
                      : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
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
                          <button onClick={() => setTab('availability')} className="mt-3 text-xs text-teal-600 font-semibold hover:text-teal-700">
                            Configurar disponibilidad
                          </button>
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
                                    {slotAppt.chief_complaint || (slotAppt.status === 'scheduled' ? 'Pendiente de aprobación' : 'Confirmada')}
                                  </p>
                                </button>
                              ) : (
                                <div className="h-12 rounded-lg border border-dashed border-slate-200 flex items-center justify-center">
                                  <p className="text-xs text-slate-300">Disponible</p>
                                </div>
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

        {/* ═══ APPROVAL PANEL (below calendar) ═══ */}
        {tab === 'calendar' && (
          <div className="bg-white border border-slate-200 rounded-xl">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-slate-700 uppercase tracking-widest flex items-center gap-2">
                  <ClipboardList className="w-4 h-4" /> Panel de aprobaciones
                </p>
                <p className="text-xs text-slate-400 mt-1">{pendingAppointments.length} citas pendientes</p>
              </div>
            </div>

            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input value={searchText} onChange={e => setSearchText(e.target.value)} placeholder="Buscar por nombre, cédula..."
                  className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 bg-white" />
              </div>
            </div>

            {pendingAppointments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CheckCircle className="w-10 h-10 text-emerald-200 mb-3" />
                <p className="text-slate-400 text-sm">Sin citas pendientes</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {pendingAppointments
                  .filter(a => !searchText || a.patient_name.toLowerCase().includes(searchText.toLowerCase()) || (a.patient_cedula ?? '').includes(searchText))
                  .map(appt => {
                    const apptDate = new Date(appt.scheduled_at)
                    const dayOfWeek = (apptDate.getDay() + 6) % 7
                    const timeStr = toHHMM(apptDate)
                    const isValidTime = isValidSlotTime(timeStr, dayOfWeek, availSlots, config)
                    const hasConflict = allAppointments.some(a => {
                      if (a.date !== dateToYMD(apptDate)) return false
                      const aStart = timeToMinutes(a.time)
                      const aEnd = timeToMinutes(a.endTime)
                      const newStart = timeToMinutes(timeStr)
                      const newEnd = newStart + config.slot_duration
                      return (newStart < aEnd && newEnd > aStart)
                    })

                    return (
                      <div key={appt.id} className="p-5 hover:bg-slate-50 transition-colors">
                        <div className="flex items-start justify-between gap-4 mb-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{appt.patient_name}</p>
                            <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                              {appt.patient_cedula && <span>CI: {appt.patient_cedula}</span>}
                              {appt.patient_phone && <><span>·</span><span>{appt.patient_phone}</span></>}
                            </div>
                            {appt.appointment_code && <p className="text-[10px] font-mono text-slate-400 mt-1">{appt.appointment_code}</p>}
                          </div>
                          <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full">Pendiente</span>
                        </div>

                        <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
                          <Calendar className="w-3.5 h-3.5" />
                          {apptDate.toLocaleDateString('es-VE')} · {timeStr}–{addMinutes(timeStr, config.slot_duration)}
                        </div>

                        {/* Warnings */}
                        {!isValidTime && (
                          <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg mb-2">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>Horario {timeStr} no está en tus bloques disponibles para {DAYS_FULL[dayOfWeek]}. Reagenda antes de aprobar.</span>
                          </div>
                        )}
                        {hasConflict && (
                          <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg mb-2">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>Conflicto: ya existe una cita en este horario.</span>
                          </div>
                        )}

                        {appt.chief_complaint && <p className="text-xs text-slate-600 mb-2 italic">&quot;{appt.chief_complaint}&quot;</p>}

                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <span className="text-xs text-slate-500">{appt.plan_name}</span>
                          <span className="text-xs font-bold text-emerald-600">${appt.plan_price ?? 0}</span>
                          {appt.payment_method && (
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                              {appt.payment_method}
                            </span>
                          )}
                          {appt.appointment_mode && (
                            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${appt.appointment_mode === 'online' ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-600'}`}>
                              {appt.appointment_mode === 'online' ? 'Online' : 'Presencial'}
                            </span>
                          )}
                          {appt.package_id && (
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 flex items-center gap-1">
                              <Package className="w-3 h-3" />
                              Paquete {appt.session_number ?? '?'}/{appt.total_sessions ?? '?'}
                            </span>
                          )}
                        </div>

                        {/* Comprobante de pago */}
                        <div className="mb-3 bg-slate-50 border border-slate-200 rounded-lg p-3">
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Comprobante de pago</p>
                          {appt.payment_receipt_url ? (
                            <>
                              {appt.payment_receipt_url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                                <a href={appt.payment_receipt_url} target="_blank" rel="noopener noreferrer" className="block">
                                  <img src={appt.payment_receipt_url} alt="Comprobante" className="w-full max-w-xs rounded-lg border border-slate-200 hover:opacity-90 transition-opacity cursor-pointer" />
                                </a>
                              ) : (
                                <a href={appt.payment_receipt_url} target="_blank" rel="noopener noreferrer" className="text-xs text-teal-600 hover:text-teal-700 font-medium underline">
                                  Ver comprobante adjunto
                                </a>
                              )}
                            </>
                          ) : (
                            <div className="space-y-2">
                              <p className="text-xs text-slate-400 italic">El paciente no adjuntó comprobante</p>
                              <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-slate-300 hover:border-teal-400 hover:bg-teal-50/50 cursor-pointer transition-all text-xs font-medium text-slate-500 hover:text-teal-600">
                                {uploadingReceipt === appt.id ? (
                                  <><Loader2 className="w-4 h-4 animate-spin" /> Subiendo...</>
                                ) : (
                                  <><Upload className="w-4 h-4" /> Adjuntar comprobante</>
                                )}
                                <input
                                  type="file"
                                  accept="image/*,.pdf"
                                  className="hidden"
                                  disabled={uploadingReceipt === appt.id}
                                  onChange={e => {
                                    const file = e.target.files?.[0]
                                    if (file) handleUploadReceipt(appt.id, file)
                                  }}
                                />
                              </label>
                            </div>
                          )}
                        </div>

                        <div className="flex gap-2">
                          <button onClick={() => acceptAppointment(appt)} disabled={accepting === appt.id || hasConflict}
                            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors">
                            <Check className="w-4 h-4" /> {accepting === appt.id ? 'Aprobando...' : 'Aprobar'}
                          </button>
                          <button onClick={() => setRescheduling(appt)}
                            className="flex items-center justify-center gap-2 px-3 py-2 border border-slate-300 hover:bg-slate-100 text-slate-600 rounded-lg text-sm font-semibold transition-colors">
                            <Calendar className="w-4 h-4" /> Reagendar
                          </button>
                          <button onClick={() => rejectAppointment(appt.id)}
                            className="flex items-center justify-center gap-2 px-3 py-2 border border-red-200 hover:bg-red-50 text-red-600 rounded-lg text-sm font-semibold transition-colors">
                            <X className="w-4 h-4" /> Rechazar
                          </button>
                        </div>
                      </div>
                    )
                  })}
              </div>
            )}
          </div>
        )}

        {/* ═══ AVAILABILITY TAB ═══ */}
        {tab === 'availability' && (
          <div className="space-y-4">
            {/* Config panel */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Settings className="w-4 h-4 text-teal-500" />
                <p className="text-sm font-bold text-slate-700">Configuración de citas</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Duración de cita</label>
                  <select value={config.slot_duration} onChange={e => setConfig(c => ({ ...c, slot_duration: parseInt(e.target.value) }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-teal-400 bg-white">
                    {DURATION_OPTIONS.map(d => <option key={d} value={d}>{d} minutos</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Tiempo entre citas</label>
                  <select value={config.buffer_minutes} onChange={e => setConfig(c => ({ ...c, buffer_minutes: parseInt(e.target.value) }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-teal-400 bg-white">
                    {BUFFER_OPTIONS.map(b => <option key={b} value={b}>{b === 0 ? 'Sin descanso' : `${b} minutos`}</option>)}
                  </select>
                </div>
              </div>

              {/* Preview of generated slots */}
              <div className="bg-teal-50 border border-teal-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-teal-700 mb-2">Vista previa — Ejemplo bloque 08:00–12:00:</p>
                <div className="flex flex-wrap gap-1.5">
                  {(() => {
                    const preview = generateTimeSlots(0, [{ day_of_week: 0, start_time: '08:00', end_time: '12:00', is_enabled: true }], config)
                    return preview.map(s => (
                      <span key={s.time} className="text-[10px] bg-white text-teal-700 px-2 py-1 rounded-md border border-teal-200 font-mono font-semibold">
                        {s.time}–{s.endTime}
                      </span>
                    ))
                  })()}
                </div>
              </div>
            </div>

            {/* Info banner */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-700">
                Configura los bloques de horario (ej: 08:00–12:00). Las citas se generarán automáticamente cada {config.slot_duration} min
                {config.buffer_minutes > 0 && ` con ${config.buffer_minutes} min de descanso`}.
                Los pacientes verán estos horarios al agendar.
              </p>
            </div>

            {/* Weekly schedule */}
            {DAYS_FULL.map((dayName, dayIdx) => {
              const daySlots = availSlots.filter(s => s.day_of_week === dayIdx)
              const totalSlots = daySlots.filter(s => s.is_enabled).reduce((sum, s) => {
                return sum + generateTimeSlots(dayIdx, [s], config).length
              }, 0)

              return (
                <div key={dayIdx} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-700">{dayName}</p>
                      {totalSlots > 0 && <span className="text-[10px] text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full font-semibold">{totalSlots} citas</span>}
                    </div>
                    <button onClick={() => addSlot(dayIdx)} className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 font-semibold">
                      <Plus className="w-3.5 h-3.5" /><span>Agregar bloque</span>
                    </button>
                  </div>
                  <div className="p-3 sm:p-4 space-y-2">
                    {daySlots.length === 0 ? (
                      <p className="text-xs text-slate-400 py-1">Sin horarios — día libre</p>
                    ) : daySlots.map(slot => {
                      const globalIdx = availSlots.indexOf(slot)
                      const slotsInBlock = generateTimeSlots(dayIdx, [slot], config).length
                      return (
                        <div key={globalIdx} className={`flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 px-3 py-2.5 rounded-xl border transition-all ${slot.is_enabled ? 'border-teal-200 bg-teal-50/50' : 'border-slate-200 bg-slate-50 opacity-50'}`}>
                          <Clock className={`w-3.5 h-3.5 shrink-0 hidden sm:block ${slot.is_enabled ? 'text-teal-500' : 'text-slate-400'}`} />
                          <div className="flex items-center gap-2 flex-1">
                            <input type="time" value={slot.start_time} onChange={e => updateSlotTime(globalIdx, 'start_time', e.target.value)}
                              className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-teal-400 bg-white w-24" />
                            <span className="text-xs text-slate-400">a</span>
                            <input type="time" value={slot.end_time} onChange={e => updateSlotTime(globalIdx, 'end_time', e.target.value)}
                              className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-teal-400 bg-white w-24" />
                            {slot.is_enabled && <span className="text-[10px] text-teal-600 font-semibold ml-1">{slotsInBlock} citas</span>}
                          </div>
                          <div className="flex gap-1 sm:gap-2">
                            <button onClick={() => toggleSlot(globalIdx)}
                              className={`text-xs px-2.5 py-1 rounded-full font-semibold transition-all ${slot.is_enabled ? 'bg-teal-100 text-teal-600' : 'bg-slate-200 text-slate-500'}`}>
                              {slot.is_enabled ? 'Activo' : 'Inactivo'}
                            </button>
                            <button onClick={() => removeSlot(globalIdx)} className="w-7 h-7 rounded-lg bg-red-50 hover:bg-red-100 flex items-center justify-center shrink-0">
                              <Trash2 className="w-3 h-3 text-red-400" />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            <button onClick={saveSchedule} disabled={saving}
              className="w-full g-bg py-3 rounded-xl text-sm font-bold text-white hover:opacity-90 transition-opacity disabled:opacity-60">
              {saving ? 'Guardando...' : 'Guardar disponibilidad'}
            </button>
          </div>
        )}

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
              </div>

              <div className="flex gap-2 pt-4">
                <button onClick={() => {
                  router.push(`/doctor/consultations?open=${detailAppt.id}`)
                  setDetailAppt(null)
                }} className="flex-1 py-2 g-bg rounded-lg text-sm font-bold text-white hover:opacity-90 flex items-center justify-center gap-2">
                  <Stethoscope className="w-4 h-4" />
                  Ir a consulta
                </button>
                <button onClick={() => setDetailAppt(null)} className="flex-1 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50">Cerrar</button>
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
      </div>
    </>
  )
}
