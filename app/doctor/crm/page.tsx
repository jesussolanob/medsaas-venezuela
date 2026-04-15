'use client'

import { useState, useEffect } from 'react'
import { MessageCircle, Phone, Clock, User, Plus, Zap, BarChart2, TrendingUp, X, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type LeadChannel = 'whatsapp' | 'instagram' | 'referral' | 'web'
type Lead = {
  id: string
  name: string
  phone: string
  channel: LeadChannel
  stage: 'cold' | 'hot' | 'customer'
  patient_id?: string
  message: string
  created_at: string
}

const STAGE_MAP = {
  cold: { label: 'Cold Leads', color: 'bg-blue-100 text-blue-700' },
  hot: { label: 'Hot Leads', color: 'bg-amber-100 text-amber-700' },
  customer: { label: 'Clientes', color: 'bg-emerald-100 text-emerald-700' },
}

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  whatsapp: <MessageCircle className="w-4 h-4 text-emerald-500" />,
  instagram: <span className="text-pink-500 text-sm font-bold">IG</span>,
  referral: <User className="w-4 h-4 text-blue-500" />,
  web: <BarChart2 className="w-4 h-4 text-violet-500" />,
}

export default function CRMPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [newLead, setNewLead] = useState<{ name: string; phone: string; channel: LeadChannel; message: string }>({ name: '', phone: '', channel: 'whatsapp', message: '' })
  const [draggedLead, setDraggedLead] = useState<Lead | null>(null)
  const [doctorId, setDoctorId] = useState<string | null>(null)

  // Load leads on mount
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      setDoctorId(user.id)

      // Fetch leads
      const { data: leadsData } = await supabase
        .from('leads')
        .select('*')
        .eq('doctor_id', user.id)

      // Fetch consultations to check for customers
      const { data: consultations } = await supabase
        .from('consultations')
        .select('patient_id')
        .eq('doctor_id', user.id)

      const customerPatientIds = new Set((consultations ?? []).map(c => c.patient_id))

      // Auto-classify leads: if a lead's patient has consultation → auto-move to customer
      const processedLeads = (leadsData ?? []).map((l: any) => ({
        ...l,
        stage: (l.patient_id && customerPatientIds.has(l.patient_id)) ? 'customer' : (l.stage ?? 'cold'),
      }))

      setLeads(processedLeads as Lead[])
      setLoading(false)
    })
  }, [])

  const coldLeads = leads.filter(l => l.stage === 'cold')
  const hotLeads = leads.filter(l => l.stage === 'hot')
  const customers = leads.filter(l => l.stage === 'customer')

  async function updateLeadStage(leadId: string, newStage: Lead['stage']) {
    if (!doctorId) return
    const supabase = createClient()
    await supabase.from('leads').update({ stage: newStage }).eq('id', leadId)
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, stage: newStage } : l))
  }

  async function addLead(e: React.FormEvent) {
    e.preventDefault()
    if (!newLead.name || !newLead.phone || !doctorId) return
    const supabase = createClient()
    const { data } = await supabase.from('leads').insert({
      doctor_id: doctorId,
      name: newLead.name,
      phone: newLead.phone,
      channel: newLead.channel,
      stage: 'cold',
      message: newLead.message,
    }).select().single()

    if (data) setLeads(prev => [data as Lead, ...prev])
    setNewLead({ name: '', phone: '', channel: 'whatsapp', message: '' })
    setShowNew(false)
  }

  async function deleteLead(leadId: string) {
    if (!doctorId) return
    const supabase = createClient()
    await supabase.from('leads').delete().eq('id', leadId)
    setLeads(prev => prev.filter(l => l.id !== leadId))
  }

  function contactViaWA(lead: Lead) {
    const msg = encodeURIComponent(`Hola ${lead.name}, te contactamos de la consulta del doctor. ¿Cuándo tienes disponibilidad para agendar tu cita?`)
    window.open(`https://wa.me/${lead.phone.replace(/\D/g, '')}?text=${msg}`, '_blank')
  }

  // Drag handlers
  function handleDragStart(lead: Lead) {
    setDraggedLead(lead)
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
  }

  function handleDrop(e: React.DragEvent, stage: Lead['stage']) {
    e.preventDefault()
    if (!draggedLead) return
    updateLeadStage(draggedLead.id, stage)
    setDraggedLead(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-slate-400">Cargando leads...</p>
      </div>
    )
  }

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');* { font-family: 'Inter', sans-serif; }.g-bg{background:linear-gradient(135deg,#00C4CC 0%,#0891b2 100%)}`}</style>

      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">CRM Leads — Kanban</h1>
            <p className="text-sm text-slate-500">Arrastra leads entre columnas para cambiar su etapa. Automático a "Clientes" cuando hay consulta.</p>
          </div>
          <button onClick={() => setShowNew(true)} className="g-bg flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white hover:opacity-90">
            <Plus className="w-4 h-4" /> Lead manual
          </button>
        </div>

        {/* Kanban board */}
        <div className="grid grid-cols-3 gap-5">
          {(['cold', 'hot', 'customer'] as const).map(stage => (
            <div
              key={stage}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, stage)}
              className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl p-4 min-h-[600px] transition-all hover:border-slate-300"
            >
              {/* Column header */}
              <div className="mb-4 pb-4 border-b border-slate-200">
                <p className="text-sm font-bold text-slate-700 uppercase tracking-widest">{STAGE_MAP[stage].label}</p>
                <p className="text-xs text-slate-400 mt-1">{stage === 'cold' ? coldLeads.length : stage === 'hot' ? hotLeads.length : customers.length} leads</p>
              </div>

              {/* Cards */}
              <div className="space-y-3">
                {(stage === 'cold' ? coldLeads : stage === 'hot' ? hotLeads : customers).map(lead => (
                  <div
                    key={lead.id}
                    draggable
                    onDragStart={() => handleDragStart(lead)}
                    className="bg-white border border-slate-200 rounded-lg p-3 cursor-move hover:shadow-md hover:border-slate-300 transition-all group"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{lead.name}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{lead.phone}</p>
                      </div>
                      <button
                        onClick={() => deleteLead(lead.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-50 rounded"
                      >
                        <X className="w-3 h-3 text-red-400" />
                      </button>
                    </div>

                    {/* Channel badge */}
                    <div className="flex items-center gap-1.5 mb-2">
                      {CHANNEL_ICONS[lead.channel]}
                      <span className="text-[10px] text-slate-500 capitalize">{lead.channel}</span>
                    </div>

                    {/* Message preview */}
                    {lead.message && <p className="text-[11px] text-slate-500 line-clamp-2 italic mb-2">&quot;{lead.message}&quot;</p>}

                    {/* Action button */}
                    <button
                      onClick={() => contactViaWA(lead)}
                      className="w-full flex items-center justify-center gap-1 px-2 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded text-[10px] font-bold transition-colors"
                    >
                      <MessageCircle className="w-3 h-3" /> WhatsApp
                    </button>
                  </div>
                ))}

                {(stage === 'cold' ? coldLeads : stage === 'hot' ? hotLeads : customers).length === 0 && (
                  <div className="flex items-center justify-center py-8 text-slate-300">
                    <p className="text-xs">Sin leads</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* New lead modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-900">Lead manual</h3>
              <button onClick={() => setShowNew(false)} className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center"><X className="w-4 h-4 text-slate-500" /></button>
            </div>
            <form onSubmit={addLead} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Nombre</label>
                <input value={newLead.name} onChange={e => setNewLead(p => ({ ...p, name: e.target.value }))} placeholder="Pedro Ramírez" className={fi} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Teléfono</label>
                <input type="tel" value={newLead.phone} onChange={e => setNewLead(p => ({ ...p, phone: e.target.value }))} placeholder="+58 412 000 0000" className={fi} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Canal</label>
                <select value={newLead.channel} onChange={e => setNewLead(p => ({ ...p, channel: e.target.value as Lead['channel'] }))} className={fi}>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="instagram">Instagram</option>
                  <option value="referral">Referido</option>
                  <option value="web">Web</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Mensaje inicial</label>
                <textarea value={newLead.message} onChange={e => setNewLead(p => ({ ...p, message: e.target.value }))} rows={2} placeholder="Motivo de contacto..." className={fi + ' resize-none'} />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowNew(false)} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600">Cancelar</button>
                <button type="submit" className="flex-1 g-bg py-2.5 rounded-xl text-sm font-bold text-white">Agregar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

const fi = 'w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 bg-white transition-colors'
