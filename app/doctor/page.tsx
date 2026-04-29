'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useBcvRate } from '@/lib/useBcvRate'
import { formatUsd, formatBs } from '@/lib/finances'
import {
  Users, Calendar, FileText, TrendingUp,
  Bell, DollarSign, ArrowRight, Activity,
  CheckCircle, Clock, AlertCircle, ClipboardList,
  ChevronLeft, ChevronRight as ChevronRightIcon,
  UserPlus, X
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import NewAppointmentFlow from '@/components/appointment-flow/NewAppointmentFlow'
// L3 (2026-04-29): quick action "Crear paciente" en el dashboard reusa
// el PatientForm unificado + addPatient action y muestra toast al guardar.
import PatientForm, { type PatientFormData } from '@/components/patient/PatientForm'
import { addPatient, getDoctorId } from '@/app/doctor/patients/actions'
import { showToast } from '@/components/ui/Toaster'

type Profile = {
  full_name: string
  specialty: string | null
  email: string
  professional_title: string | null
}

type Appointment = {
  id: string
  patient_name: string
  scheduled_at: string
  status: string
  source?: 'appointment' | 'consultation'
  // L2 (2026-04-29): se carga para que click → /doctor/consultations?open=<consultation_id>
  // cuando ya hay consulta linkeada; si no hay, fallback a /doctor/agenda.
  consultation_id?: string | null
}

type FinancialData = {
  total_revenue: number
  appointment_count: number
}

type AllTimeStats = {
  total_revenue_lifetime: number
  total_patients: number
  patients_attended: number
}

export default function DoctorDashboard() {
  const router = useRouter()
  const { rate: bcvRate, toBs, toBsNum } = useBcvRate()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [todayAppointments, setTodayAppointments] = useState<Appointment[]>([])
  const [financialData, setFinancialData] = useState<FinancialData>({ total_revenue: 0, appointment_count: 0 })
  const [allTimeStats, setAllTimeStats] = useState<AllTimeStats>({ total_revenue_lifetime: 0, total_patients: 0, patients_attended: 0 })
  const [loading, setLoading] = useState(true)
  // Modal "Nueva consulta"
  const [showNewFlow, setShowNewFlow] = useState(false)
  // L3 (2026-04-29): estado del modal "Crear paciente" (quick action) +
  // patientId del recien creado para abrir NewAppointmentFlow opcionalmente.
  const [showPatientForm, setShowPatientForm] = useState(false)
  const [patientFormSaving, setPatientFormSaving] = useState(false)
  const [newAppointmentPatientId, setNewAppointmentPatientId] = useState<string | null>(null)

  // Month filter state (year-month)
  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState({ year: now.getFullYear(), month: now.getMonth() })

  const goToPrevMonth = () => {
    setSelectedMonth(prev => prev.month === 0 ? { year: prev.year - 1, month: 11 } : { year: prev.year, month: prev.month - 1 })
  }
  const goToNextMonth = () => {
    setSelectedMonth(prev => prev.month === 11 ? { year: prev.year + 1, month: 0 } : { year: prev.year, month: prev.month + 1 })
  }
  const isCurrentMonth = selectedMonth.year === now.getFullYear() && selectedMonth.month === now.getMonth()
  const monthLabel = new Date(selectedMonth.year, selectedMonth.month).toLocaleDateString('es-VE', { month: 'long', year: 'numeric' })

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: prof } = await supabase
        .from('profiles')
        .select('full_name, specialty, email, professional_title')
        .eq('id', user.id)
        .single()

      // Get today's appointments
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)

      // L2 (2026-04-29): tambien traemos consultation_id para que click en cita
      // del dashboard navegue a la consulta cuando exista (#11).
      const { data: appointments } = await supabase
        .from('appointments')
        .select('id, patient_name, scheduled_at, status, consultation_id')
        .eq('doctor_id', user.id)
        .in('status', ['scheduled', 'confirmed', 'completed'])
        .gte('scheduled_at', today.toISOString())
        .lt('scheduled_at', tomorrow.toISOString())
        .order('scheduled_at', { ascending: true })

      const allAppointments: Appointment[] = (appointments || []).map(a => ({
        id: a.id,
        patient_name: a.patient_name,
        scheduled_at: a.scheduled_at,
        status: a.status,
        source: 'appointment',
        consultation_id: (a as { consultation_id?: string | null }).consultation_id ?? null,
      }))

      // Get selected month's financial data
      const monthStart = new Date(selectedMonth.year, selectedMonth.month, 1)
      const monthEnd = new Date(selectedMonth.year, selectedMonth.month + 1, 0)
      monthEnd.setHours(23, 59, 59, 999)

      // Financial: ingresos = SUM(payments.amount_usd WHERE status='approved')
      // (reingeniería 2026-04-22: source of truth = payments table)
      const { data: approvedThisMonth } = await supabase
        .from('payments')
        .select('amount_usd')
        .eq('doctor_id', user.id)
        .eq('status', 'approved')
        .gte('created_at', monthStart.toISOString())
        .lte('created_at', monthEnd.toISOString())

      let totalRevenue = (approvedThisMonth || []).reduce((s, p) => s + (Number(p.amount_usd) || 0), 0)
      let appointmentCount = (approvedThisMonth || []).length

      // Fallback: si payments aún no tiene data (migración pendiente), suma desde appointments legacy
      if (totalRevenue === 0 && appointmentCount === 0) {
        const { data: completedAppts } = await supabase
          .from('appointments')
          .select('plan_price')
          .eq('doctor_id', user.id)
          .eq('status', 'completed')
          .neq('source', 'google_calendar')
          .gte('scheduled_at', monthStart.toISOString())
          .lte('scheduled_at', monthEnd.toISOString())

        totalRevenue = (completedAppts || []).reduce((sum, a) => sum + (Number(a.plan_price) || 0), 0)
        appointmentCount = (completedAppts || []).length
      }

      // ── All-time stats ─────────────────────────────────────────────────────
      // Lifetime revenue: payments aprobados de toda la historia
      const { data: allApproved } = await supabase
        .from('payments')
        .select('amount_usd')
        .eq('doctor_id', user.id)
        .eq('status', 'approved')

      let totalRevenueLifetime = (allApproved || []).reduce((s, p) => s + (Number(p.amount_usd) || 0), 0)

      // Fallback legacy
      if (totalRevenueLifetime === 0) {
        const { data: allCompleted } = await supabase
          .from('appointments')
          .select('plan_price')
          .eq('doctor_id', user.id)
          .eq('status', 'completed')
          .neq('source', 'google_calendar')

        totalRevenueLifetime = (allCompleted || []).reduce(
          (sum, a) => sum + (Number(a.plan_price) || 0), 0
        )
      }

      // Total de pacientes únicos registrados por este doctor
      const { count: patientCount } = await supabase
        .from('patients')
        .select('id', { count: 'exact', head: true })
        .eq('doctor_id', user.id)

      // Pacientes atendidos (tienen al menos una consulta aprobada/pendiente o cita completada)
      const { data: consultedPatients } = await supabase
        .from('consultations')
        .select('patient_id')
        .eq('doctor_id', user.id)
      const uniquePatientsAttended = new Set(
        (consultedPatients || []).map(c => c.patient_id).filter(Boolean)
      ).size

      setProfile(prof)
      setTodayAppointments(allAppointments)
      setFinancialData({ total_revenue: totalRevenue, appointment_count: appointmentCount })
      setAllTimeStats({
        total_revenue_lifetime: totalRevenueLifetime,
        total_patients: patientCount || 0,
        patients_attended: uniquePatientsAttended,
      })
      setLoading(false)
    }
    fetchData()
  }, [selectedMonth])

  // REFRESH AUTOMATICO (ronda 15): cuando cambia algo en payments del doctor,
  // re-ejecutar fetchData para que el saldo del Dashboard quede sincronizado con
  // Cobros y Finanzas sin necesidad de reload.
  useEffect(() => {
    const supabase = createClient()
    let channel: any = null
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      channel = supabase
        .channel(`dashboard-payments-watch-${user.id}-${Math.random().toString(36).slice(2, 8)}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'payments', filter: `doctor_id=eq.${user.id}` },
          () => {
            // Forzar re-render trigger con cambio de selectedMonth a si mismo es feo;
            // mejor recargar usando setSelectedMonth (mantiene el mes actual)
            setSelectedMonth(prev => ({ ...prev }))
          }
        )
        .subscribe()
    })()
    return () => { if (channel) supabase.removeChannel(channel) }
  }, [])

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Buenos días'
    if (h < 18) return 'Buenas tardes'
    return 'Buenas noches'
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: true })
  }

  const getStatusBadgeColor = (status: string, isPast: boolean = false) => {
    // If appointment time has passed, show as "Pasada"
    if (isPast && (status === 'scheduled' || status === 'pending')) {
      return 'bg-red-50 text-red-700 border border-red-200'
    }
    switch (status) {
      case 'completed':
        return 'bg-emerald-50 text-emerald-700 border border-emerald-200'
      case 'confirmed':
        return 'bg-blue-50 text-blue-700 border border-blue-200'
      case 'pending':
      case 'scheduled':
        return 'bg-amber-50 text-amber-700 border border-amber-200'
      case 'cancelled':
        return 'bg-slate-50 text-slate-700 border border-slate-200'
      default:
        return 'bg-slate-50 text-slate-700 border border-slate-200'
    }
  }

  const getStatusBadgeText = (apt: Appointment, isPast: boolean = false): string => {
    if (isPast && (apt.status === 'scheduled' || apt.status === 'pending')) {
      return 'Pasada'
    }
    switch (apt.status) {
      case 'completed':
        return 'Completada'
      case 'confirmed':
        return 'Confirmada'
      case 'pending':
      case 'scheduled':
        return 'Pendiente'
      case 'cancelled':
        return 'Cancelada'
      default:
        return apt.status
    }
  }

  // L3 (2026-04-29): handler del PatientForm en modo CREATE. Replica el patron
  // de app/doctor/patients/page.tsx (reusa addPatient + revalida lista en sv).
  // Tras crear: toast, cierra modal y deja el patientId disponible para ofrecer
  // "Crear cita ahora" con NewAppointmentFlow pre-rellenado.
  async function handleCreatePatient(formData: PatientFormData) {
    setPatientFormSaving(true)
    try {
      const doctorId = await getDoctorId()
      if (!doctorId) throw new Error('Sesion expirada')
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
      showToast({ type: 'success', message: 'Paciente creado' })
      setShowPatientForm(false)
      setNewAppointmentPatientId(res.patient_id)
    } catch (err: any) {
      // Re-throw para que PatientForm muestre el error inline
      throw err
    } finally {
      setPatientFormSaving(false)
    }
  }

  // L2 (2026-04-29): si la cita ya tiene consulta linkeada → abrir esa consulta;
  // si no, mandar a la agenda (no a /doctor/consultations con un appointment.id
  // que no matchea ningun consultation.id, que era el bug previo).
  const handleAppointmentClick = (apt: Appointment) => {
    if (apt.consultation_id) {
      router.push(`/doctor/consultations?open=${apt.consultation_id}`)
    } else {
      router.push('/doctor/agenda')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-slate-400">
          <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm">Cargando tu portal...</span>
        </div>
      </div>
    )
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        * { font-family: 'Inter', sans-serif; }
        .g-bg { background: linear-gradient(135deg, #00C4CC 0%, #0891b2 50%, #0e7490 100%); }
        .g-text { background: linear-gradient(135deg, #00C4CC, #0891b2); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .card-hover { transition: all 0.2s; }
        .card-hover:hover { transform: translateY(-2px); box-shadow: 0 10px 25px -5px rgba(0,0,0,0.08); }
      `}</style>

      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
          <div className="flex-1">
            <p className="text-slate-500 text-sm">{greeting()},</p>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mt-0.5">
              {profile?.full_name ? `${profile.professional_title || 'Dr.'} ${profile.full_name}` : 'Bienvenido'}
            </h1>
            {profile?.specialty && (
              <p className="text-slate-400 text-sm mt-1">{profile.specialty}</p>
            )}
          </div>

          {/* Beta badge */}
          <div className="flex items-center gap-2 bg-white border border-teal-200 rounded-xl px-3 sm:px-4 py-2 sm:py-2.5 shrink-0">
            <CheckCircle className="w-4 h-4 text-teal-500" />
            <div>
              <p className="text-xs font-semibold text-teal-700">Beta Privada</p>
              <p className="text-[10px] text-slate-400">Acceso completo</p>
            </div>
          </div>
        </div>

        {/* Hero welcome card */}
        <div className="g-bg rounded-2xl p-7 relative overflow-hidden text-white">
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/10 blur-2xl pointer-events-none" />
          <div className="absolute bottom-0 left-1/3 w-24 h-24 rounded-full bg-cyan-400/20 blur-xl pointer-events-none" />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-5 h-5 text-white/80" />
              <span className="text-white/80 text-sm font-medium">Delta</span>
            </div>
            <h2 className="text-xl font-bold text-white mb-1">
              Tu portal médico está listo
            </h2>
            <p className="text-white/70 text-sm max-w-lg">
              Gestiona pacientes, agenda citas, lleva historial clínico y controla tus finanzas, todo desde un solo lugar.
            </p>
            <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-3 mt-5">
              <Link
                href="/doctor/patients"
                className="flex items-center justify-center sm:justify-start gap-2 bg-white text-teal-600 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-white/90 transition-colors"
              >
                <Users className="w-4 h-4" />
                <span>Ver Pacientes</span>
              </Link>
              <Link
                href="/doctor/agenda"
                className="flex items-center justify-center sm:justify-start gap-2 bg-white/20 backdrop-blur text-white font-semibold text-sm px-4 py-2 rounded-xl hover:bg-white/30 transition-colors border border-white/30"
              >
                <Calendar className="w-4 h-4" />
                <span>Ver Agenda</span>
              </Link>
              <button
                onClick={() => setShowNewFlow(true)}
                className="flex items-center justify-center sm:justify-start gap-2 bg-white/20 backdrop-blur text-white font-semibold text-sm px-4 py-2 rounded-xl hover:bg-white/30 transition-colors border border-white/30"
              >
                <ClipboardList className="w-4 h-4" />
                <span>Crear Consulta</span>
              </button>
              {/* L3 (2026-04-29): quick action "Crear paciente" desde el dashboard */}
              <button
                onClick={() => setShowPatientForm(true)}
                className="flex items-center justify-center sm:justify-start gap-2 bg-white/20 backdrop-blur text-white font-semibold text-sm px-4 py-2 rounded-xl hover:bg-white/30 transition-colors border border-white/30"
              >
                <UserPlus className="w-4 h-4" />
                <span>Crear Paciente</span>
              </button>
            </div>
          </div>
        </div>

        {/* ── 3 KPI Cards: ingresos, pacientes, atendidos ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Ingresos totales</p>
              <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-900">
              {formatUsd(allTimeStats.total_revenue_lifetime)}
            </p>
            {bcvRate && (
              <p className="text-[11px] text-slate-400 mt-1">
                ≈ {formatBs(toBsNum(allTimeStats.total_revenue_lifetime))}
              </p>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Mis pacientes</p>
              <div className="w-8 h-8 rounded-lg bg-cyan-50 text-cyan-600 flex items-center justify-center">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-900">{allTimeStats.total_patients.toLocaleString('es-VE')}</p>
            <p className="text-[11px] text-slate-400 mt-1">Registrados en tu consultorio</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Pacientes atendidos</p>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <CheckCircle className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-900">{allTimeStats.patients_attended.toLocaleString('es-VE')}</p>
            <p className="text-[11px] text-slate-400 mt-1">Con al menos una consulta</p>
          </div>
        </div>

        {/* Widgets Grid - Bento style */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Citas del Día Widget */}
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="w-5 h-5 text-teal-500" />
              <h2 className="text-sm font-semibold text-slate-900">Citas del Día</h2>
              <span className="ml-auto text-xs font-medium text-slate-400 bg-slate-50 px-2.5 py-1 rounded-full">
                {todayAppointments.length}
              </span>
            </div>

            {todayAppointments.length === 0 ? (
              <p className="text-sm text-slate-400 py-8 text-center">No hay citas programadas para hoy</p>
            ) : (
              <div className="space-y-3">
                {todayAppointments.slice(0, 3).map((apt) => {
                  const appointmentTime = new Date(apt.scheduled_at)
                  const now = new Date()
                  const isPast = appointmentTime < now
                  return (
                    <button
                      key={apt.id}
                      onClick={() => handleAppointmentClick(apt)}
                      className="w-full flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100 hover:border-teal-200 hover:bg-teal-50/30 transition-colors text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900">{apt.patient_name || 'Paciente sin nombre'}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{formatTime(apt.scheduled_at)}</p>
                      </div>
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ml-2 ${getStatusBadgeColor(apt.status, isPast)}`}>
                        {getStatusBadgeText(apt, isPast)}
                      </span>
                    </button>
                  )
                })}
                {todayAppointments.length > 3 && (
                  <Link
                    href="/doctor/agenda"
                    className="text-xs text-teal-600 hover:text-teal-700 font-medium flex items-center gap-1 pt-2"
                  >
                    Ver todas ({todayAppointments.length})
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* Finanzas del Mes Widget */}
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <DollarSign className="w-5 h-5 text-teal-500" />
              <h2 className="text-sm font-semibold text-slate-900">Finanzas</h2>
              <div className="ml-auto flex items-center gap-1">
                <button onClick={goToPrevMonth} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs font-medium text-slate-600 min-w-[110px] text-center capitalize">{monthLabel}</span>
                <button onClick={goToNextMonth} disabled={isCurrentMonth} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                  <ChevronRightIcon className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-gradient-to-br from-teal-50 to-cyan-50 rounded-lg p-4 border border-teal-100">
                <p className="text-xs text-slate-500 font-medium mb-1">Ingresos Totales</p>
                <p className="text-2xl font-bold text-teal-600">
                  {formatUsd(financialData.total_revenue)}
                </p>
                {bcvRate && <p className="text-sm text-teal-500 font-semibold">{toBs(financialData.total_revenue)}</p>}
                <p className="text-xs text-slate-400 mt-1">USD</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                  <p className="text-xs text-slate-500 font-medium">Citas Completadas</p>
                  <p className="text-xl font-bold text-slate-900 mt-1">{financialData.appointment_count}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                  <p className="text-xs text-slate-500 font-medium">Promedio por Cita</p>
                  <p className="text-xl font-bold text-slate-900 mt-1">
                    {formatUsd(financialData.appointment_count > 0 ? (financialData.total_revenue / financialData.appointment_count) : 0)}
                  </p>
                  {bcvRate && financialData.appointment_count > 0 && (
                    <p className="text-xs text-slate-400">{toBs(financialData.total_revenue / financialData.appointment_count)}</p>
                  )}
                </div>
              </div>

              <Link
                href="/doctor/finances"
                className="text-xs text-teal-600 hover:text-teal-700 font-medium flex items-center gap-1 pt-2"
              >
                Ver más detalles
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Modal: crear consulta (estilo acordeón) */}
      <NewAppointmentFlow
        open={showNewFlow}
        onClose={() => {
          setShowNewFlow(false)
          // L3 (2026-04-29): si veniamos del flujo "crear paciente → crear cita"
          // limpiamos el patientId pendiente para evitar re-mostrar el prompt.
          setNewAppointmentPatientId(null)
        }}
        onSuccess={(id) => {
          setShowNewFlow(false)
          setNewAppointmentPatientId(null)
          router.push(`/doctor/consultations?open=${id}`)
        }}
        initialContext={{
          origin: 'dashboard_btn',
          // L3 (2026-04-29): pre-rellenar paciente si viene del quick action.
          ...(newAppointmentPatientId ? { patientId: newAppointmentPatientId } : {}),
        }}
      />

      {/* L3 (2026-04-29): Modal "Crear paciente" desde dashboard.
          Replica el patron usado en /doctor/patients (PatientForm + addPatient). */}
      {showPatientForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl g-bg flex items-center justify-center">
                  <UserPlus className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="font-bold text-slate-900">Nuevo paciente</h2>
                  <p className="text-xs text-slate-400">Completa los datos para registrar al paciente</p>
                </div>
              </div>
              <button
                onClick={() => setShowPatientForm(false)}
                className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4 text-slate-600" />
              </button>
            </div>
            <PatientForm
              submitting={patientFormSaving}
              onSubmit={handleCreatePatient}
              onCancel={() => setShowPatientForm(false)}
            />
          </div>
        </div>
      )}

      {/* L3 (2026-04-29): mini-prompt post creacion para ofrecer
          "Crear cita ahora" con NewAppointmentFlow pre-rellenado. */}
      {newAppointmentPatientId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 mx-auto mb-3 flex items-center justify-center">
              <CheckCircle className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-900 mb-1">Paciente creado</h3>
            <p className="text-sm text-slate-500 mb-5">
              ¿Quieres agendarle una cita ahora?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setNewAppointmentPatientId(null)}
                className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Más tarde
              </button>
              <button
                onClick={() => {
                  // Mantenemos el id en estado: NewAppointmentFlow lo recibe via initialContext
                  setShowNewFlow(true)
                }}
                className="flex-1 py-2.5 px-4 rounded-xl bg-teal-500 text-white text-sm font-bold hover:bg-teal-600"
              >
                Crear cita ahora
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
