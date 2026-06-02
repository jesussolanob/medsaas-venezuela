'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase-client'
import { MessageCircle, AlertCircle, Search } from 'lucide-react'

interface Conversation {
  patient_id: string
  patient_name: string
  last_message: string
  last_message_time: string
  unread_count: number
}

interface Message {
  id: string
  body: string
  direction: string
  created_at: string
  read_at?: string
}

interface Patient {
  id: string
  full_name: string
  phone: string
  cedula: string
}

export default function DoctorMessagesPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [patient, setPatient] = useState<Patient | null>(null)
  const [loading, setLoading] = useState(true)
  const [doctorId, setDoctorId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [sendingMessage, setSendingMessage] = useState(false)

  useEffect(() => {
    // Obtener doctor ID de sesión Supabase (si está autenticado)
    const getSession = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user?.id) {
        setDoctorId(user.id)
        loadConversations(user.id)
      }
    }
    getSession()
  }, [])

  const loadConversations = async (dId: string) => {
    try {
      // Obtener todos los pacientes del doctor y su último mensaje
      const { data: msgs } = await supabase
        .from('patient_messages')
        .select('patient_id, body, created_at')
        .eq('doctor_id', dId)
        .order('created_at', { ascending: false })

      if (msgs) {
        const grouped: Record<string, any> = {}
        for (const msg of msgs) {
          if (!grouped[msg.patient_id]) {
            grouped[msg.patient_id] = msg
          }
        }

        // Obtener nombres de pacientes
        const { data: patients } = await supabase
          .from('patients')
          .select('id, full_name')
          .in('id', Object.keys(grouped))

        const convs: Conversation[] = []
        for (const patId in grouped) {
          const pat = patients?.find((p) => p.id === patId)
          convs.push({
            patient_id: patId,
            patient_name: pat?.full_name || 'Paciente desconocido',
            last_message: grouped[patId].body,
            last_message_time: grouped[patId].created_at,
            unread_count: 0,
          })
        }

        setConversations(convs)
        setLoading(false)
      }
    } catch (err) {
      console.error('Error cargando conversaciones:', err)
      setLoading(false)
    }
  }

  const handleSelectConversation = async (patientId: string) => {
    setSelectedPatientId(patientId)

    // Cargar mensajes
    const { data: msgs } = await supabase
      .from('patient_messages')
      .select('id, body, direction, created_at, read_at')
      .eq('patient_id', patientId)
      .eq('doctor_id', doctorId!)
      .order('created_at', { ascending: true })

    if (msgs) setMessages(msgs)

    // Cargar datos del paciente
    const { data: pat } = await supabase
      .from('patients')
      .select('id, full_name, phone, cedula')
      .eq('id', patientId)
      .single()

    if (pat) setPatient(pat)

    // Marcar como leído
    if (doctorId) {
      await supabase
        .from('patient_messages')
        .update({ read_at: new Date().toISOString() })
        .eq('patient_id', patientId)
        .eq('doctor_id', doctorId)
        .is('read_at', true)
    }
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim() || !selectedPatientId || !doctorId) return

    setSendingMessage(true)
    try {
      await supabase.from('patient_messages').insert({
        patient_id: selectedPatientId,
        doctor_id: doctorId,
        body: newMessage.trim(),
        direction: 'doctor_to_patient',
      })

      setNewMessage('')

      // Recargar mensajes
      const { data: msgs } = await supabase
        .from('patient_messages')
        .select('id, body, direction, created_at, read_at')
        .eq('patient_id', selectedPatientId)
        .eq('doctor_id', doctorId)
        .order('created_at', { ascending: true })

      if (msgs) setMessages(msgs)
    } catch (err) {
      console.error('Error enviando mensaje:', err)
    }
    setSendingMessage(false)
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-slate-500">Cargando mensajes...</p>
      </div>
    )
  }

  return (
    <div className="h-full flex gap-6">
      {/* Lista de conversaciones */}
      <div className="w-80 border-r border-slate-200 flex flex-col">
        <div className="p-4 border-b border-slate-200">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar paciente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-6 text-center">
              <MessageCircle className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">Sin conversaciones</p>
            </div>
          ) : (
            conversations
              .filter((c) =>
                c.patient_name.toLowerCase().includes(searchTerm.toLowerCase())
              )
              .map((conv) => (
                <button
                  key={conv.patient_id}
                  onClick={() => handleSelectConversation(conv.patient_id)}
                  className={`w-full text-left p-4 border-b border-slate-100 hover:bg-slate-50 transition-colors ${
                    selectedPatientId === conv.patient_id ? 'bg-slate-50' : ''
                  }`}
                >
                  <p className="font-semibold text-slate-900 text-sm">{conv.patient_name}</p>
                  <p className="text-xs text-slate-500 truncate mt-1">{conv.last_message}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {new Date(conv.last_message_time).toLocaleDateString('es-VE')}
                  </p>
                </button>
              ))
          )}
        </div>
      </div>

      {/* Chat */}
      <div className="flex-1 flex flex-col">
        {selectedPatientId && patient ? (
          <>
            {/* Header */}
            <div className="p-6 border-b border-slate-200 bg-white rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-900">{patient.full_name}</p>
                  <p className="text-sm text-slate-500">
                    {patient.cedula} · {patient.phone}
                  </p>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <p className="text-slate-500 text-sm">Inicia una conversación</p>
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${
                      msg.direction === 'doctor_to_patient' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    <div
                      className={`max-w-xs px-4 py-2 rounded-xl text-sm ${
                        msg.direction === 'doctor_to_patient'
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
            <form
              onSubmit={handleSendMessage}
              className="p-6 border-t border-slate-200 bg-white rounded-b-2xl flex gap-2"
            >
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Escribe tu respuesta..."
                className="flex-1 px-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
              />
              <button
                type="submit"
                disabled={sendingMessage || !newMessage.trim()}
                className="px-4 py-2 rounded-lg bg-teal-500 text-white font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {sendingMessage ? '...' : 'Enviar'}
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-medium">Selecciona una conversación</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
