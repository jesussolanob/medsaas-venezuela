'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { MessageCircle, Send } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Message {
  id: string
  body: string
  direction: string
  created_at: string
}

export default function MessagesPage() {
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [patientId, setPatientId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const loadMessages = async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          router.push('/patient/login')
          return
        }

        // Get first patient ID
        const { data: patients } = await supabase
          .from('patients')
          .select('id')
          .eq('auth_user_id', user.id)
          .limit(1)

        if (!patients || patients.length === 0) {
          setLoading(false)
          return
        }

        const pid = patients[0].id
        setPatientId(pid)

        // Load messages
        const { data: msgData } = await supabase
          .from('patient_messages')
          .select('*')
          .eq('patient_id', pid)
          .order('created_at', { ascending: true })

        if (msgData) setMessages(msgData)

        setLoading(false)
      } catch (err) {
        console.error('Error loading messages:', err)
        setLoading(false)
      }
    }

    loadMessages()
  }, [router])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim() || !patientId) return

    setSending(true)
    try {
      const supabase = createClient()
      const { data: msg, error } = await supabase
        .from('patient_messages')
        .insert({
          patient_id: patientId,
          body: newMessage.trim(),
          direction: 'patient_to_doctor',
        })
        .select()
        .single()

      if (!error && msg) {
        setMessages(prev => [...prev, msg])
        setNewMessage('')
      }
    } catch (err) {
      console.error('Error sending message:', err)
    }
    setSending(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-teal-500 flex items-center justify-center mx-auto animate-pulse" />
          <p className="text-slate-500 font-medium">Cargando mensajes...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Mensajes</h1>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col h-96">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <MessageCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">Sin mensajes aún</p>
                <p className="text-sm text-slate-400 mt-1">Inicia una conversación con tu doctor</p>
              </div>
            </div>
          ) : (
            <>
              {messages.map(msg => (
                <div
                  key={msg.id}
                  className={`flex ${msg.direction === 'patient_to_doctor' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-xs px-3 sm:px-4 py-3 rounded-2xl text-xs sm:text-sm break-words ${
                      msg.direction === 'patient_to_doctor'
                        ? 'bg-teal-500 text-white rounded-br-sm'
                        : 'bg-slate-100 text-slate-900 rounded-bl-sm'
                    }`}
                  >
                    <p className="break-words">{msg.body}</p>
                    <p className={`text-xs mt-1 ${
                      msg.direction === 'patient_to_doctor'
                        ? 'text-teal-100'
                        : 'text-slate-500'
                    }`}>
                      {new Date(msg.created_at).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input */}
        <form onSubmit={handleSendMessage} className="px-3 sm:px-6 py-3 sm:py-4 border-t border-slate-200 bg-slate-50 flex gap-2 sm:gap-3">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Tu mensaje..."
            disabled={sending}
            className="flex-1 px-3 sm:px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={sending || !newMessage.trim()}
            className="px-3 sm:px-4 py-2 rounded-xl bg-teal-500 text-white font-medium hover:bg-teal-600 disabled:opacity-50 transition-colors flex items-center gap-2 shrink-0"
          >
            <Send className="w-4 h-4" />
            <span className="hidden sm:inline">Enviar</span>
          </button>
        </form>
      </div>
    </div>
  )
}
