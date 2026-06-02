'use client'

import { useState, useEffect } from 'react'
import { MessageSquarePlus, Clock, CheckCircle2, Send, Loader2, MessageCircle } from 'lucide-react'

type Suggestion = {
  id: string
  doctor_id: string
  subject: string
  message: string
  category: string
  status: string
  admin_response?: string
  created_at: string
  updated_at: string
  profiles?: { full_name: string; email: string; specialty: string }
}

const CATEGORIES: Record<string, { label: string; color: string }> = {
  feature: { label: 'Nueva funcionalidad', color: 'bg-violet-50 text-violet-600' },
  bug: { label: 'Problema', color: 'bg-red-50 text-red-600' },
  improvement: { label: 'Mejora', color: 'bg-amber-50 text-amber-600' },
  general: { label: 'General', color: 'bg-slate-100 text-slate-500' },
}

const STATUSES: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pendiente', color: 'bg-slate-100 text-slate-500' },
  in_progress: { label: 'En progreso', color: 'bg-blue-50 text-blue-600' },
  resolved: { label: 'Resuelto', color: 'bg-emerald-50 text-emerald-600' },
}

export default function AdminSuggestionsPage() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [responding, setResponding] = useState<string | null>(null)
  const [responseText, setResponseText] = useState('')
  const [saving, setSaving] = useState(false)

  const load = async () => {
    try {
      const res = await fetch('/api/suggestions')
      if (res.ok) setSuggestions(await res.json())
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const updateStatus = async (id: string, status: string, admin_response?: string) => {
    setSaving(true)
    try {
      await fetch('/api/suggestions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status, admin_response }),
      })
      load()
      setResponding(null)
      setResponseText('')
    } catch {}
    setSaving(false)
  }

  return (
    <div className="space-y-6">
      {/* Gradient header */}
      <div className="relative rounded-xl overflow-hidden p-5 sm:p-6 text-white" style={{ background: 'linear-gradient(135deg, #00C4CC 0%, #0891b2 50%, #0e7490 100%)' }}>
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        <div className="relative z-10 flex items-center gap-3">
          <MessageCircle className="w-6 h-6" />
          <div>
            <h2 className="text-lg sm:text-xl font-semibold">Sugerencias de Doctores</h2>
            <p className="text-white/80 text-xs sm:text-sm mt-0.5">
              {suggestions.length} recibidas · {suggestions.filter(s => s.status === 'pending').length} pendientes
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {Object.entries(STATUSES).map(([key, config]) => (
          <div key={key} className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-sm transition-all duration-200">
            <p className="text-2xl font-bold text-slate-900">{suggestions.filter(s => s.status === key).length}</p>
            <p className="text-xs text-slate-400 mt-1">{config.label}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Loader2 className="w-6 h-6 animate-spin text-teal-500 mx-auto" />
        </div>
      ) : suggestions.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <MessageCircle className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">No hay sugerencias todavía</p>
        </div>
      ) : (
        <div className="space-y-3">
          {suggestions.map(s => {
            const cat = CATEGORIES[s.category] || CATEGORIES.general
            const st = STATUSES[s.status] || STATUSES.pending

            return (
              <div key={s.id} className={`bg-white rounded-xl border border-slate-200 p-5 space-y-3 hover:shadow-sm transition-all duration-200 border-l-4 ${
                s.category === 'feature' ? 'border-l-violet-400' :
                s.category === 'bug' ? 'border-l-red-400' :
                s.category === 'improvement' ? 'border-l-amber-400' : 'border-l-slate-300'
              }`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${cat.color}`}>{cat.label}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${st.color}`}>
                        {s.status === 'resolved' ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                        {st.label}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-slate-900">{s.subject}</p>
                    <p className="text-xs text-slate-500 mt-1">{s.message}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-medium text-slate-700">{s.profiles?.full_name}</p>
                    <p className="text-[10px] text-slate-400">{s.profiles?.specialty}</p>
                    <p className="text-[10px] text-slate-400 mt-1">
                      {new Date(s.created_at).toLocaleDateString('es-VE')}
                    </p>
                  </div>
                </div>

                {s.admin_response && (
                  <div className="bg-teal-50 border border-teal-200 rounded-lg p-3">
                    <p className="text-[10px] font-bold text-teal-700 uppercase tracking-wider mb-1">Tu respuesta</p>
                    <p className="text-xs text-teal-800">{s.admin_response}</p>
                  </div>
                )}

                {responding === s.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={responseText}
                      onChange={e => setResponseText(e.target.value)}
                      rows={3}
                      placeholder="Escribe tu respuesta al doctor..."
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm resize-none focus:border-teal-400 outline-none"
                    />
                    <div className="flex gap-2">
                      <button onClick={() => { setResponding(null); setResponseText('') }} className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 rounded-lg">
                        Cancelar
                      </button>
                      <button
                        onClick={() => updateStatus(s.id, 'resolved', responseText)}
                        disabled={saving || !responseText.trim()}
                        className="flex items-center gap-1 px-4 py-2 text-xs font-semibold text-white rounded-lg disabled:opacity-50 hover:shadow-md transition-all duration-200"
                        style={{ background: 'linear-gradient(135deg, #00C4CC 0%, #0891b2 100%)' }}
                      >
                        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                        Responder y resolver
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    {s.status !== 'resolved' && (
                      <>
                        <button
                          onClick={() => { setResponding(s.id); setResponseText(s.admin_response || '') }}
                          className="text-xs font-medium text-teal-600 hover:text-teal-700"
                        >
                          Responder
                        </button>
                        <span className="text-slate-200">|</span>
                        <button
                          onClick={() => updateStatus(s.id, 'in_progress')}
                          className="text-xs font-medium text-blue-600 hover:text-blue-700"
                        >
                          En progreso
                        </button>
                        <span className="text-slate-200">|</span>
                        <button
                          onClick={() => updateStatus(s.id, 'resolved')}
                          className="text-xs font-medium text-emerald-600 hover:text-emerald-700"
                        >
                          Marcar resuelto
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
