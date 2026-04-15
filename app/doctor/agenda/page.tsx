'use client'

import { useState, useEffect } from 'react'
import { Calendar, Clock, Plus, ChevronLeft, ChevronRight, Link2, Check, Trash2, AlertCircle, CheckCircle, XCircle, ClipboardList, Search, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
const toast = { success: (msg: string) => alert(msg), error: (msg: string) => alert(msg) }

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
  consultation_code?: string
}

type TimeSlot = { day: number; start: string; end: string; enabled: boolean }
type Appointment = {
  id: string
  patient_name: string
  date: string        // localeDateString es-VE
  isoDate: string     // ISO string for comparisons
  time: string
  chief_complaint?: string
  status: 'scheduled' | 'completed' | 'cancelled'
}

type DailyHour = {
  hour: number
  appointments: Appointment[]
}

const DAYS_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const DAYS_FULL = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

const DEFAULT_SLOTS: TimeSlot[] = [
  { day: 0, start: '08:00', end: '12:00', enabled: true },
  { day: 0, start: '14:00', end: '17:00', enabled: true },
  { day: 1, start: '08:00', end: '12:00', enabled: true },
  { day: 1, start: '14:00', end: '17:00', enabled: true },
  { day: 2, start: '08:00', end: '12:00', enabled: true },
  { day: 3, start: '08:00', end: '12:00', enabled: true },
  { day: 3, start: '14:00', end: '17:00', enabled: true },
  { day: 4, start: '08:00', end: '12:00', enabled: true },
]

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
  // start from Monday
  const startPad = (firstDay.getDay() + 6) % 7
  const cells: (Date | null)[] = []
  for (let i = 0; i < startPad; i++) cells.push(null)
  for (let d = 1; d <= lastDay.getDate(); d++) cells.push(new Date(year, month, d))
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

type CalendarView = 'week' | 'month' | 'day'
type AgendaTab = 'calendar' | 'availability'

export default function AgendaPage() {
  const today = new Date()
  const [weekOffset, setWeekOffset] = useState(0)
  const [monthYear, setMonthYear] = useState({ year: today.getFullYear(), month: today.getMonth() })
  const [selectedDate, setSelectedDate] = useState(today)
  const [calView, setCalView] = useState<CalendarView>('week')
  const [slots, setSlots] = useState<TimeSlot[]>(DEFAULT_SLOTS)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [allAppointments, setAllAppointments] = useState<Appointment[]>([])
  const [pendingAppointments, setPendingAppointments] = useState<PendingAppointment[]>([])
  const [tab, setTab] = useState<AgendaTab>('calendar')
  const [gcConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState<string | null>(null)
  const [doctorId, setDoctorId] = useState<string | null>(null)
  const [searchText, setSearchText] = useState('')
  const [rescheduling, setRescheduling] = useState<PendingAppointment | null>(null)
  const [newDateTime, setNewDateTime] = useState('')
  const weekDates = getWeekDates(weekOffset)
  const monthCells = getMonthDates(monthYear.year, monthYear.month)

  // Fetch appointments and pending bookings
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      setDoctorId(user.id)

      // Confirmed consultations (already accepted)
      const { data: consults } = await supabase
        .from('consultations')
        .select('id, consultation_date, chief_complaint, patients(full_name)')
        .eq('doctor_id', user.id)
        .order('consultation_date', { ascending: true })

      const consultAppts: Appointment[] = (consults ?? []).map(a => ({
        id: a.id,
        patient_name: (!Array.isArray(a.patients) && a.patients) ? (a.patients as { full_name: string }).full_name : 'Paciente',
        date: new Date(a.consultation_date).toLocaleDateString('es-VE'),
        isoDate: a.consultation_date,
        time: new Date(a.consultation_date).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }),
        chief_complaint: a.chief_complaint ?? undefined,
        status: 'scheduled' as const,
      }))

      setAllAppointments(consultAppts)

      // Pending appointments from booking (awaiting doctor acceptance)
      const { data: pending } = await supabase
        .from('appointments')
        .select('id, scheduled_at, chief_complaint, patient_name, patient_phone, patient_email, patient_cedula, plan_name, plan_price, status')
        .eq('doctor_id', user.id)
        .in('status', ['scheduled', 'confirmed'])
        .order('scheduled_at', { ascending: true })

      setPendingAppointments((pending ?? []) as PendingAppointment[])
      setLoading(false)
    })
  }, [])

  // Accept appointment → create patient + consultation
  async function acceptAppointment(appt: PendingAppointment) {
    if (!doctorId) return
    setAccepting(appt.id)
    const supabase = createClient()

    try {
      // 1. Create patient
      const { data: patient } = await supabase
        .from('patients')
        .insert({ doctor_id: doctorId, full_name: appt.patient_name, phone: appt.patient_phone, email: appt.patient_email, source: 'booking' })
        .select().single()

      if (!patient) throw new Error('Error creando paciente')

      // 2. Create consultation with unique code
      const dateStr = new Date(appt.scheduled_at).toISOString().split('T')[0].replace(/-/g, '')
      const code = `CON-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`
      await supabase.from('consultations').insert({
        consultation_code: code,
        patient_id: patient.id,
        doctor_id: doctorId,
        chief_complaint: appt.chief_complaint || 'Consulta agendada online',
        payment_status: 'unpaid',
        consultation_date: appt.scheduled_at,
      })

      // 3. Mark appointment as confirmed
      await supabase.from('appointments').update({ status: 'confirmed' }).eq('id', appt.id)

      // 4. Update local state
      setPendingAppointments(prev => prev.filter(a => a.id !== appt.id))

      // 5. Send confirmation toast
      toast.success(`Consulta ${code} confirmada al paciente`)

      // Add to calendar
      const newAppt: Appointment = {
        id: code,
        patient_name: appt.patient_name,
        date: new Date(appt.scheduled_at).toLocaleDateString('es-VE'),
        isoDate: appt.scheduled_at,
        time: new Date(appt.scheduled_at).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }),
        chief_complaint: appt.chief_complaint ?? undefined,
        status: 'scheduled',
      }
      setAllAppointments(prev => [...prev, newAppt])
    } catch (e) { console.error(e) }
    setAccepting(null)
  }

  async function rejectAppointment(apptId: string) {
    const supabase = createClient()
    await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', apptId)
    setPendingAppointments(prev => prev.filter(a => a.id !== apptId))
  }

  async function confirmReschedule() {
    if (!rescheduling || !newDateTime) return
    const supabase = createClient()
    try {
      // Convertir el datetime local a ISO string
      const rescheduledDate = new Date(newDateTime).toISOString()

      // Actualizar cita
      await supabase
        .from('appointments')
        .update({ scheduled_at: rescheduledDate, appointment_date: rescheduledDate })
        .eq('id', rescheduling.id)

      // Actualizar lista
      setPendingAppointments(prev => prev.map(a =>
        a.id === rescheduling.id ? { ...a, scheduled_at: rescheduledDate } : a
      ))

      toast.success(`Cita reagendada para ${new Date(rescheduledDate).toLocaleDateString('es-VE')} a las ${new Date(rescheduledDate).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}`)
      setRescheduling(null)
      setNewDateTime('')
    } catch (e) {
      console.error(e)
      toast.error('Error al reagendar')
    }
  }

  // Filter for week view
  useEffect(() => {
    const start = weekDates[0]
    const end = weekDates[6]
    setAppointments(allAppointments.filter(a => {
      const d = new Date(a.isoDate)
      return d >= start && d <= end
    }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset, allAppointments])

  function getApptsByDate(d: Date): Appointment[] {
    const dateStr = d.toLocaleDateString('es-VE')
    return allAppointments.filter(a => a.date === dateStr)
  }

  function toggleSlot(idx: number) { setSlots(prev => prev.map((s, i) => i === idx ? { ...s, enabled: !s.enabled } : s)) }
  function removeSlot(idx: number) { setSlots(prev => prev.filter((_, i) => i !== idx)) }
  function addSlot(day: number) { setSlots(prev => [...prev, { day, start: '09:00', end: '12:00', enabled: true }]) }

  const prevMonth = () => setMonthYear(({ year, month }) => month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 })
  const nextMonth = () => setMonthYear(({ year, month }) => month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 })

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');* { font-family: 'Inter', sans-serif; }.g-bg{background:linear-gradient(135deg,#00C4CC 0%,#0891b2 100%)}`}</style>

      <div className="max-w-5xl space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Agenda</h1>
            <p className="text-sm text-slate-500">Consultas programadas y disponibilidad</p>
          </div>
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
            {(['calendar', 'availability'] as AgendaTab[]).map(t => (
              <button key={t} onClick={() => setTab(t)} className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${tab === t ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {t === 'calendar' ? 'Calendario' : 'Disponibilidad'}
              </button>
            ))}
          </div>
        </div>

        {/* Google Calendar connect banner */}
        <div className={`rounded-xl p-4 flex items-center gap-4 ${gcConnected ? 'bg-emerald-50 border border-emerald-200' : 'bg-slate-900 border border-slate-700'}`}>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${gcConnected ? 'bg-emerald-500' : 'bg-white/10'}`}>
            {gcConnected ? <Check className="w-5 h-5 text-white" /> : <Calendar className="w-5 h-5 text-white" />}
          </div>
          <div className="flex-1">
            {gcConnected
              ? <><p className="text-sm font-semibold text-emerald-700">Google Calendar conectado</p><p className="text-xs text-emerald-500">Las citas se sincronizan automáticamente</p></>
              : <><p className="text-sm font-semibold text-white">Conecta tu Google Calendar</p><p className="text-xs text-slate-400">Sincroniza citas bidireccionales, evita conflictos de horario</p></>
            }
          </div>
          {!gcConnected && (
            <button onClick={() => alert('Para conectar Google Calendar, configura las credenciales OAuth en Google Cloud Console y agrega GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET al .env.local')}
              className="flex items-center gap-2 px-4 py-2 bg-white text-slate-800 rounded-xl text-xs font-bold hover:bg-slate-100 transition-colors">
              <Link2 className="w-3.5 h-3.5" />Conectar
            </button>
          )}
        </div>

        {/* CALENDAR TAB */}
        {tab === 'calendar' && (
          <div className="space-y-4">
            {/* View toggle + nav */}
            <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 py-3">
              {/* View switcher */}
              <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
                <button onClick={() => { setCalView('week'); setSelectedDate(today) }} className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${calView === 'week' ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-500'}`}>Semana</button>
                <button onClick={() => { setCalView('month'); setSelectedDate(today) }} className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${calView === 'month' ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-500'}`}>Mes</button>
                <button onClick={() => { setCalView('day'); setSelectedDate(today) }} className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${calView === 'day' ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-500'}`}>Día</button>
              </div>

              {/* Navigation */}
              <div className="flex items-center gap-3">
                <button onClick={() => {
                  if (calView === 'week') setWeekOffset(v => v - 1)
                  else if (calView === 'month') prevMonth()
                  else setSelectedDate(d => new Date(d.getTime() - 86400000))
                }} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-colors">
                  <ChevronLeft className="w-4 h-4 text-slate-500" />
                </button>
                <p className="text-sm font-semibold text-slate-700 min-w-[220px] text-center">
                  {calView === 'week'
                    ? `${weekDates[0].toLocaleDateString('es-VE', { day: '2-digit', month: 'long' })} – ${weekDates[6].toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' })}`
                    : calView === 'month'
                      ? `${MONTHS_ES[monthYear.month]} ${monthYear.year}`
                      : selectedDate.toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
                  }
                </p>
                <button onClick={() => {
                  if (calView === 'week') setWeekOffset(v => v + 1)
                  else if (calView === 'month') nextMonth()
                  else setSelectedDate(d => new Date(d.getTime() + 86400000))
                }} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-colors">
                  <ChevronRight className="w-4 h-4 text-slate-500" />
                </button>
              </div>

              <button onClick={() => { setWeekOffset(0); setMonthYear({ year: today.getFullYear(), month: today.getMonth() }) }}
                className="text-xs font-semibold text-teal-600 hover:text-teal-700 px-3 py-1 rounded-lg hover:bg-teal-50 transition-colors">
                Hoy
              </button>
            </div>

            {/* WEEK VIEW */}
            {calView === 'week' && (
              <>
                <div className="grid grid-cols-7 gap-2">
                  {weekDates.map((date, idx) => {
                    const isToday = date.toDateString() === today.toDateString()
                    const dayAppts = getApptsByDate(date)
                    return (
                      <div key={idx} className={`rounded-xl border p-3 min-h-[120px] ${isToday ? 'border-teal-400 bg-teal-50' : 'border-slate-200 bg-white'}`}>
                        <div className="mb-2">
                          <p className={`text-xs font-semibold ${isToday ? 'text-teal-600' : 'text-slate-400'}`}>{DAYS_SHORT[idx]}</p>
                          <p className={`text-lg font-bold ${isToday ? 'text-teal-700' : 'text-slate-800'}`}>{date.getDate()}</p>
                        </div>
                        {dayAppts.map(a => (
                          <div key={a.id} className="mb-1.5 bg-teal-500 rounded-lg px-2 py-1">
                            <p className="text-white text-[10px] font-bold">{a.time}</p>
                            <p className="text-white/90 text-[10px] truncate">{a.patient_name}</p>
                          </div>
                        ))}
                        {dayAppts.length === 0 && <p className="text-xs text-slate-300 mt-1">Sin citas</p>}
                      </div>
                    )
                  })}
                </div>

                {!loading && appointments.length > 0 && (
                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <div className="px-5 py-3 border-b border-slate-100">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Citas de la semana</p>
                    </div>
                    {appointments.map((a, i) => (
                      <div key={a.id} className={`flex items-center gap-4 px-5 py-3.5 ${i < appointments.length - 1 ? 'border-b border-slate-100' : ''}`}>
                        <div className="w-9 h-9 rounded-xl g-bg flex items-center justify-center shrink-0"><Clock className="w-4 h-4 text-white" /></div>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-slate-800">{a.patient_name}</p>
                          <p className="text-xs text-slate-400">{a.date} · {a.time}{a.chief_complaint ? ` · ${a.chief_complaint}` : ''}</p>
                        </div>
                        <span className="text-xs font-semibold text-teal-600 bg-teal-50 px-2.5 py-1 rounded-full">Programada</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* MONTH VIEW */}
            {calView === 'month' && (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                {/* Day headers */}
                <div className="grid grid-cols-7 border-b border-slate-100">
                  {DAYS_SHORT.map(d => (
                    <div key={d} className="px-2 py-2.5 text-center text-xs font-bold text-slate-400 uppercase tracking-widest">{d}</div>
                  ))}
                </div>
                {/* Cells */}
                <div className="grid grid-cols-7">
                  {monthCells.map((date, idx) => {
                    if (!date) return <div key={`empty-${idx}`} className="min-h-[90px] border-b border-r border-slate-100 bg-slate-50/50" />
                    const isToday = date.toDateString() === today.toDateString()
                    const dayAppts = getApptsByDate(date)
                    const isCurrentMonth = date.getMonth() === monthYear.month
                    return (
                      <div key={idx} className={`min-h-[90px] border-b border-r border-slate-100 p-2 transition-colors ${isToday ? 'bg-teal-50' : 'hover:bg-slate-50'} ${!isCurrentMonth ? 'opacity-40' : ''}`}>
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold mb-1 ${isToday ? 'g-bg text-white' : 'text-slate-700'}`}>
                          {date.getDate()}
                        </div>
                        {dayAppts.slice(0, 2).map(a => (
                          <div key={a.id} className="mb-0.5 bg-teal-500 rounded px-1.5 py-0.5">
                            <p className="text-white text-[9px] font-bold truncate">{a.time} {a.patient_name}</p>
                          </div>
                        ))}
                        {dayAppts.length > 2 && <p className="text-[9px] text-slate-400 font-semibold">+{dayAppts.length - 2} más</p>}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* DAY VIEW */}
            {calView === 'day' && (
              <div className="space-y-4">
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100 bg-slate-50">
                    <p className="text-sm font-bold text-slate-700 uppercase tracking-widest">Horario del día</p>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {Array.from({ length: 10 }, (_, i) => i + 8).map(hour => {
                      const hourAppts = allAppointments.filter(a => {
                        const aHour = new Date(a.isoDate).getHours()
                        return aHour === hour && new Date(a.isoDate).toDateString() === selectedDate.toDateString()
                      })
                      return (
                        <div key={hour} className="p-4 hover:bg-slate-50 transition-colors">
                          <div className="flex items-start gap-4">
                            <div className="w-12 text-center shrink-0">
                              <p className="text-sm font-bold text-slate-700">{String(hour).padStart(2, '0')}:00</p>
                            </div>
                            <div className="flex-1 space-y-2">
                              {hourAppts.length > 0 ? hourAppts.map(a => (
                                <div key={a.id} className="bg-teal-50 border border-teal-200 rounded-lg p-3">
                                  <p className="text-sm font-semibold text-teal-700">{a.patient_name}</p>
                                  <p className="text-xs text-teal-600 mt-0.5">{a.time}{a.chief_complaint ? ` · ${a.chief_complaint}` : ''}</p>
                                </div>
                              )) : (
                                <p className="text-xs text-slate-300">Libre</p>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* APPROVAL PANEL */}
        {tab === 'calendar' && (
          <div className="space-y-4">
            <div className="bg-white border border-slate-200 rounded-xl">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-700 uppercase tracking-widest flex items-center gap-2">
                    <ClipboardList className="w-4 h-4" /> Panel de aprobaciones
                  </p>
                  <p className="text-xs text-slate-400 mt-1">{pendingAppointments.length} citas pendientes</p>
                </div>
              </div>

              {/* Search bar */}
              <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    value={searchText}
                    onChange={e => setSearchText(e.target.value)}
                    placeholder="Buscar por nombre, cédula o código de consulta..."
                    className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 bg-white"
                  />
                </div>
              </div>

              {pendingAppointments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <CheckCircle className="w-10 h-10 text-emerald-200 mb-3" />
                  <p className="text-slate-400 text-sm">Sin citas pendientes</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {pendingAppointments.filter(a =>
                    !searchText ||
                    a.patient_name.toLowerCase().includes(searchText.toLowerCase()) ||
                    (a.patient_cedula ?? '').includes(searchText)
                  ).map((appt, i) => (
                    <div key={appt.id} className={`p-5 hover:bg-slate-50 transition-colors ${i < pendingAppointments.length - 1 ? 'border-b border-slate-100' : ''}`}>
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-slate-800">{appt.patient_name}</p>
                          <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                            {appt.patient_cedula && <span>Cédula: {appt.patient_cedula}</span>}
                            {appt.patient_phone && <span>·</span>}
                            {appt.patient_phone && <span>{appt.patient_phone}</span>}
                          </div>
                        </div>
                        <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full">Pendiente</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500 mb-3">
                        <Calendar className="w-3.5 h-3.5" />
                        {new Date(appt.scheduled_at).toLocaleDateString('es-VE')} a las {new Date(appt.scheduled_at).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      {appt.chief_complaint && <p className="text-xs text-slate-600 mb-3 italic">&quot;{appt.chief_complaint}&quot;</p>}
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xs text-slate-500">{appt.plan_name}</span>
                        <span className="text-xs font-bold text-emerald-600">${appt.plan_price ?? 20}</span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => acceptAppointment(appt)}
                          disabled={accepting === appt.id}
                          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors"
                        >
                          <Check className="w-4 h-4" /> {accepting === appt.id ? 'Aprobando...' : 'Aprobar'}
                        </button>
                        <button
                          onClick={() => setRescheduling(appt)}
                          className="flex items-center justify-center gap-2 px-3 py-2 border border-slate-300 hover:bg-slate-100 text-slate-600 rounded-lg text-sm font-semibold transition-colors"
                        >
                          <Calendar className="w-4 h-4" /> Reagendar
                        </button>
                        <button
                          onClick={() => rejectAppointment(appt.id)}
                          className="flex items-center justify-center gap-2 px-3 py-2 border border-red-200 hover:bg-red-50 text-red-600 rounded-lg text-sm font-semibold transition-colors"
                        >
                          <X className="w-4 h-4" /> Rechazar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* AVAILABILITY TAB */}
        {tab === 'availability' && (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-700">Configura los horarios en que estás disponible para consultas. Los pacientes verán estos horarios al agendar desde tu link público.</p>
            </div>

            {DAYS_FULL.map((dayName, dayIdx) => {
              const daySlots = slots.filter(s => s.day === dayIdx)
              return (
                <div key={dayIdx} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
                    <p className="text-sm font-semibold text-slate-700">{dayName}</p>
                    <button onClick={() => addSlot(dayIdx)} className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 font-semibold">
                      <Plus className="w-3.5 h-3.5" />Agregar horario
                    </button>
                  </div>
                  <div className="p-4 space-y-2">
                    {daySlots.length === 0 ? (
                      <p className="text-xs text-slate-400 py-1">Sin horarios — día libre</p>
                    ) : daySlots.map((slot) => {
                      const globalIdx = slots.indexOf(slot)
                      return (
                        <div key={globalIdx} className={`flex items-center gap-3 px-3 py-2 rounded-xl border transition-all ${slot.enabled ? 'border-teal-200 bg-teal-50/50' : 'border-slate-200 bg-slate-50 opacity-50'}`}>
                          <Clock className={`w-3.5 h-3.5 shrink-0 ${slot.enabled ? 'text-teal-500' : 'text-slate-400'}`} />
                          <div className="flex items-center gap-2 flex-1">
                            <input type="time" value={slot.start} onChange={e => setSlots(p => p.map((s, i) => i === globalIdx ? { ...s, start: e.target.value } : s))} className="text-xs border border-slate-200 rounded-lg px-2 py-1 outline-none focus:border-teal-400 bg-white" />
                            <span className="text-xs text-slate-400">—</span>
                            <input type="time" value={slot.end} onChange={e => setSlots(p => p.map((s, i) => i === globalIdx ? { ...s, end: e.target.value } : s))} className="text-xs border border-slate-200 rounded-lg px-2 py-1 outline-none focus:border-teal-400 bg-white" />
                          </div>
                          <button onClick={() => toggleSlot(globalIdx)} className={`text-xs px-2.5 py-1 rounded-full font-semibold transition-all ${slot.enabled ? 'bg-teal-100 text-teal-600 hover:bg-teal-200' : 'bg-slate-200 text-slate-500 hover:bg-slate-300'}`}>
                            {slot.enabled ? 'Activo' : 'Inactivo'}
                          </button>
                          <button onClick={() => removeSlot(globalIdx)} className="w-6 h-6 rounded-lg bg-red-50 hover:bg-red-100 flex items-center justify-center transition-colors">
                            <Trash2 className="w-3 h-3 text-red-400" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
            <button className="w-full g-bg py-3 rounded-xl text-sm font-bold text-white hover:opacity-90 transition-opacity">
              Guardar disponibilidad
            </button>
          </div>
        )}

        {/* RESCHEDULE MODAL */}
        {rescheduling && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-900">Reagendar cita</h2>
                <button onClick={() => { setRescheduling(null); setNewDateTime('') }} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="bg-slate-50 rounded-lg p-4 space-y-2">
                <p className="text-sm text-slate-600"><span className="font-semibold">Paciente:</span> {rescheduling.patient_name}</p>
                <p className="text-sm text-slate-600"><span className="font-semibold">Fecha actual:</span> {new Date(rescheduling.scheduled_at).toLocaleDateString('es-VE')} a las {new Date(rescheduling.scheduled_at).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}</p>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">Nueva fecha y hora</label>
                <input
                  type="datetime-local"
                  value={newDateTime}
                  onChange={e => setNewDateTime(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => { setRescheduling(null); setNewDateTime('') }}
                  className="flex-1 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmReschedule}
                  disabled={!newDateTime}
                  className="flex-1 py-2 bg-teal-500 text-white rounded-lg text-sm font-semibold hover:bg-teal-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
