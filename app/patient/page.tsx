'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Calendar, FileText, ArrowRight, Zap
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const styles = `
  @keyframes card-hover {
    0% {
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      transform: translateY(0);
    }
    100% {
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      transform: translateY(-2px);
    }
  }

  .card-hover {
    transition: box-shadow 200ms, transform 200ms;
  }

  .card-hover:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    transform: translateY(-2px);
  }

  .gradient-hero {
    background: linear-gradient(135deg, #00C4CC 0%, #0891b2 50%, #0e7490 100%);
  }

  .gradient-progress {
    background: linear-gradient(90deg, #a78bfa 0%, #8b5cf6 100%);
  }
`

interface Appointment {
  id: string
  scheduled_at: string
  plan_name: string
  status: string
}

interface Patient {
  id: string
  full_name: string
}

interface PatientPackage {
  id: string
  plan_name: string
  total_sessions: number
  used_sessions: number
  doctor_id: string
  doctor_name?: string
  doctor_specialty?: string
}

export default function PatientHome() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [patient, setPatient] = useState<Patient | null>(null)
  const [nextAppointment, setNextAppointment] = useState<Appointment | null>(null)
  const [totalAppointments, setTotalAppointments] = useState(0)
  const [unreadMessages, setUnreadMessages] = useState(0)
  const [packages, setPackages] = useState<PatientPackage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadData = async () => {
      try {
        const supabase = createClient()
        const { data: { user: authUser }, error: userErr } = await supabase.auth.getUser()

        if (userErr || !authUser) {
          router.push('/patient/login')
          return
        }

        setUser(authUser)

        // Get patient info
        const { data: patients } = await supabase
          .from('patients')
          .select('id, full_name')
          .eq('auth_user_id', authUser.id)
          .single()

        if (patients) setPatient(patients)

        // Get next appointment
        const { data: nextApt } = await supabase
          .from('appointments')
          .select('id, scheduled_at, plan_name, status')
          .eq('auth_user_id', authUser.id)
          .gte('scheduled_at', new Date().toISOString())
          .order('scheduled_at', { ascending: true })
          .limit(1)
          .single()

        if (nextApt) setNextAppointment(nextApt)

        // Get total appointments count
        const { count: aptCount } = await supabase
          .from('appointments')
          .select('*', { count: 'exact', head: true })
          .eq('auth_user_id', authUser.id)

        setTotalAppointments(aptCount || 0)

        // RONDA 29: removido fetch de unread messages — el chat fue retirado del MVP.
        // En su lugar contamos los informes disponibles (consultas con contenido).
        if (patients?.id) {
          const { data: patientIds } = await supabase
            .from('patients')
            .select('id')
            .eq('auth_user_id', authUser.id)

          if (patientIds && patientIds.length > 0) {
            const ids = patientIds.map(p => p.id)
            const { count: reportsCount } = await supabase
              .from('consultations')
              .select('*', { count: 'exact', head: true })
              .in('patient_id', ids)
              .or('notes.not.is.null,diagnosis.not.is.null,treatment.not.is.null')

            setUnreadMessages(reportsCount || 0)  // reusamos el state como "informes disponibles"
          }
        }

        // Get active patient packages with doctor info
        const { data: pkgData } = await supabase
          .from('patient_packages')
          .select('id, plan_name, total_sessions, used_sessions, doctor_id')
          .eq('auth_user_id', authUser.id)
          .eq('status', 'active')

        if (pkgData && pkgData.length > 0) {
          // Fetch doctor names for each package
          const doctorIds = [...new Set(pkgData.map(p => p.doctor_id).filter(Boolean))]
          const { data: doctors } = await supabase
            .from('profiles')
            .select('id, full_name, specialty')
            .in('id', doctorIds)

          const doctorMap = new Map(doctors?.map(d => [d.id, d]) || [])
          const enriched = pkgData.map(pkg => ({
            ...pkg,
            doctor_name: doctorMap.get(pkg.doctor_id)?.full_name || undefined,
            doctor_specialty: doctorMap.get(pkg.doctor_id)?.specialty || undefined,
          }))
          setPackages(enriched as PatientPackage[])
        }

        setLoading(false)
      } catch (err) {
        console.error('Error loading data:', err)
        setLoading(false)
      }
    }

    loadData()
  }, [router])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-teal-500 flex items-center justify-center mx-auto animate-pulse" />
          <p className="text-slate-500 font-medium">Cargando...</p>
        </div>
      </div>
    )
  }

  const firstName = patient?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'Paciente'

  return (
    <>
      <style>{styles}</style>
      <div className="space-y-6 sm:space-y-8">
        {/* Gradient Hero Banner */}
        <div className="gradient-hero rounded-2xl p-6 sm:p-8 lg:p-10 relative overflow-hidden">
          {/* Decorative blur orbs */}
          <div className="absolute -top-20 -left-20 w-40 h-40 bg-white opacity-10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-16 -right-16 w-56 h-56 bg-white opacity-5 rounded-full blur-3xl pointer-events-none" />

          {/* Content */}
          <div className="relative z-10">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-2">Hola, {firstName}</h2>
            <p className="text-sm sm:text-base text-white opacity-90 mb-6">Tu portal de salud está listo</p>

            {!nextAppointment && (
              <Link href="/patient/appointments">
                <button className="inline-flex items-center gap-2 bg-white hover:bg-slate-100 text-teal-600 font-semibold px-4 sm:px-6 py-2.5 rounded-lg transition-colors duration-200">
                  <Calendar className="w-4 h-4" />
                  Agendar cita
                </button>
              </Link>
            )}
          </div>
        </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
        {/* Next appointment */}
        <Link href="/patient/appointments">
          <div className="card-hover bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 space-y-4 cursor-pointer h-full">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-500 uppercase">Próxima cita</p>
                <p className="text-sm font-semibold text-slate-900">
                  {nextAppointment ? nextAppointment.plan_name : 'Sin citas agendadas'}
                </p>
              </div>
              <div className="p-2 rounded-lg bg-blue-50">
                <Calendar className="w-5 h-5 text-blue-600" />
              </div>
            </div>
            {nextAppointment && (
              <div className="pt-2 border-t border-slate-100">
                <p className="text-xs text-slate-600">
                  {new Date(nextAppointment.scheduled_at).toLocaleDateString('es-VE', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
              </div>
            )}
            <div className="flex items-center gap-2 text-teal-600 text-sm font-medium">
              Ver todas <ArrowRight className="w-4 h-4" />
            </div>
          </div>
        </Link>

        {/* Total appointments */}
        <Link href="/patient/appointments">
          <div className="card-hover bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 space-y-4 cursor-pointer h-full">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-500 uppercase">Total de citas</p>
                <p className="text-3xl font-bold text-slate-900">{totalAppointments}</p>
              </div>
              <div className="p-2 rounded-lg bg-green-50">
                <Calendar className="w-5 h-5 text-green-600" />
              </div>
            </div>
            <div className="flex items-center gap-2 text-teal-600 text-sm font-medium">
              Ver historial <ArrowRight className="w-4 h-4" />
            </div>
          </div>
        </Link>

        {/* RONDA 29: card de Mensajes reemplazada por Informes — el chat fue retirado del MVP */}
        <Link href="/patient/reports">
          <div className="card-hover bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 space-y-4 cursor-pointer h-full">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-500 uppercase">Informes</p>
                <p className="text-3xl font-bold text-slate-900">{unreadMessages}</p>
              </div>
              <div className="p-2 rounded-lg bg-purple-50">
                <FileText className="w-5 h-5 text-purple-600" />
              </div>
            </div>
            <div className="flex items-center gap-2 text-teal-600 text-sm font-medium">
              Ver informes <ArrowRight className="w-4 h-4" />
            </div>
          </div>
        </Link>
      </div>

      {/* Active Packages */}
      {packages.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Zap className="w-4 h-4 text-violet-500" />
            Paquetes activos
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 lg:gap-6">
            {packages.map((pkg) => {
              const remaining = pkg.total_sessions - pkg.used_sessions
              const percentage = (pkg.used_sessions / pkg.total_sessions) * 100
              return (
                <div key={pkg.id} className="card-hover bg-white rounded-2xl border border-slate-200 border-l-4 border-l-violet-400 p-4 sm:p-6 space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 flex-1">
                      <p className="text-xs font-semibold text-slate-500 uppercase">{pkg.plan_name}</p>
                      <p className="text-sm font-semibold text-slate-900">Te quedan {remaining} {remaining === 1 ? 'cita' : 'citas'}</p>
                      {pkg.doctor_name && (
                        <p className="text-xs text-slate-500">
                          Dr. {pkg.doctor_name}
                          {pkg.doctor_specialty && <span className="text-slate-400"> · {pkg.doctor_specialty}</span>}
                        </p>
                      )}
                    </div>
                    <div className="px-3 py-1 rounded-full bg-violet-50 text-xs font-bold text-violet-600">
                      {pkg.used_sessions}/{pkg.total_sessions}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                      <div className="gradient-progress h-2 rounded-full transition-all" style={{ width: `${percentage}%` }}></div>
                    </div>
                    <p className="text-xs text-slate-500">
                      {pkg.used_sessions} de {pkg.total_sessions} usadas
                    </p>
                  </div>
                  {remaining > 0 && pkg.doctor_id && (
                    <Link href={`/book/${pkg.doctor_id}`}
                      className="flex items-center justify-center gap-2 w-full py-2 bg-teal-50 hover:bg-teal-100 text-teal-600 rounded-lg text-xs font-semibold transition-colors border border-teal-200">
                      <Calendar className="w-3.5 h-3.5" />
                      Agendar siguiente cita
                    </Link>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 lg:gap-6">
        <Link href="/patient/reports">
          <div className="card-hover bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 space-y-3 cursor-pointer">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-orange-50">
                <FileText className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">Mis Informes</p>
                <p className="text-sm text-slate-500 mt-1">Revisa tus informes médicos y resultados</p>
              </div>
            </div>
          </div>
        </Link>

        <Link href="/patient/profile">
          <div className="card-hover bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 space-y-3 cursor-pointer">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-indigo-50">
                <Calendar className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">Mi Perfil</p>
                <p className="text-sm text-slate-500 mt-1">Actualiza tu información personal</p>
              </div>
            </div>
          </div>
        </Link>
      </div>
    </div>
    </>
  )
}
