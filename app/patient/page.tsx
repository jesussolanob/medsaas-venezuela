'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Calendar, FileText, MessageCircle, ArrowRight
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

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

export default function PatientHome() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [patient, setPatient] = useState<Patient | null>(null)
  const [nextAppointment, setNextAppointment] = useState<Appointment | null>(null)
  const [totalAppointments, setTotalAppointments] = useState(0)
  const [unreadMessages, setUnreadMessages] = useState(0)
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

        // Get unread messages count
        if (patients?.id) {
          const { data: patientIds } = await supabase
            .from('patients')
            .select('id')
            .eq('auth_user_id', authUser.id)

          if (patientIds && patientIds.length > 0) {
            const { count: msgCount } = await supabase
              .from('patient_messages')
              .select('*', { count: 'exact', head: true })
              .eq('patient_id', patientIds[0].id)
              .eq('direction', 'doctor_to_patient')

            setUnreadMessages(msgCount || 0)
          }
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
    <div className="space-y-8">
      {/* Welcome banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-8 space-y-2">
        <h2 className="text-2xl font-bold text-slate-900">Hola, {firstName}</h2>
        <p className="text-slate-600">Bienvenido a tu portal de paciente. Aquí puedes ver tus citas, recetas y mensajes.</p>
      </div>

      {/* Summary cards */}
      <div className="grid md:grid-cols-3 gap-6">
        {/* Next appointment */}
        <Link href="/patient/appointments">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 hover:border-teal-300 transition-colors cursor-pointer h-full">
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
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 hover:border-teal-300 transition-colors cursor-pointer h-full">
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

        {/* Unread messages */}
        <Link href="/patient/messages">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 hover:border-teal-300 transition-colors cursor-pointer h-full">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-500 uppercase">Mensajes</p>
                <p className="text-3xl font-bold text-slate-900">{unreadMessages}</p>
              </div>
              <div className="p-2 rounded-lg bg-purple-50">
                <MessageCircle className="w-5 h-5 text-purple-600" />
              </div>
            </div>
            <div className="flex items-center gap-2 text-teal-600 text-sm font-medium">
              Abrir chat <ArrowRight className="w-4 h-4" />
            </div>
          </div>
        </Link>
      </div>

      {/* Quick links */}
      <div className="grid md:grid-cols-2 gap-6">
        <Link href="/patient/reports">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3 hover:border-teal-300 transition-colors cursor-pointer">
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
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3 hover:border-teal-300 transition-colors cursor-pointer">
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
  )
}
