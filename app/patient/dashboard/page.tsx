'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Activity, LogOut, Calendar, FileText, Pill, MessageCircle,
  AlertCircle, Plus, ArrowRight, Clock, User,
} from 'lucide-react'
import { supabase } from '@/lib/supabase-client'

interface PatientSession {
  patient_id: string
  doctor_id: string
  full_name: string
  phone: string
}

interface Appointment {
  id: string
  appointment_date: string
  appointment_time: string
  appointment_type: string
  status: string
  notes?: string
}

interface Consultation {
  id: string
  consultation_date: string
  chief_complaint?: string
  diagnosis?: string
  notes?: string
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
  read_at?: string
}

interface Doctor {
  id: string
  full_name: string
  specialty?: string
  avatar_url?: string
}

export default function PatientDashboard() {
  const router = useRouter()
  const [session, setSession] = useState<PatientSession | null>(null)
  const [activeTab, setActiveTab] = useState<'citas' | 'informes' | 'recetas' | 'mensajes'>('citas')
  const [loading, setLoading] = useState(true)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [consultations, setConsultations] = useState<Consultation[]>([])
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [doctor, setDoctor] = useState<Doctor | null>(null)
  const [newMessage, setNewMessage] = useState('')
  const [sendingMessage, setSendingMessage] = useState(false)

  useEffect(() => {
    // Leer sesión de localStorage
    const stored = localStorage.getItem('patient_session')
    if (!stored) {
      router.push('/patient/login')
      return
    }

    const sess = JSON.parse(stored) as PatientSession
    setSession(sess)

    // Cargar datos
    loadData(sess)
  }, [router])

  const loadData = async (sess: PatientSession) => {
    try {
      setLoading(true)

      // Cargar doctor
      const { data: doctorData } = await supabase
        .from('profiles')
        .select('id, full_name, specialty, avatar_url')
        .eq('id', sess.doctor_id)
        .single()

      if (doctorData) setDoctor(doctorData)

      // Cargar citas futuras
      const { data: apptData } = await supabase
        .from('appointments')
        .select('id, appointment_date, appointment_time, appointment_type, status, notes')
        .eq('patient_id', sess.patient_id)
        .gte('appointment_date', new Date().toISOString().split('T')[0])
        .order('appointment_date', { ascending: true })

      if (apptData) setAppointments(apptData)

      // Cargar consultas pasadas
      const { data: consData } = await supabase
        .from('consultations')
        .select('id, consultation_date, chief_complaint, diagnosis, notes')
        .eq('patient_id', sess.patient_id)
        .lt('consultation_date', new Date().toISOString().split('T')[0])
        .order('consultation_date', { ascending: false })

      if (consData) setConsultations(consData)

      // Cargar recetas
      const { data: prescData } = await supabase
        .from('prescriptions')
        .select('id, medication_name, dosage, frequency, duration, prescribed_date')
        .eq('patient_id', sess.patient_id)
        .order('prescribed_date', { ascending: false })

      if (prescData) setPrescriptions(prescData)

      // Cargar mensajes
      const { data: msgData } = await supabase
        .from('patient_messages')
        .select('id, body, direction, created_at, read_at')
        .eq('patient_id', sess.patient_id)
        .order('created_at', { ascending: true })

      if (msgData) setMessages(msgData)

      setLoading(false)
    } catch (err) {
      console.error('Error cargando datos:', err)
      setLoading(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('patient_session')
    router.push('/patient/login')
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim() || !session) return

    setSendingMessage(true)
    try {
      const { error } = await supabase.from('patient_messages').insert({
        patient_id: session.patient_id,
        doctor_id: session.doctor_id,
        body: newMessage.trim(),
        direction: 'patient_to_doctor',
      })

      if (!error) {
        setNewMessage('')
        // Recargar mensajes
        const { data: msgData } = await supabase
          .from('patient_messages')
          .select('id, body, direction, created_at, read_at')
          .eq('patient_id', session.patient_id)
          .order('created_at', { ascending: true })

        if (msgData) setMessages(msgData)
      }
    } catch (err) {
      console.error('Error enviando mensaje:', err)
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

  if (!session) return null

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
              <p className="text-sm font-semibold text-slate-900">{session.full_name}</p>
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
            { key: 'informes', label: 'Mis informes', icon: FileText },
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
                  <p className="text-sm text-slate-400 mt-1">Contáctate con {doctor?.full_name || 'tu doctor'} para agendar</p>
                </div>
              ) : (
                appointments.map((apt) => (
                  <div key={apt.id} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-slate-900">{apt.appointment_type || 'Cita'}</p>
                        <p className="text-sm text-slate-500 mt-1">
                          Con: <span className="font-medium text-slate-900">{doctor?.full_name}</span>
                          {doctor?.specialty && <span className="text-slate-400"> · {doctor.specialty}</span>}
                        </p>
                      </div>
                      <span className="text-xs font-bold px-3 py-1 rounded-full bg-teal-50 text-teal-600">
                        {apt.status || 'Agendada'}
                      </span>
                    </div>
                    <div className="flex gap-6 text-sm text-slate-600">
                      <span className="flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        {new Date(apt.appointment_date).toLocaleDateString('es-VE')}
                      </span>
                      <span className="flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        {apt.appointment_time}
                      </span>
                    </div>
                    {apt.notes && <p className="text-sm text-slate-600 pt-2 border-t border-slate-100">{apt.notes}</p>}
                  </div>
                ))
              )}
            </div>
          )}

          {/* MIS INFORMES */}
          {activeTab === 'informes' && (
            <div className="space-y-4">
              {consultations.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
                  <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500 font-medium">No tienes informes registrados</p>
                  <p className="text-sm text-slate-400 mt-1">Aquí aparecerán tus diagnósticos y reportes</p>
                </div>
              ) : (
                consultations.map((cons) => (
                  <div key={cons.id} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3">
                    <div className="flex items-start justify-between">
                      <p className="font-semibold text-slate-900">Consulta</p>
                      <span className="text-xs text-slate-400">
                        {new Date(cons.consultation_date).toLocaleDateString('es-VE')}
                      </span>
                    </div>
                    {cons.chief_complaint && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase">Motivo</p>
                        <p className="text-sm text-slate-900">{cons.chief_complaint}</p>
                      </div>
                    )}
                    {cons.diagnosis && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase">Diagnóstico</p>
                        <p className="text-sm text-slate-900">{cons.diagnosis}</p>
                      </div>
                    )}
                    {cons.notes && (
                      <div className="pt-2 border-t border-slate-100">
                        <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Notas</p>
                        <p className="text-sm text-slate-600">{cons.notes}</p>
                      </div>
                    )}
                  </div>
                ))
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
                        <p className="text-sm text-slate-400 mt-1">Inicia una conversación con {doctor?.full_name}</p>
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
