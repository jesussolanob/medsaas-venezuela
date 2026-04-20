'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Users, Calendar, FileText, TrendingUp,
  Bell, DollarSign, ArrowRight, Activity,
  CheckCircle, Clock, AlertCircle, ClipboardList,
  ChevronLeft, ChevronRight as ChevronRightIcon
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

type Profile = {
  full_name: string
  specialty: string | null
  email: string
  professional_title: string | null
}

type Subscription = {
  plan: string
  status: string
  current_period_end: string | null
}

type Appointment = {
  id: string
  patient_name: string
  scheduled_at: string
  status: string
  source?: 'appointment' | 'consultation'
}

type FinancialData = {
  total_revenue: number
  appointment_count: number
}

export default function DoctorDashboard() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [todayAppointments, setTodayAppointments] = useState<Appointment[]>([])
  const [financialData, setFinancialData] = useState<FinancialData>({ total_revenue: 0, appointment_count: 0 })
  const [loading, setLoading] = useState(true)

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

      const { data: sub } = await supabase
        .from('subscriptions')
        .select('plan, status, current_period_end')
        .eq('doctor_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      // Get today's appointments
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)

      const { data: appointments } = await supabase
        .from('appointments')
        .select('id, patient_name, scheduled_at, status')
        .eq('doctor_id', user.id)
        .gte('scheduled_at', today.toISOString())
        .lt('scheduled_at', tomorrow.toISOString())
        .order('scheduled_at', { ascending: true })

      // Also get today's confirmed consultations
      const { data: consultations } = await supabase
        .from('consultations')
        .select('id, patients(full_name), consultation_date')
        .eq('doctor_id', user.id)
        .gte('consultation_date', today.toISOString())
        .lt('consultation_date', tomorrow.toISOString())
        .order('consultation_date', { ascending: true })

      // Merge appointments and consultations, avoiding duplicates
      const consultationsList: Appointment[] = (consultations || []).map(c => ({
        id: c.id,
        patient_name: !Array.isArray(c.patients) && c.patients ? (c.patients as { full_name: string }).full_name : 'Paciente',
        scheduled_at: c.consultation_date,
        status: 'confirmed',
        source: 'consultation'
      }))

      // Only include appointments that don't have a matching consultation (same patient + similar time)
      const appointmentsList: Appointment[] = (appointments || []).filter(a => {
        return !consultationsList.some(c => {
          const timeDiff = Math.abs(new Date(c.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())
          return c.patient_name === a.patient_name && timeDiff < 3600000
        })
      }).map(a => ({
        id: a.id,
        patient_name: a.patient_name,
        scheduled_at: a.scheduled_at,
        status: a.status,
        source: 'appointment'
      }))

      const allAppointments = [...consultationsList, ...appointmentsList].sort((a, b) =>
        new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
      )

      // Get selected month's financial data
      const monthStart = new Date(selectedMonth.year, selectedMonth.month, 1)
      const monthEnd = new Date(selectedMonth.year, selectedMonth.month + 1, 0)
      monthEnd.setHours(23, 59, 59, 999)

      // Financial data: from consultations (single source of truth)
      // Count ALL consultations that have an amount (regardless of payment_status)
      const { data: monthlyConsultations } = await supabase
        .from('consultations')
        .select('amount, payment_status')
        .eq('doctor_id', user.id)
        .gte('consultation_date', monthStart.toISOString())
        .lte('consultation_date', monthEnd.toISOString())

      // Sum all consultations with an amount > 0 (income tracker, not just "approved")
      const paidConsultations = (monthlyConsultations || []).filter(c => Number(c.amount) > 0)
      const totalRevenue = paidConsultations.reduce((sum, c) => sum + (Number(c.amount) || 0), 0)
      const appointmentCount = paidConsultations.length

      setProfile(prof)
      setSubscription(sub)
      setTodayAppointments(allAppointments)
      setFinancialData({ total_revenue: totalRevenue, appointment_count: appointmentCount })
      setLoading(false)
    }
    fetchData()
  }, [selectedMonth])

  const daysLeft = subscription?.current_period_end
    ? Math.ceil((new Date(subscription.current_period_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null

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

  const handleAppointmentClick = (apt: Appointment) => {
    if (apt.source === 'consultation') {
      router.push(`/doctor/consultations?open=${apt.id}`)
    } else {
      router.push(`/doctor/consultations?open=${apt.id}`)
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
        {/* Subscription banner */}
        {subscription && daysLeft !== null && daysLeft <= 7 && daysLeft > 0 && (
          <div className={`rounded-xl px-4 sm:px-5 py-3 sm:py-4 flex flex-col sm:flex-row items-start sm:items-center gap-3 border ${daysLeft <= 3 ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
            <AlertCircle className={`w-5 h-5 shrink-0 ${daysLeft <= 3 ? 'text-red-500' : 'text-amber-500'}`} />
            <div className="flex-1">
              <p className={`text-sm font-semibold ${daysLeft <= 3 ? 'text-red-700' : 'text-amber-700'}`}>
                Tu suscripción vence en {daysLeft} día{daysLeft !== 1 ? 's' : ''}
              </p>
              <p className={`text-xs mt-0.5 ${daysLeft <= 3 ? 'text-red-500' : 'text-amber-500'}`}>
                Renueva tu plan para mantener el acceso sin interrupciones.
              </p>
            </div>
            <Link
              href="/doctor/plans"
              className="text-xs font-semibold text-white bg-teal-500 hover:bg-teal-600 px-3 sm:px-4 py-1.5 rounded-lg transition-colors shrink-0"
            >
              Renovar
            </Link>
          </div>
        )}

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

          {/* Subscription badge */}
          {subscription && (
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 sm:px-4 py-2 sm:py-2.5 shrink-0">
              {subscription.status === 'trial' || subscription.status === 'active' ? (
                <CheckCircle className="w-4 h-4 text-emerald-500" />
              ) : (
                <Clock className="w-4 h-4 text-amber-400" />
              )}
              <div>
                <p className="text-xs font-semibold text-slate-700 capitalize">
                  Plan {subscription.plan === 'clinic' ? 'Centro de Salud' : subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1)}
                </p>
                <p className="text-[10px] text-slate-400 capitalize">
                  {subscription.status === 'trial' ? 'Período de prueba' :
                   subscription.status === 'active' ? 'Activo' :
                   subscription.status === 'past_due' ? 'Pago pendiente' : subscription.status}
                </p>
              </div>
            </div>
          )}
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
              <Link
                href="/doctor/consultations"
                className="flex items-center justify-center sm:justify-start gap-2 bg-white/20 backdrop-blur text-white font-semibold text-sm px-4 py-2 rounded-xl hover:bg-white/30 transition-colors border border-white/30"
              >
                <ClipboardList className="w-4 h-4" />
                <span>Crear Consulta</span>
              </Link>
            </div>
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
                  ${financialData.total_revenue.toFixed(2)}
                </p>
                <p className="text-xs text-slate-400 mt-2">USD</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                  <p className="text-xs text-slate-500 font-medium">Citas Completadas</p>
                  <p className="text-xl font-bold text-slate-900 mt-1">{financialData.appointment_count}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                  <p className="text-xs text-slate-500 font-medium">Promedio por Cita</p>
                  <p className="text-xl font-bold text-slate-900 mt-1">
                    ${financialData.appointment_count > 0 ? (financialData.total_revenue / financialData.appointment_count).toFixed(2) : '0.00'}
                  </p>
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
    </>
  )
}
