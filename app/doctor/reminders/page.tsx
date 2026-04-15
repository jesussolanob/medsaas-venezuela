'use client'

import { useState, useEffect } from 'react'
import { Bell, Calendar, MessageCircle, Mail, CheckCircle, Clock, AlertCircle, User, CheckSquare, Square, Send } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type Consultation = {
  id: string
  consultation_code: string
  consultation_date: string
  chief_complaint: string | null
  patient_id: string
  patient_name: string
  patient_phone: string | null
  patient_email: string | null
}

type ReminderSent = { id: string; channel: 'whatsapp' | 'email'; sentAt: string }

const DAYS_AHEAD = [0, 1, 3, 7]

export default function RemindersPage() {
  const [upcomingConsults, setUpcomingConsults] = useState<Consultation[]>([])
  const [loading, setLoading] = useState(true)
  const [remindersSent, setRemindersSent] = useState<Record<string, ReminderSent[]>>({})
  const [filterDays, setFilterDays] = useState<number>(7)
  const [sending, setSending] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkChannel, setBulkChannel] = useState<'whatsapp' | 'email'>('whatsapp')
  const [bulkSending, setBulkSending] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data } = await supabase
        .from('consultations')
        .select('*, patients(full_name, phone, email)')
        .eq('doctor_id', user.id)
        .gte('consultation_date', new Date().toISOString())
        .order('consultation_date', { ascending: true })
        .limit(50)

      const mapped = (data ?? []).map(c => ({
        id: c.id,
        consultation_code: c.consultation_code,
        consultation_date: c.consultation_date,
        chief_complaint: c.chief_complaint,
        patient_id: c.patient_id,
        patient_name: (c.patients as { full_name: string; phone: string | null; email: string | null } | null)?.full_name ?? 'Paciente',
        patient_phone: (c.patients as { full_name: string; phone: string | null; email: string | null } | null)?.phone ?? null,
        patient_email: (c.patients as { full_name: string; phone: string | null; email: string | null } | null)?.email ?? null,
      }))

      setUpcomingConsults(mapped)
      setLoading(false)
    })
  }, [])

  function daysUntil(dateStr: string): number {
    const diff = new Date(dateStr).getTime() - Date.now()
    return Math.ceil(diff / (1000 * 60 * 60 * 24))
  }

  function buildWAMessage(consult: Consultation) {
    const date = new Date(consult.consultation_date).toLocaleDateString('es-VE', { weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })
    return encodeURIComponent(`Hola ${consult.patient_name} 👋\n\nTe recordamos tu consulta médica:\n📅 Fecha: ${date}\n🔖 Código: ${consult.consultation_code}\n\nPor favor confirma tu asistencia. ¡Te esperamos!`)
  }

  function buildEmailSubject(consult: Consultation) {
    const date = new Date(consult.consultation_date).toLocaleDateString('es-VE', { weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })
    return { subject: encodeURIComponent(`Recordatorio de consulta - ${date}`), body: encodeURIComponent(`Estimado/a ${consult.patient_name},\n\nLe recordamos su próxima consulta médica:\nFecha: ${date}\nCódigo: ${consult.consultation_code}\n\nPor favor confirme su asistencia.\n\nSaludos,\nSu médico`) }
  }

  function sendWhatsApp(consult: Consultation) {
    if (!consult.patient_phone) return
    setSending(consult.id + '-wa')
    const phone = consult.patient_phone.replace(/\D/g, '')
    window.open(`https://wa.me/${phone}?text=${buildWAMessage(consult)}`, '_blank')
    markSent(consult.id, 'whatsapp')
    setTimeout(() => setSending(null), 1000)
  }

  function sendEmail(consult: Consultation) {
    if (!consult.patient_email) return
    setSending(consult.id + '-em')
    const { subject, body } = buildEmailSubject(consult)
    window.open(`mailto:${consult.patient_email}?subject=${subject}&body=${body}`, '_blank')
    markSent(consult.id, 'email')
    setTimeout(() => setSending(null), 1000)
  }

  function markSent(consultId: string, channel: 'whatsapp' | 'email') {
    const sent: ReminderSent = { id: Date.now().toString(), channel, sentAt: new Date().toISOString() }
    setRemindersSent(prev => ({ ...prev, [consultId]: [...(prev[consultId] ?? []), sent] }))
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map(c => c.id)))
    }
  }

  async function sendBulk() {
    if (selected.size === 0) return
    setBulkSending(true)
    const targets = filtered.filter(c => selected.has(c.id))
    for (const consult of targets) {
      if (bulkChannel === 'whatsapp' && consult.patient_phone) {
        const phone = consult.patient_phone.replace(/\D/g, '')
        window.open(`https://wa.me/${phone}?text=${buildWAMessage(consult)}`, '_blank')
        markSent(consult.id, 'whatsapp')
        await new Promise(r => setTimeout(r, 300))
      } else if (bulkChannel === 'email' && consult.patient_email) {
        const { subject, body } = buildEmailSubject(consult)
        window.open(`mailto:${consult.patient_email}?subject=${subject}&body=${body}`, '_blank')
        markSent(consult.id, 'email')
        await new Promise(r => setTimeout(r, 300))
      }
    }
    setSelected(new Set())
    setBulkSending(false)
  }

  const filtered = upcomingConsults.filter(c => daysUntil(c.consultation_date) <= filterDays && daysUntil(c.consultation_date) >= 0)

  function urgencyBadge(days: number) {
    if (days === 0) return { label: 'Hoy', cls: 'bg-red-100 text-red-600', icon: <AlertCircle className="w-3 h-3" /> }
    if (days === 1) return { label: 'Mañana', cls: 'bg-orange-100 text-orange-600', icon: <Bell className="w-3 h-3" /> }
    if (days <= 3) return { label: `En ${days} días`, cls: 'bg-amber-100 text-amber-600', icon: <Clock className="w-3 h-3" /> }
    return { label: `En ${days} días`, cls: 'bg-blue-100 text-blue-600', icon: <Calendar className="w-3 h-3" /> }
  }

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');* { font-family: 'Inter', sans-serif; }.g-bg{background:linear-gradient(135deg,#00C4CC 0%,#0891b2 100%)}`}</style>

      <div className="max-w-3xl space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Recordatorios</h1>
            <p className="text-sm text-slate-500">Notifica a tus pacientes sobre próximas consultas</p>
          </div>
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
            {DAYS_AHEAD.map(d => (
              <button key={d} onClick={() => setFilterDays(d)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${filterDays === d ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {d === 0 ? 'Hoy' : `${d}d`}
              </button>
            ))}
          </div>
        </div>

        {/* Info box */}
        <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 flex items-start gap-3">
          <Bell className="w-4 h-4 text-teal-500 shrink-0 mt-0.5" />
          <p className="text-sm text-teal-700">
            Envía recordatorios individuales o <strong>selecciona múltiples</strong> para envío masivo por WhatsApp o Email.
          </p>
        </div>

        {/* Consults list */}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400 text-sm">Cargando consultas...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <CheckCircle className="w-12 h-12 text-emerald-200 mb-3" />
            <p className="text-slate-600 font-semibold">Sin consultas próximas</p>
            <p className="text-slate-400 text-sm mt-1">No hay consultas en los próximos {filterDays} días.</p>
          </div>
        ) : (
          <>
            {/* Bulk action bar */}
            <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-3">
              <button onClick={toggleAll} className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-teal-600 transition-colors">
                {selected.size === filtered.length && filtered.length > 0
                  ? <CheckSquare className="w-4 h-4 text-teal-500" />
                  : <Square className="w-4 h-4 text-slate-400" />}
                {selected.size > 0 ? `${selected.size} seleccionado${selected.size > 1 ? 's' : ''}` : 'Seleccionar todos'}
              </button>
              {selected.size > 0 && (
                <>
                  <div className="flex items-center gap-1 ml-auto">
                    <button onClick={() => setBulkChannel('whatsapp')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${bulkChannel === 'whatsapp' ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600'}`}>
                      WhatsApp
                    </button>
                    <button onClick={() => setBulkChannel('email')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${bulkChannel === 'email' ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-600'}`}>
                      Email
                    </button>
                  </div>
                  <button onClick={sendBulk} disabled={bulkSending}
                    className="flex items-center gap-1.5 g-bg text-white px-4 py-1.5 rounded-lg text-xs font-bold disabled:opacity-60 transition-opacity">
                    <Send className="w-3.5 h-3.5" />
                    {bulkSending ? 'Enviando...' : `Enviar a ${selected.size}`}
                  </button>
                </>
              )}
            </div>

            <div className="space-y-3">
              {filtered.map(consult => {
                const days = daysUntil(consult.consultation_date)
                const badge = urgencyBadge(days)
                const sent = remindersSent[consult.id] ?? []
                const isSelected = selected.has(consult.id)
                return (
                  <div key={consult.id} className={`bg-white border rounded-xl p-5 transition-all ${isSelected ? 'border-teal-300 shadow-sm' : 'border-slate-200'}`}>
                    <div className="flex items-start gap-4">
                      {/* Checkbox */}
                      <button onClick={() => toggleSelect(consult.id)} className="mt-0.5 shrink-0">
                        {isSelected
                          ? <CheckSquare className="w-5 h-5 text-teal-500" />
                          : <Square className="w-5 h-5 text-slate-300 hover:text-slate-400" />}
                      </button>
                      <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center shrink-0">
                        <User className="w-5 h-5 text-teal-500" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-semibold text-slate-900 text-sm">{consult.patient_name}</p>
                          <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${badge.cls}`}>
                            {badge.icon}{badge.label}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500">
                          {new Date(consult.consultation_date).toLocaleDateString('es-VE', { weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })}
                        </p>
                        {consult.chief_complaint && <p className="text-xs text-slate-400 mt-1">{consult.chief_complaint}</p>}
                        <p className="text-xs font-mono text-slate-400 mt-0.5">{consult.consultation_code}</p>

                        {/* Sent history */}
                        {sent.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {sent.map(s => (
                              <span key={s.id} className="flex items-center gap-1 text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-semibold">
                                <CheckCircle className="w-2.5 h-2.5" />{s.channel === 'whatsapp' ? 'WhatsApp ✓' : 'Email ✓'}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-2">
                        <button
                          onClick={() => sendWhatsApp(consult)}
                          disabled={!consult.patient_phone || sending === consult.id + '-wa'}
                          title={!consult.patient_phone ? 'Sin teléfono registrado' : 'Enviar por WhatsApp'}
                          className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          WhatsApp
                        </button>
                        <button
                          onClick={() => sendEmail(consult)}
                          disabled={!consult.patient_email || sending === consult.id + '-em'}
                          title={!consult.patient_email ? 'Sin email registrado' : 'Enviar por email'}
                          className="flex items-center gap-1.5 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Mail className="w-3.5 h-3.5" />
                          Email
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </>
  )
}
