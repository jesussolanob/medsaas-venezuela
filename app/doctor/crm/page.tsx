'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  MessageCircle,
  Phone,
  Clock,
  User,
  Plus,
  X,
  Send,
  ChevronRight,
  MessageSquare,
  Camera as Instagram,
  ThumbsUp as Facebook,
  Globe,
  Users,
} from 'lucide-react'
// L6 (2026-04-29): normaliza telefonos para wa.me / tel:
import { normalizePhoneVE } from '@/lib/phone-utils'

type LeadStage = 'new' | 'contacted' | 'qualified' | 'appointment' | 'converted' | 'lost'
type LeadChannel = 'whatsapp' | 'instagram' | 'facebook' | 'web' | 'llamada' | 'referido'

interface Lead {
  id: string
  doctor_id: string
  name: string
  phone: string
  channel: LeadChannel
  stage: LeadStage
  message: string
  created_at: string
  last_activity?: string
}

interface Message {
  id: string
  lead_id: string
  doctor_id: string
  sender: 'doctor' | 'lead'
  content: string
  created_at: string
}

const STAGES: LeadStage[] = ['new', 'contacted', 'qualified', 'appointment', 'converted', 'lost']

const STAGE_LABELS: Record<LeadStage, string> = {
  new: 'Nuevo',
  contacted: 'Contactado',
  qualified: 'Calificado',
  appointment: 'Cita Agendada',
  converted: 'Convertido',
  lost: 'Perdido',
}

const CHANNEL_ICONS: Record<LeadChannel, React.ReactNode> = {
  whatsapp: <MessageCircle className="w-4 h-4 text-emerald-500" />,
  instagram: <Instagram className="w-4 h-4 text-pink-500" />,
  facebook: <Facebook className="w-4 h-4 text-blue-600" />,
  web: <Globe className="w-4 h-4 text-violet-500" />,
  llamada: <Phone className="w-4 h-4 text-orange-500" />,
  referido: <Users className="w-4 h-4 text-indigo-500" />,
}

const CHANNEL_LABELS: Record<LeadChannel, string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  facebook: 'Facebook',
  web: 'Web',
  llamada: 'Llamada',
  referido: 'Referido',
}

const SEED_LEADS = [
  { name: 'María Fernández', phone: '+58 412 123 4567', channel: 'whatsapp' as LeadChannel, stage: 'new' as LeadStage, message: 'Hola, quisiera agendar consulta' },
  { name: 'Carlos Torres', phone: '+58 414 234 5678', channel: 'instagram' as LeadChannel, stage: 'contacted' as LeadStage, message: 'Vi tu perfil, precios?' },
  { name: 'Ana Morales', phone: '+58 424 345 6789', channel: 'facebook' as LeadChannel, stage: 'qualified' as LeadStage, message: 'Puedo ir mañana?' },
  { name: 'Pedro Silva', phone: '+58 416 456 7890', channel: 'web' as LeadChannel, stage: 'appointment' as LeadStage, message: 'Formulario enviado desde web' },
  { name: 'Sofía Ramos', phone: '+58 412 567 8901', channel: 'whatsapp' as LeadChannel, stage: 'new' as LeadStage, message: 'Primera consulta disponible?' },
  { name: 'Diego Castro', phone: '+58 414 678 9012', channel: 'referido' as LeadChannel, stage: 'contacted' as LeadStage, message: 'Me recomendó Juan' },
  { name: 'Luisa Medina', phone: '+58 424 789 0123', channel: 'llamada' as LeadChannel, stage: 'qualified' as LeadStage, message: 'Llamó pidiendo info' },
  { name: 'Roberto Díaz', phone: '+58 416 890 1234', channel: 'whatsapp' as LeadChannel, stage: 'converted' as LeadStage, message: 'Ya agendé, gracias!' },
]

export default function CRMPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [messages, setMessages] = useState<Record<string, Message[]>>({})
  const [loading, setLoading] = useState(true)
  const [doctorId, setDoctorId] = useState<string | null>(null)
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [showNewLeadModal, setShowNewLeadModal] = useState(false)
  const [newLeadData, setNewLeadData] = useState({ name: '', phone: '', channel: 'whatsapp' as LeadChannel, message: '' })
  const [messageInput, setMessageInput] = useState('')
  const [filterSearch, setFilterSearch] = useState('')
  const [filterChannel, setFilterChannel] = useState<LeadChannel | 'all'>('all')
  const [draggedLead, setDraggedLead] = useState<Lead | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      setDoctorId(user.id)

      try {
        const { data: leadsData } = await supabase
          .from('leads')
          .select('*')
          .eq('doctor_id', user.id)

        if (leadsData && leadsData.length > 0) {
          setLeads(leadsData as Lead[])
        } else {
          // Seed leads
          const { data: inserted } = await supabase
            .from('leads')
            .insert(
              SEED_LEADS.map(lead => ({
                doctor_id: user.id,
                ...lead,
              }))
            )
            .select()

          if (inserted) {
            setLeads(inserted as Lead[])
          }
        }

        try {
          const { data: messagesData } = await supabase
            .from('lead_messages')
            .select('*')
            .eq('doctor_id', user.id)

          if (messagesData) {
            const grouped = messagesData.reduce((acc: Record<string, Message[]>, msg: Message) => {
              if (!acc[msg.lead_id]) acc[msg.lead_id] = []
              acc[msg.lead_id].push(msg)
              return acc
            }, {})
            setMessages(grouped)
          }
        } catch (e) {
          // lead_messages table doesn't exist, use local state only
        }
      } catch (e) {
        console.error('Error loading leads:', e)
      }

      setLoading(false)
    })
  }, [])

  const getInitial = (name: string) => name.charAt(0).toUpperCase()

  const getTimeAgo = (date: string) => {
    const now = new Date()
    const past = new Date(date)
    const diffMs = now.getTime() - past.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 1) return 'Ahora'
    if (diffMins < 60) return `hace ${diffMins}m`
    if (diffHours < 24) return `hace ${diffHours}h`
    if (diffDays < 7) return `hace ${diffDays}d`
    return past.toLocaleDateString('es-VE')
  }

  const filteredLeads = leads.filter(lead => {
    const matchSearch =
      lead.name.toLowerCase().includes(filterSearch.toLowerCase()) ||
      lead.phone.includes(filterSearch)
    const matchChannel = filterChannel === 'all' || lead.channel === filterChannel
    return matchSearch && matchChannel
  })

  const leadsByStage: Record<LeadStage, Lead[]> = {
    new: filteredLeads.filter(l => l.stage === 'new'),
    contacted: filteredLeads.filter(l => l.stage === 'contacted'),
    qualified: filteredLeads.filter(l => l.stage === 'qualified'),
    appointment: filteredLeads.filter(l => l.stage === 'appointment'),
    converted: filteredLeads.filter(l => l.stage === 'converted'),
    lost: filteredLeads.filter(l => l.stage === 'lost'),
  }

  const handleDragStart = (lead: Lead) => {
    setDraggedLead(lead)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDropOnStage = async (stage: LeadStage) => {
    if (!draggedLead || !doctorId) return
    const supabase = createClient()
    try {
      await supabase
        .from('leads')
        .update({ stage })
        .eq('id', draggedLead.id)
      setLeads(prev => prev.map(l => (l.id === draggedLead.id ? { ...l, stage } : l)))
    } catch (e) {
      console.error('Error updating lead stage:', e)
    }
    setDraggedLead(null)
  }

  const handleAddLead = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newLeadData.name || !newLeadData.phone || !doctorId) return

    const supabase = createClient()
    try {
      const { data } = await supabase
        .from('leads')
        .insert({
          doctor_id: doctorId,
          name: newLeadData.name,
          phone: newLeadData.phone,
          channel: newLeadData.channel,
          stage: 'new',
          message: newLeadData.message,
        })
        .select()
        .single()

      if (data) {
        setLeads(prev => [data, ...prev])
      }
    } catch (e) {
      console.error('Error creating lead:', e)
    }

    setNewLeadData({ name: '', phone: '', channel: 'whatsapp', message: '' })
    setShowNewLeadModal(false)
  }

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !selectedLead || !doctorId) return

    const supabase = createClient()
    const newMsg: Message = {
      id: Math.random().toString(36),
      lead_id: selectedLead.id,
      doctor_id: doctorId,
      sender: 'doctor',
      content: messageInput,
      created_at: new Date().toISOString(),
    }

    setMessages(prev => ({
      ...prev,
      [selectedLead.id]: [...(prev[selectedLead.id] || []), newMsg],
    }))
    setMessageInput('')

    try {
      await supabase.from('lead_messages').insert(newMsg)
    } catch (e) {
      // Table doesn't exist, messages stay in local state
    }

    // Update last_activity
    setLeads(prev =>
      prev.map(l =>
        l.id === selectedLead.id
          ? { ...l, last_activity: new Date().toISOString() }
          : l
      )
    )
  }

  const handleContactViaChannel = (lead: Lead, message: string) => {
    const encodedMsg = encodeURIComponent(message)
    // L6 (2026-04-29): normaliza VE → 58XXXXXXXXXX para wa.me; fallback a digitos crudos para tel:
    const phone = normalizePhoneVE(lead.phone) || lead.phone.replace(/\D/g, '')

    switch (lead.channel) {
      case 'whatsapp':
        window.open(`https://wa.me/${phone}?text=${encodedMsg}`, '_blank')
        break
      case 'instagram':
        window.open(`https://ig.me/m/${lead.name.replace(/\s/g, '')}`, '_blank')
        break
      case 'facebook':
        window.open(`https://m.me/${lead.name.replace(/\s/g, '')}`, '_blank')
        break
      case 'web':
        handleSendMessage()
        break
      case 'llamada':
        window.open(`tel:${phone}`, '_blank')
        break
      case 'referido':
        window.open(`sms:${phone}?body=${encodedMsg}`, '_blank')
        break
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-slate-500">Cargando CRM...</p>
      </div>
    )
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        * { font-family: 'Inter', sans-serif; }
        .g-bg { background: linear-gradient(135deg, #00C4CC 0%, #0891b2 100%); }
        .input-field { @apply w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 bg-white transition-colors; }
        .kanban-column { @apply min-h-96 scroll-smooth; }
      `}</style>

      <div className="flex flex-col h-screen bg-slate-50">
        {/* Header */}
        <div className="border-b border-slate-200 bg-white p-4">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 mb-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">CRM Leads</h1>
              <p className="text-sm text-slate-500">Gestiona tus leads con Kanban — arrastra para cambiar etapa</p>
            </div>
            <button
              onClick={() => setShowNewLeadModal(true)}
              className="g-bg flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" /> Nuevo Lead
            </button>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              placeholder="Buscar por nombre o teléfono..."
              value={filterSearch}
              onChange={e => setFilterSearch(e.target.value)}
              className="input-field flex-1"
            />
            <div className="flex gap-2 overflow-x-auto pb-2">
              <button
                onClick={() => setFilterChannel('all')}
                className={`px-3 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                  filterChannel === 'all'
                    ? 'g-bg text-white'
                    : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
              >
                Todos
              </button>
              {(Object.keys(CHANNEL_LABELS) as LeadChannel[]).map(channel => (
                <button
                  key={channel}
                  onClick={() => setFilterChannel(channel)}
                  className={`px-3 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-1 ${
                    filterChannel === channel
                      ? 'g-bg text-white'
                      : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {CHANNEL_ICONS[channel]}
                  {CHANNEL_LABELS[channel]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Kanban Board */}
        <div className="flex-1 overflow-x-auto p-4">
          <div className="flex gap-4 min-w-max lg:min-w-full">
            {STAGES.map(stage => (
              <div
                key={stage}
                onDragOver={handleDragOver}
                onDrop={() => handleDropOnStage(stage)}
                className="flex flex-col w-full lg:flex-1 bg-slate-100 border-2 border-dashed border-slate-300 rounded-xl p-3"
              >
                {/* Column Header */}
                <div className="mb-3 pb-3 border-b border-slate-200">
                  <h3 className="font-bold text-slate-700 text-sm">{STAGE_LABELS[stage]}</h3>
                  <p className="text-xs text-slate-500 mt-1">{leadsByStage[stage].length} leads</p>
                </div>

                {/* Lead Cards */}
                <div className="flex-1 space-y-2 kanban-column overflow-y-auto">
                  {leadsByStage[stage].map(lead => (
                    <div
                      key={lead.id}
                      draggable
                      onDragStart={() => handleDragStart(lead)}
                      onClick={() => setSelectedLead(lead)}
                      className="bg-white border border-slate-200 rounded-lg p-3 cursor-move hover:shadow-md hover:border-slate-300 transition-all"
                    >
                      <div className="flex gap-3 mb-2">
                        <div className="w-8 h-8 rounded-full g-bg flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                          {getInitial(lead.name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">{lead.name}</p>
                          <p className="text-xs text-slate-400 truncate">{lead.phone}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 mb-2">
                        {CHANNEL_ICONS[lead.channel]}
                        <span className="text-xs text-slate-500">{CHANNEL_LABELS[lead.channel]}</span>
                      </div>

                      {lead.message && <p className="text-xs text-slate-500 line-clamp-2 italic mb-2">"{lead.message}"</p>}

                      <div className="flex items-center gap-1 text-[10px] text-slate-400">
                        <Clock className="w-3 h-3" />
                        {getTimeAgo(lead.last_activity || lead.created_at)}
                      </div>
                    </div>
                  ))}

                  {leadsByStage[stage].length === 0 && (
                    <div className="flex items-center justify-center h-32 text-slate-300 text-xs">
                      Sin leads
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* New Lead Modal */}
      {showNewLeadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-96 overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white">
              <h3 className="font-bold text-slate-900">Nuevo Lead</h3>
              <button
                onClick={() => setShowNewLeadModal(false)}
                className="p-1 hover:bg-slate-100 rounded-lg"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <form onSubmit={handleAddLead} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Nombre</label>
                <input
                  type="text"
                  value={newLeadData.name}
                  onChange={e => setNewLeadData(p => ({ ...p, name: e.target.value }))}
                  placeholder="María Pérez"
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Teléfono</label>
                <input
                  type="tel"
                  value={newLeadData.phone}
                  onChange={e => setNewLeadData(p => ({ ...p, phone: e.target.value }))}
                  placeholder="+58 412 000 0000"
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Canal</label>
                <select
                  value={newLeadData.channel}
                  onChange={e => setNewLeadData(p => ({ ...p, channel: e.target.value as LeadChannel }))}
                  className="input-field"
                >
                  {(Object.entries(CHANNEL_LABELS) as [LeadChannel, string][]).map(([ch, label]) => (
                    <option key={ch} value={ch}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Mensaje inicial</label>
                <textarea
                  value={newLeadData.message}
                  onChange={e => setNewLeadData(p => ({ ...p, message: e.target.value }))}
                  placeholder="Motivo del contacto..."
                  rows={2}
                  className="input-field resize-none"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewLeadModal(false)}
                  className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 g-bg py-2.5 rounded-xl text-sm font-bold text-white hover:opacity-90 transition-opacity"
                >
                  Crear
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Chat Drawer */}
      {selectedLead && (
        <div className="fixed inset-0 z-40 lg:z-50">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm lg:hidden"
            onClick={() => setSelectedLead(null)}
          />

          {/* Drawer */}
          <div className="absolute right-0 top-0 bottom-0 w-full lg:w-96 bg-white shadow-2xl flex flex-col z-50">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full g-bg flex items-center justify-center text-white font-bold">
                  {getInitial(selectedLead.name)}
                </div>
                <div>
                  <p className="font-semibold text-slate-900">{selectedLead.name}</p>
                  <p className="text-xs text-slate-500 flex items-center gap-1">
                    {CHANNEL_ICONS[selectedLead.channel]}
                    {CHANNEL_LABELS[selectedLead.channel]}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedLead(null)}
                className="p-1 hover:bg-slate-100 rounded-lg"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            {/* Lead Info */}
            <div className="px-4 py-3 border-b border-slate-200 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">Teléfono</span>
                <span className="font-medium text-slate-900">{selectedLead.phone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Etapa</span>
                <span className="font-medium text-slate-900">{STAGE_LABELS[selectedLead.stage]}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Contacto</span>
                <span className="font-medium text-slate-900">{getTimeAgo(selectedLead.last_activity || selectedLead.created_at)}</span>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages[selectedLead.id]?.length > 0 ? (
                messages[selectedLead.id].map(msg => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.sender === 'doctor' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-xs px-4 py-2 rounded-lg text-sm ${
                        msg.sender === 'doctor'
                          ? 'g-bg text-white'
                          : 'bg-slate-100 text-slate-900'
                      }`}
                    >
                      {msg.content}
                      <p className={`text-xs mt-1 ${msg.sender === 'doctor' ? 'text-white/70' : 'text-slate-500'}`}>
                        {new Date(msg.created_at).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                  Sin mensajes aún
                </div>
              )}
            </div>

            {/* Message Input */}
            <div className="border-t border-slate-200 p-4 space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={messageInput}
                  onChange={e => setMessageInput(e.target.value)}
                  onKeyPress={e => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Escribe un mensaje..."
                  className="input-field flex-1"
                />
                <button
                  onClick={handleSendMessage}
                  className="g-bg text-white p-2.5 rounded-xl hover:opacity-90 transition-opacity"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
              <button
                onClick={() => handleContactViaChannel(selectedLead, messageInput || selectedLead.message)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-slate-300 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
                Responder por {CHANNEL_LABELS[selectedLead.channel]}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
