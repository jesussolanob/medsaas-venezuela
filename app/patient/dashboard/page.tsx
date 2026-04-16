'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Activity, LogOut, Calendar, FileText, Pill, MessageCircle,
  AlertCircle, Clock, User,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Appointment {
  id: string
  scheduled_at: string
  patient_name: string
  chief_complaint?: string
  status: string
  plan_name: string
  plan_price: number
  doctor_id: string
}

interface Doctor {
  id: string
  full_name: string
  specialty?: string
  avatar_url?: string
}

interface Prescription {
  id: string
  medication_name: string
  dosage?: string
  frequency?: string
  duration?: string
  prescribed_date: string
}

interface Message {
  id: string
  body: string
  direction: string
  created_at: string
}

export default function PatientDashboard() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [activeTab, setActiveTab] = useState<'citas' | 'recetas' | 'mensajes'>('citas')
  const [loading, setLoading] = useState(true)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [doctors, setDoctors] = useState<Record<string, Doctor>>({})
  const [newMessage, setNewMessage] = useState('')
  const [sendingMessage, setSendingMessage] = useState(false)
  const [patientIds, setPatientIds] = useState<string[]>([])

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createClient()
        const { data: { user: authUser }, error: userErr } = await supabase.auth.getUser()

        if (userErr || !authUser) {
          router.push('/patient/login')
          return
        }

        setUser(authUser)
        loadData(authUser.id)
      } catch (err) {
        console.error('Auth check error:', err)
        router.push('/patient/login')
      }
    }

    checkAuth()
  }, [router])

  const loadData = async (userId: string) => {
    try {
      setLoading(true)
      const supabase = createClient()

      // Get all patient IDs for this user
      const { data: patientsData, error: pErr } = await supabase
        .from('patients')
        .select('id, doctor_id')
        .eq('auth_user_id', userId)

      if (pErr) {
        console.error('Error loading patients:', pErr)
        setLoading(false)
        return
      }

      const patIds = patientsData?.map(p => p.id) || []
      setPatientIds(patIds)

      // Load appointments
      if (patIds.length > 0) {
        const { data: apptData, error: apptErr } = await supabase
          .from('appointments')
          .select('*')
          .eq('auth_user_id', userId)
          .order('scheduled_at', { ascending: true })

        if (!apptErr && apptData) {
          setAppointments(apptData)

          // Load doctor info for each unique doctor_id
          const doctorIds = [...new Set(apptData.map(a => a.doctor_id))]
          const doctorsMap: Record<string, Doctor> = {}

          for (const docId of doctorIds) {
            const { data: docData } = await supabase
              .from('profiles')
              .select('id, full_name, specialty, avatar_url')
              .eq('id', docId)
              .single()

            if (docData) {
              doctorsMap[docId] = docData
            }
          }

          setDoctors(doctorsMap)
        }

        // Load prescriptions
        const { data: prescData, error: prescErr } = await supabase
          .from('prescriptions')
          .select('*')
          .in('patient_id', patIds)
          .order('prescribed_date', { ascending: false })

        if (!prescErr && prescData) {
          setPrescriptions(prescData)
        }

        // Load messages - use first patient_id
        if (patIds.length > 0) {
          const { data: msgData, error: msgErr } = await supabase
            .from('patient_messages')
            .select('*')
            .eq('patient_id', patIds[0])
            .order('created_at', { ascending: true })

          if (!msgErr && msgData) {
            setMessages(msgData)
          }
        }
      }

      setLoading(false)
    } catch (err) {
      console.error('Error loading data:', err)
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    try {
      const supabase = createClient()
      await supabase.auth.signOut()
      router.push('/patient/login')
    } catch (err) {
      console.error('Logout error:', err)
    }
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim() || !user || patientIds.length === 0) return

    setSendingMessage(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.from('patient_messages').insert({
        patient_id: patientIds[0],
        body: newMessage.trim(),
        direction: 'patient_to_doctor',
      })

      if (!error) {
        setNewMessage('')
        // Reload messages
        const { data: msgData } = await supabase
          .from('patient_messages')
          .select('*')
          .eq('patient_id', patientIds[0])
          .order('created_at', { ascending: true })

        if (msgData) setMessages(msgData)
      }
    } catch (err) {
      console.error('Error sending message:', err)
    }
    setSendingMessage(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-teal-500 flex items-center justify-center mx-auto animate-pulse">
            <Activity className="w-6 h-6 text-white" />
          </div>
          <p className="text-slate-500 font-medium">Cargando...</p>
        </div>
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-teal-500">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-slate-900">Delta</span>
          </Link>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-semibold text-slate-900">{user.user_metadata?.full_name || user.email}</p>
              <p className="text-xs text-slate-500">Paciente</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-600"
              title="Cerrar sesión"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Tabs */}
        <div className="flex gap-4 mb-8 border-b border-slate-200">
          {[
            { key: 'citas', label: 'Mis citas', icon: Calendar },
            { key: 'recetas', label: 'Mis recetas', icon: Pill },
            { key: 'mensajes', label: 'Mensajes', icon: MessageCircle },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`flex items-center gap-2 px-4 py-3 font-medium text-sm transition-colors border-b-2 ${
                activeTab === tab.key
                  ? 'text-teal-600 border-teal-500'
                  : 'text-slate-600 border-transparent hover:text-slate-900'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="space-y-6">
          {/* MIS CITAS */}
          {activeTab === 'citas' && (
            <div className="space-y-4">
              {appointments.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
                  <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500 font-medium">No tienes citas agendadas</p>
                  <p className="text-sm text-slate-400 mt-1">Pide un link de booking a tu doctor</p>
                </div>
              ) : (
                appointments.map((apt) => {
                  const doctor = doctors[apt.doctor_id]
                  const apptDate = new Date(apt.scheduled_at)
                  const isPast = apptDate < new Date()
                  const statusColor = apt.status === 'scheduled' ? 'teal' : apt.status === 'confirmed' ? 'green' : 'slate'

                  return (
                    <div key={apt.id} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-slate-900">{apt.plan_name}</p>
                          <p className="text-sm text-slate-500 mt-1">
                            Con: <span className="font-medium text-slate-900">{doctor?.full_name || 'Doctor'}</span>
                            {doctor?.specialty && <span className="text-slate-400"> · {doctor.specialty}</span>}
                          </p>
                        </div>
                        <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                          statusColor === 'teal' ? 'bg-teal-50 text-teal-600' :
                          statusColor === 'green' ? 'bg-green-50 text-green-600' :
                          'bg-slate-50 text-slate-600'
                        }`}>
                          {apt.status === 'scheduled' ? 'Agendada' : apt.status === 'confirmed' ? 'Confirmada' : apt.status}
                        </span>
                      </div>
                      <div className="flex gap-6 text-sm text-slate-600">
                        <span className="flex items-center gap-2">
                          <Calendar className="w-4 h-4" />
                          {apptDate.toLocaleDateString('es-VE', { weekday: 'short', day: 'numeric', month: 'short' })}
                        </span>
                        <span className="flex items-center gap-2">
                          <Clock className="w-4 h-4" />
                          {apptDate.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="text-teal-600 font-semibold">${apt.plan_price} USD</span>
                      </div>
                      {apt.chief_complaint && <p className="text-sm text-slate-600 pt-2 border-t border-slate-100">{apt.chief_complaint}</p>}
                    </div>
                  )
                })
              )}
            </div>
          )}

          {/* MIS RECETAS */}
          {activeTab === 'recetas' && (
            <div className="space-y-4">
              {prescriptions.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
                  <Pill className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500 font-medium">No tienes recetas registradas</p>
                  <p className="text-sm text-slate-400 mt-1">Tus medicamentos aparecerán aquí</p>
                </div>
              ) : (
                prescriptions.map((presc) => (
                  <div key={presc.id} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-teal-50">
                          <Pill className="w-5 h-5 text-teal-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">{presc.medication_name}</p>
                          <p className="text-xs text-slate-400 mt-1">
                            Prescrito: {new Date(presc.prescribed_date).toLocaleDateString('es-VE')}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      {presc.dosage && (
                        <div>
                          <p className="text-xs font-semibold text-slate-500 uppercase">Dosis</p>
                          <p className="text-slate-900">{presc.dosage}</p>
                        </div>
                      )}
                      {presc.frequency && (
                        <div>
                          <p className="text-xs font-semibold text-slate-500 uppercase">Frecuencia</p>
                          <p className="text-slate-900">{presc.frequency}</p>
                        </div>
                      )}
                      {presc.duration && (
                        <div>
                          <p className="text-xs font-semibold text-slate-500 uppercase">Duración</p>
                          <p className="text-slate-900">{presc.duration}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* MENSAJES */}
          {activeTab === 'mensajes' && (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 h-96 flex flex-col">
                {/* Messages */}
                <div className="flex-1 overflow-y-auto space-y-3 pb-2">
                  {messages.length === 0 ? (
                    <div className="h-full flex items-center justify-center">
                      <div className="text-center">
                        <MessageCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                        <p className="text-slate-500 font-medium">Sin mensajes aún</p>
                        <p className="text-sm text-slate-400 mt-1">Inicia una conversación</p>
                      </div>
                    </div>
                  ) : (
                    messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex ${msg.direction === 'patient_to_doctor' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-xs px-4 py-2 rounded-xl text-sm ${
                            msg.direction === 'patient_to_doctor'
                              ? 'bg-teal-500 text-white'
                              : 'bg-slate-100 text-slate-900'
                          }`}
                        >
                          {msg.body}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Input */}
                <form onSubmit={handleSendMessage} className="flex gap-2 pt-4 border-t border-slate-100">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Escribe tu mensaje..."
                    className="flex-1 px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                  />
                  <button
                    type="submit"
                    disabled={sendingMessage || !newMessage.trim()}
                    className="px-4 py-2 rounded-xl bg-teal-500 text-white font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                  >
                    {sendingMessage ? '...' : 'Enviar'}
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
