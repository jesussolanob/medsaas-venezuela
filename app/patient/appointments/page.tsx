'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Calendar, Clock, User, Filter, Video, MapPin } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Appointment {
  id: string
  scheduled_at: string
  plan_name: string
  plan_price: number
  status: string
  chief_complaint?: string
  doctor_id: string
  doctor_name?: string
  doctor_specialty?: string
  appointment_mode?: string
  meet_link?: string
}

type FilterStatus = 'all' | 'future' | 'past'

export default function AppointmentsPage() {
  const router = useRouter()
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterStatus>('all')

  useEffect(() => {
    const loadAppointments = async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          router.push('/patient/login')
          return
        }

        const { data: apts } = await supabase
          .from('appointments')
          .select('*')
          .eq('auth_user_id', user.id)
          .order('scheduled_at', { ascending: false })

        if (apts) {
          // Load doctor info for each appointment
          const enhancedApts: Appointment[] = []
          for (const apt of apts) {
            const { data: doctor } = await supabase
              .from('profiles')
              .select('full_name, specialty')
              .eq('id', apt.doctor_id)
              .single()

            enhancedApts.push({
              ...apt,
              doctor_name: doctor?.full_name,
              doctor_specialty: doctor?.specialty
            })
          }
          setAppointments(enhancedApts)
        }

        setLoading(false)
      } catch (err) {
        console.error('Error loading appointments:', err)
        setLoading(false)
      }
    }

    loadAppointments()
  }, [router])

  const now = new Date()
  const filtered = appointments.filter(apt => {
    const aptDate = new Date(apt.scheduled_at)
    if (filter === 'future') return aptDate >= now
    if (filter === 'past') return aptDate < now
    return true
  })

  const getStatusColor = (status: string) => {
    if (status === 'scheduled') return 'bg-blue-50 text-blue-600'
    if (status === 'confirmed') return 'bg-green-50 text-green-600'
    if (status === 'completed') return 'bg-slate-50 text-slate-600'
    if (status === 'cancelled') return 'bg-red-50 text-red-600'
    return 'bg-slate-50 text-slate-600'
  }

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      scheduled: 'Agendada',
      confirmed: 'Confirmada',
      completed: 'Completada',
      cancelled: 'Cancelada'
    }
    return labels[status] || status
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-teal-500 flex items-center justify-center mx-auto animate-pulse" />
          <p className="text-slate-500 font-medium">Cargando citas...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header with filters */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Mis citas</h1>
        <div className="flex flex-wrap gap-2">
          {(['all', 'future', 'past'] as FilterStatus[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                filter === f
                  ? 'bg-teal-500 text-white'
                  : 'bg-white text-slate-600 border border-slate-200 hover:border-teal-300'
              }`}
            >
              {f === 'all' ? 'Todas' : f === 'future' ? 'Próximas' : 'Pasadas'}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
            <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">
              {filter === 'future' ? 'No tienes citas próximas' : 'No hay citas'}
            </p>
          </div>
        ) : (
          filtered.map(apt => {
            const aptDate = new Date(apt.scheduled_at)
            const isPast = aptDate < now

            return (
              <div key={apt.id} className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-0">
                  <div className="space-y-1">
                    <p className="font-semibold text-slate-900 text-sm sm:text-base">{apt.plan_name}</p>
                    <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-600">
                      <User className="w-4 h-4 shrink-0" />
                      <span className="truncate">{apt.doctor_name || 'Doctor'}</span>
                      {apt.doctor_specialty && <span className="text-slate-400 hidden sm:inline">· {apt.doctor_specialty}</span>}
                    </div>
                  </div>
                  <span className={`text-xs font-bold px-3 py-1 rounded-full w-fit ${getStatusColor(apt.status)}`}>
                    {getStatusLabel(apt.status)}
                  </span>
                </div>

                <div className="flex flex-wrap gap-3 sm:gap-6 text-xs sm:text-sm text-slate-600">
                  <span className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    {aptDate.toLocaleDateString('es-VE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                  <span className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    {aptDate.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="text-teal-600 font-semibold">${apt.plan_price} USD</span>
                </div>

                {/* Appointment mode badge */}
                {apt.appointment_mode && (
                  <div className="flex items-center gap-2">
                    {apt.appointment_mode === 'online' ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-purple-600 bg-purple-50 px-2.5 py-1 rounded-full">
                        <Video className="w-3.5 h-3.5" />
                        Consulta Online
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-slate-50 px-2.5 py-1 rounded-full">
                        <MapPin className="w-3.5 h-3.5" />
                        Presencial
                      </span>
                    )}
                  </div>
                )}

                {/* Google Meet link for online appointments */}
                {apt.meet_link && !isPast && (apt.status === 'scheduled' || apt.status === 'confirmed') && (
                  <div className="bg-gradient-to-r from-teal-50 to-cyan-50 border border-teal-200 rounded-xl p-3 sm:p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Video className="w-5 h-5 text-teal-600" />
                        <div>
                          <p className="text-sm font-semibold text-teal-700">Videollamada disponible</p>
                          <p className="text-xs text-teal-500">Google Meet — haz clic para unirte</p>
                        </div>
                      </div>
                      <a
                        href={apt.meet_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-2 bg-teal-500 hover:bg-teal-600 text-white font-semibold text-sm px-4 py-2 rounded-lg transition-colors"
                      >
                        <Video className="w-4 h-4" />
                        Unirme a la llamada
                      </a>
                    </div>
                  </div>
                )}

                {apt.chief_complaint && (
                  <div className="pt-3 border-t border-slate-100">
                    <p className="text-sm text-slate-600"><strong>Motivo:</strong> {apt.chief_complaint}</p>
                  </div>
                )}

                {/* RONDA 21 — Botón "Agendar otra cita" con el mismo doctor.
                    Lleva al booking publico del doctor con doctor_id en la URL.
                    Responsive: full width en mobile, auto en desktop con icono Calendar. */}
                {apt.doctor_id && (
                  <div className="pt-3 border-t border-slate-100">
                    <a
                      href={`/book/${apt.doctor_id}`}
                      className="inline-flex w-full sm:w-auto items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-600 text-white text-sm font-bold transition-colors shadow-sm shadow-teal-500/20"
                    >
                      <Calendar className="w-4 h-4" />
                      Agendar otra cita con {apt.doctor_name?.split(' ')[0] || 'este doctor'}
                    </a>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
