'use client'

import { useState, useEffect } from 'react'
import { Bell, Calendar, MessageCircle, Mail, CheckCircle, Clock, AlertCircle, User, CheckSquare, Square, Send, Info, X, Phone } from 'lucide-react'
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
  plan_name: string | null
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
  const [doctorName, setDoctorName] = useState('')
  const [doctorPhone, setDoctorPhone] = useState('')
  const [showWhatsAppInfo, setShowWhatsAppInfo] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return

      // Fetch doctor profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, professional_title, phone')
        .eq('id', user.id)
        .single()
      if (profile) {
        setDoctorName(`${profile.professional_title || ''} ${profile.full_name || ''}`.trim())
        setDoctorPhone(profile.phone || '')
      }

      // Fetch upcoming consultations
      const { data: consults } = await supabase
        .from('consultations')
        .select('*, patients(full_name, phone, email)')
        .eq('doctor_id', user.id)
        .gte('consultation_date', new Date().toISOString())
        .order('consultation_date', { ascending: true })
        .limit(50)

      const consultMapped = (consults ?? []).map(c => ({
        id: c.id,
        consultation_code: c.consultation_code ?? c.id.slice(0, 8),
        consultation_date: c.consultation_date,
        chief_complaint: c.chief_complaint,
        patient_id: c.patient_id,
        patient_name: (c.patients as { full_name: string; phone: string | null; email: string | null } | null)?.full_name ?? 'Paciente',
        patient_phone: (c.patients as { full_name: string; phone: string | null; email: string | null } | null)?.phone ?? null,
        patient_email: (c.patients as { full_name: string; phone: string | null; email: string | null } | null)?.email ?? null,
        plan_name: c.plan_name || null,
      }))

      // Fetch upcoming appointments (scheduled/confirmed)
      const { data: appointments } = await supabase
        .from('appointments')
        .select('id, appointment_code, scheduled_at, chief_complaint, patient_name, patient_phone, patient_email, patient_id, plan_name')
        .eq('doctor_id', user.id)
        .in('status', ['scheduled', 'confirmed'])
        .gte('scheduled_at', new Date().toISOString())
        .order('scheduled_at', { ascending: true })
        .limit(50)

      const apptMapped = (appointments ?? []).map(a => ({
        id: `appt-${a.id}`,
        consultation_code: a.appointment_code ?? a.id.slice(0, 8),
        consultation_date: a.scheduled_at,
        chief_complaint: a.chief_complaint,
        patient_id: a.patient_id,
        patient_name: a.patient_name ?? 'Paciente',
        patient_phone: a.patient_phone ?? null,
        patient_email: a.patient_email ?? null,
        plan_name: a.plan_name || null,
      }))

      // Merge avoiding duplicates (same patient + similar time)
      const combined = [...consultMapped]
      for (const appt of apptMapped) {
        const isDup = consultMapped.some(c => {
          const diff = Math.abs(new Date(c.consultation_date).getTime() - new Date(appt.consultation_date).getTime())
          return c.patient_name === appt.patient_name && diff < 3600000
        })
        if (!isDup) combined.push(appt)
      }
      combined.sort((a, b) => new Date(a.consultation_date).getTime() - new Date(b.consultation_date).getTime())

      setUpcomingConsults(combined)
      setLoading(false)
    })
  }, [])

  function daysUntil(dateStr: string): number {
    const diff = new Date(dateStr).getTime() - Date.now()
    return Math.ceil(diff / (1000 * 60 * 60 * 24))
  }

  function formatDateTime(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('es-VE', {
      weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit',
    })
  }

  function formatTime(dateStr: string) {
    return new Date(dateStr).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: true })
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('es-VE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
  }

  function buildWAMessage(consult: Consultation) {
    const date = formatDate(consult.consultation_date)
    const time = formatTime(consult.consultation_date)
    const doc = doctorName || 'tu médico'
    let msg = `Hola ${consult.patient_name} 👋\n\n`
    msg += `Tu consulta con ${doc} está *confirmada* para:\n\n`
    msg += `📅 *Fecha:* ${date}\n`
    msg += `🕐 *Hora:* ${time}\n`
    if (consult.plan_name) msg += `📋 *Servicio:* ${consult.plan_name}\n`
    msg += `🔖 *Código:* ${consult.consultation_code}\n\n`
    msg += `Por favor llega con 10 minutos de anticipación.\n`
    msg += `Si necesitas reagendar, contáctanos con anticipación.\n\n`
    msg += `¡Te esperamos! 🏥`
    return encodeURIComponent(msg)
  }

  function buildEmailMessage(consult: Consultation) {
    const date = formatDate(consult.consultation_date)
    const time = formatTime(consult.consultation_date)
    const doc = doctorName || 'su médico'
    const subject = encodeURIComponent(`Confirmación de consulta - ${date}`)
    let body = `Estimado/a ${consult.patient_name},\n\n`
    body += `Le confirmamos su consulta con ${doc}:\n\n`
    body += `Fecha: ${date}\n`
    body += `Hora: ${time}\n`
    if (consult.plan_name) body += `Servicio: ${consult.plan_name}\n`
    body += `Código: ${consult.consultation_code}\n\n`
    body += `Por favor llegue con 10 minutos de anticipación.\n`
    body += `Si necesita reagendar, contáctenos con anticipación.\n\n`
    body += `Saludos,\n${doc}`
    return { subject, body: encodeURIComponent(body) }
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
    const { subject, body } = buildEmailMessage(consult)
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
    if (selected.size === filtered.length) setSelected(new Set())
    else setSelected(new Set(filtered.map(c => c.id)))
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
        await new Promise(r => setTimeout(r, 500))
      } else if (bulkChannel === 'email' && consult.patient_email) {
        const { subject, body } = buildEmailMessage(consult)
        window.open(`mailto:${consult.patient_email}?subject=${subject}&body=${body}`, '_blank')
        markSent(consult.id, 'email')
        await new Promise(r => setTimeout(r, 500))
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
            <p className="text-sm text-slate-500">Envía confirmaciones y recordatorios a tus pacientes</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowWhatsAppInfo(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
              <Info className="w-3.5 h-3.5 text-teal-500" /> Configurar WhatsApp
            </button>
            <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
              {DAYS_AHEAD.map(d => (
                <button key={d} onClick={() => setFilterDays(d)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${filterDays === d ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                  {d === 0 ? 'Hoy' : `${d}d`}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Message preview box */}
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-slate-400 uppercase mb-2">Vista previa del mensaje</p>
          <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-sm text-slate-700 leading-relaxed">
            <p>Hola <strong>[Paciente]</strong> 👋</p>
            <p className="mt-1">Tu consulta con <strong>{doctorName || '[Doctor]'}</strong> está <strong>confirmada</strong> para:</p>
            <p className="mt-1">📅 <strong>Fecha:</strong> [día, fecha]</p>
            <p>🕐 <strong>Hora:</strong> [hora]</p>
            <p>📋 <strong>Servicio:</strong> [nombre del plan]</p>
            <p className="mt-1 text-xs text-slate-500">Por favor llega con 10 minutos de anticipación.</p>
          </div>
        </div>

        {/* Info box */}
        <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 flex items-start gap-3">
          <Bell className="w-4 h-4 text-teal-500 shrink-0 mt-0.5" />
          <p className="text-sm text-teal-700">
            Selecciona las consultas y haz clic en <strong>Enviar recordatorio</strong> para notificar a tus pacientes por WhatsApp o Email.
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
            <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
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
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <p className="font-semibold text-slate-900 text-sm">{consult.patient_name}</p>
                          <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${badge.cls}`}>
                            {badge.icon}{badge.label}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500">
                          {formatDateTime(consult.consultation_date)}
                        </p>
                        {consult.plan_name && <p className="text-xs text-teal-600 font-medium mt-0.5">{consult.plan_name}</p>}
                        {consult.chief_complaint && <p className="text-xs text-slate-400 mt-0.5">{consult.chief_complaint}</p>}

                        {/* Contact info */}
                        <div className="flex items-center gap-3 mt-1.5">
                          {consult.patient_phone && (
                            <span className="flex items-center gap-1 text-[10px] text-slate-400">
                              <Phone className="w-3 h-3" />{consult.patient_phone}
                            </span>
                          )}
                          {consult.patient_email && (
                            <span className="flex items-center gap-1 text-[10px] text-slate-400">
                              <Mail className="w-3 h-3" />{consult.patient_email}
                            </span>
                          )}
                        </div>

                        {/* Sent history */}
                        {sent.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {sent.map(s => (
                              <span key={s.id} className="flex items-center gap-1 text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-semibold">
                                <CheckCircle className="w-2.5 h-2.5" />
                                {s.channel === 'whatsapp' ? 'WhatsApp enviado' : 'Email enviado'}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-2 shrink-0">
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

      {/* WhatsApp Setup Info Modal */}
      {showWhatsAppInfo && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowWhatsAppInfo(false)}>
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-emerald-500" />
                <h3 className="text-base font-bold text-slate-900">Configurar WhatsApp</h3>
              </div>
              <button onClick={() => setShowWhatsAppInfo(false)} className="p-1.5 rounded-lg hover:bg-slate-100">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                <p className="text-sm font-bold text-emerald-800 mb-1">¿Cómo funciona?</p>
                <p className="text-sm text-emerald-700">
                  Los recordatorios se envían mediante <strong>WhatsApp Web</strong>. Al hacer clic en &quot;WhatsApp&quot;, se abre una ventana con el mensaje listo para enviar al paciente.
                </p>
              </div>

              <div>
                <p className="text-sm font-bold text-slate-800 mb-3">Pasos para que funcione correctamente:</p>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full g-bg flex items-center justify-center text-white text-xs font-bold shrink-0">1</div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">Abre WhatsApp Web en tu navegador</p>
                      <p className="text-xs text-slate-500 mt-0.5">Ve a <a href="https://web.whatsapp.com" target="_blank" rel="noopener noreferrer" className="text-teal-600 underline font-medium">web.whatsapp.com</a> y escanea el código QR con tu teléfono.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full g-bg flex items-center justify-center text-white text-xs font-bold shrink-0">2</div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">Mantén la sesión activa</p>
                      <p className="text-xs text-slate-500 mt-0.5">Deja la pestaña de WhatsApp Web abierta para que los enlaces se abran correctamente.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full g-bg flex items-center justify-center text-white text-xs font-bold shrink-0">3</div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">Verifica los números de teléfono</p>
                      <p className="text-xs text-slate-500 mt-0.5">Los pacientes deben tener su número registrado con código de país (ej: 584141234567 para Venezuela).</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full g-bg flex items-center justify-center text-white text-xs font-bold shrink-0">4</div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">Haz clic en &quot;Enviar&quot;</p>
                      <p className="text-xs text-slate-500 mt-0.5">Al hacer clic en el botón WhatsApp, se abre la conversación con el mensaje ya escrito. Solo debes presionar enviar.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-sm font-bold text-amber-800 mb-1">Envío masivo</p>
                <p className="text-xs text-amber-700">
                  Al enviar a múltiples pacientes, se abrirá una ventana de WhatsApp Web por cada paciente. Esto es necesario porque WhatsApp no permite envío automatizado sin la API Business. Deberás confirmar el envío de cada mensaje manualmente.
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <p className="text-sm font-bold text-slate-800 mb-1">¿Quieres envío 100% automático?</p>
                <p className="text-xs text-slate-500">
                  Para recordatorios automáticos sin intervención manual, necesitas integrar la <strong>WhatsApp Business API</strong> de Meta. Esto requiere una cuenta de negocio verificada en Meta Business Suite. Próximamente estará disponible esta integración.
                </p>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100">
              <button onClick={() => setShowWhatsAppInfo(false)}
                className="w-full g-bg text-white py-2.5 rounded-xl text-sm font-bold hover:opacity-90 transition-opacity">
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
