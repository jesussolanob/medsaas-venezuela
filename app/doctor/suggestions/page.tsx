'use client'

import { useState, useEffect } from 'react'
import { MessageSquarePlus, Send, Loader2, CheckCircle2, Clock, MessageCircle } from 'lucide-react'

type Suggestion = {
  id: string
  subject: string
  message: string
  category: string
  status: string
  admin_response?: string
  created_at: string
}

const CATEGORIES = [
  { value: 'feature', label: 'Nueva funcionalidad' },
  { value: 'bug', label: 'Reportar problema' },
  { value: 'improvement', label: 'Mejora existente' },
  { value: 'general', label: 'Comentario general' },
]

export default function SuggestionsPage() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [form, setForm] = useState({ subject: '', message: '', category: 'general' })

  const loadSuggestions = async () => {
    try {
      const res = await fetch('/api/suggestions')
      if (res.ok) {
        const data = await res.json()
        setSuggestions(data || [])
      }
    } catch {}
    setLoading(false)
  }

  useEffect(() => { loadSuggestions() }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.subject.trim() || !form.message.trim()) return
    setSending(true)

    try {
      const res = await fetch('/api/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        setForm({ subject: '', message: '', category: 'general' })
        setSent(true)
        setTimeout(() => setSent(false), 3000)
        loadSuggestions()
      }
    } catch {}
    setSending(false)
  }

  return (
    <div className="space-y-6">
      {/* Gradient Header Banner */}
      <div
        className="rounded-xl p-4 sm:p-6 text-white flex items-center gap-4 shadow-md"
        style={{ background: 'linear-gradient(135deg, #00C4CC 0%, #0891b2 100%)' }}
      >
        <div className="w-12 h-12 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
          <MessageSquarePlus className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-lg sm:text-xl font-semibold">Envía tus ideas y sugerencias</h2>
          <p className="text-sm text-white/80">para mejorar Delta Medical CRM</p>
        </div>
      </div>

      {/* New Suggestion Form */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6 shadow-sm hover:shadow-sm transition-all duration-200">
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Category Selector - Pill Style */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2.5 uppercase tracking-wider">Categoría</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(c => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, category: c.value }))}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                    form.category === c.value
                      ? c.value === 'bug'
                        ? 'bg-red-100 text-red-700 ring-2 ring-red-300'
                        : c.value === 'feature'
                        ? 'bg-violet-100 text-violet-700 ring-2 ring-violet-300'
                        : c.value === 'improvement'
                        ? 'bg-amber-100 text-amber-700 ring-2 ring-amber-300'
                        : 'bg-teal-100 text-teal-700 ring-2 ring-teal-300'
                      : c.value === 'bug'
                      ? 'bg-red-50 text-red-600 hover:bg-red-100'
                      : c.value === 'feature'
                      ? 'bg-violet-50 text-violet-600 hover:bg-violet-100'
                      : c.value === 'improvement'
                      ? 'bg-amber-50 text-amber-600 hover:bg-amber-100'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wider">Asunto</label>
            <input
              type="text"
              value={form.subject}
              onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
              placeholder="Resumen breve de tu sugerencia"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:border-teal-400 focus:ring-1 focus:ring-teal-400 outline-none transition-all"
            />
          </div>

          {/* Message */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wider">Mensaje</label>
            <textarea
              value={form.message}
              onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
              rows={4}
              placeholder="Describe tu sugerencia, problema o idea con el mayor detalle posible..."
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:border-teal-400 focus:ring-1 focus:ring-teal-400 outline-none transition-all resize-none"
            />
          </div>

          {/* Submit Section */}
          <div className="flex items-center justify-between pt-2">
            {sent && (
              <span className="flex items-center gap-2 text-sm font-medium text-emerald-600">
                <CheckCircle2 className="w-4 h-4" /> Enviado correctamente
              </span>
            )}
            <div className="ml-auto">
              <button
                type="submit"
                disabled={sending || !form.subject.trim() || !form.message.trim()}
                className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-white font-semibold text-sm transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-cyan-500/20 hover:shadow-xl hover:shadow-cyan-500/30"
                style={{ background: 'linear-gradient(135deg, #00C4CC 0%, #0891b2 100%)' }}
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Enviar sugerencia
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Previous Suggestions */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Mis sugerencias anteriores</h3>
        {loading ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm">
            <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Cargando...
          </div>
        ) : suggestions.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
            <MessageCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-400 text-sm">Aún no has enviado sugerencias</p>
          </div>
        ) : (
          suggestions.map(s => {
            const categoryColor =
              s.category === 'bug' ? 'border-l-red-500 bg-red-50/30' :
              s.category === 'feature' ? 'border-l-violet-500 bg-violet-50/30' :
              s.category === 'improvement' ? 'border-l-amber-500 bg-amber-50/30' :
              'border-l-slate-400 bg-slate-50/30'

            return (
              <div
                key={s.id}
                className={`bg-white rounded-xl border border-slate-200 border-l-4 p-5 space-y-3 shadow-sm hover:shadow-sm transition-all duration-200 ${categoryColor}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Category & Status Badges */}
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className={`text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider ${
                        s.category === 'bug' ? 'bg-red-100 text-red-700' :
                        s.category === 'feature' ? 'bg-violet-100 text-violet-700' :
                        s.category === 'improvement' ? 'bg-amber-100 text-amber-700' :
                        'bg-slate-200 text-slate-600'
                      }`}>
                        {CATEGORIES.find(c => c.value === s.category)?.label || s.category}
                      </span>
                      <span className={`text-[10px] font-bold px-3 py-1 rounded-full flex items-center gap-1 uppercase tracking-wider ${
                        s.status === 'resolved' ? 'bg-emerald-100 text-emerald-700' :
                        s.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                        'bg-slate-200 text-slate-600'
                      }`}>
                        {s.status === 'resolved' ? <><CheckCircle2 className="w-3 h-3" /> Resuelto</> :
                         s.status === 'in_progress' ? <><Clock className="w-3 h-3" /> En progreso</> :
                         <><Clock className="w-3 h-3" /> Pendiente</>}
                      </span>
                    </div>

                    {/* Subject & Message */}
                    <p className="text-sm font-semibold text-slate-900">{s.subject}</p>
                    <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">{s.message}</p>
                  </div>

                  {/* Date */}
                  <span className="text-[10px] text-slate-400 shrink-0 whitespace-nowrap">
                    {new Date(s.created_at).toLocaleDateString('es-VE')}
                  </span>
                </div>

                {/* Admin Response */}
                {s.admin_response && (
                  <div className="bg-teal-50 border-l-4 border-l-teal-500 rounded-lg p-4 mt-1">
                    <p className="text-[10px] font-bold text-teal-700 uppercase tracking-wider mb-1.5">Respuesta del equipo</p>
                    <p className="text-xs text-teal-800 leading-relaxed">{s.admin_response}</p>
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
