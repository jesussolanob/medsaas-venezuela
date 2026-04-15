'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Calendar, Clock, User, Phone, Mail, CheckCircle, Activity, ChevronLeft, ChevronRight } from 'lucide-react'

type DoctorProfile = { id: string; full_name: string; specialty: string; phone: string; avatar_url: string | null }
type PricingPlan = { id: string; name: string; price_usd: number; duration_minutes: number; sessions_count?: number }
type Slot = { date: string; time: string; label: string }

function generateSlots(): Slot[] {
  const slots: Slot[] = []
  const times = ['08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
                 '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30']
  const today = new Date()
  for (let d = 1; d <= 21; d++) {
    const date = new Date(today)
    date.setDate(today.getDate() + d)
    if (date.getDay() === 0) continue
    const dateStr = date.toISOString().split('T')[0]
    const dayLabel = date.toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'short' })
    times.forEach(t => slots.push({ date: dateStr, time: t, label: dayLabel }))
  }
  return slots
}

function groupByDate(slots: Slot[]) {
  const map: Record<string, Slot[]> = {}
  slots.forEach(s => { if (!map[s.date]) map[s.date] = []; map[s.date].push(s) })
  return map
}

export default function BookingClient({ doctor, plans }: { doctor: DoctorProfile; plans: PricingPlan[] }) {
  const [step, setStep] = useState(1)
  const [selectedPlan, setSelectedPlan] = useState<PricingPlan | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
  const [weekOffset, setWeekOffset] = useState(0)
  const [useInsurance, setUseInsurance] = useState(false)
  const [selectedInsurance, setSelectedInsurance] = useState('')
  const [authCode, setAuthCode] = useState('')
  const [form, setForm] = useState({ full_name: '', phone: '', email: '', notes: '' })
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const mockInsurances = ['Seguros Mercantil', 'Mapfre', 'La Previsora', 'ABA Seguros']

  const allSlots = generateSlots()
  const grouped = groupByDate(allSlots)
  const dates = Object.keys(grouped).sort()
  const weekDates = dates.slice(weekOffset * 5, weekOffset * 5 + 5)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.full_name.trim() || !form.phone.trim() || !selectedSlot) return
    setSubmitting(true)
    setError('')
    try {
      const supabase = createClient()

      // 1. Check if patient exists and has remaining sessions from a multi-session plan
      const { data: existingPatients } = await supabase
        .from('patients')
        .select('id')
        .eq('doctor_id', doctor.id)
        .or(`phone.eq.${form.phone},email.eq.${form.email}`)
        .limit(1)

      let patientId = existingPatients?.[0]?.id ?? null

      // If patient doesn't exist, create one
      if (!patientId) {
        const { data: newPatient, error: pErr } = await supabase
          .from('patients')
          .insert({ doctor_id: doctor.id, full_name: form.full_name, phone: form.phone, email: form.email || null, notes: form.notes || null, source: 'booking' })
          .select().single()

        if (pErr && pErr.code !== '23505') {
          setError('Error al registrar. Por favor intenta de nuevo.')
          setSubmitting(false); return
        }
        patientId = newPatient?.id ?? null
      }

      // 2. Check if patient has an existing appointment with remaining sessions
      let skipPayment = false
      let planSessionsRemaining = 1
      if (patientId && selectedPlan?.sessions_count && selectedPlan.sessions_count > 1) {
        const { data: existingAppt } = await supabase
          .from('appointments')
          .select('plan_sessions_remaining')
          .eq('patient_id', patientId)
          .eq('doctor_id', doctor.id)
          .eq('plan_name', selectedPlan.name)
          .gt('plan_sessions_remaining', 0)
          .limit(1)

        if (existingAppt && existingAppt.length > 0 && existingAppt[0].plan_sessions_remaining > 0) {
          skipPayment = true
          planSessionsRemaining = existingAppt[0].plan_sessions_remaining - 1
        } else {
          planSessionsRemaining = selectedPlan.sessions_count - 1
        }
      }

      // 3. Create appointment
      const dateTime = new Date(`${selectedSlot.date}T${selectedSlot.time}:00`)
      const appointmentData = {
        doctor_id: doctor.id,
        patient_id: patientId,
        patient_name: form.full_name,
        patient_phone: form.phone,
        patient_email: form.email || null,
        appointment_date: dateTime.toISOString(),
        chief_complaint: form.notes || null,
        plan_name: selectedPlan?.name ?? 'Consulta General',
        plan_price: selectedPlan?.price_usd ?? 20,
        plan_sessions_remaining: planSessionsRemaining,
        status: 'pending',
        source: 'booking',
      }

      const { error: apptErr } = await supabase.from('appointments').insert(appointmentData)
      if (apptErr) {
        console.warn('appointments insert warning:', apptErr.message)
      }

      setDone(true)
    } catch { setError('Error inesperado. Por favor intenta de nuevo.') }
    setSubmitting(false)
  }

  if (done) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');* { font-family: 'Inter', sans-serif; }.g-bg{background:linear-gradient(135deg,#00C4CC 0%,#0891b2 100%)}`}</style>
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-8 h-8 text-emerald-500" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">¡Cita agendada!</h2>
        <p className="text-sm text-slate-500 mb-4">
          Tu consulta con <strong>Dr. {doctor.full_name}</strong> fue registrada para el <strong>{selectedSlot?.label}</strong> a las <strong>{selectedSlot?.time}</strong>.
        </p>
        <div className="bg-slate-50 rounded-xl p-4 text-left space-y-1.5 mb-5">
          <p className="text-xs text-slate-500"><span className="font-semibold">Paciente:</span> {form.full_name}</p>
          <p className="text-xs text-slate-500"><span className="font-semibold">Teléfono:</span> {form.phone}</p>
          {selectedPlan && <p className="text-xs text-slate-500"><span className="font-semibold">Consulta:</span> {selectedPlan.name} — ${selectedPlan.price_usd} USD</p>}
        </div>
        <p className="text-xs text-slate-400">El médico confirmará tu cita y se pondrá en contacto contigo.</p>
      </div>
    </div>
  )

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');* { font-family: 'Inter', sans-serif; }.g-bg{background:linear-gradient(135deg,#00C4CC 0%,#0891b2 100%)}`}</style>

      <div className="min-h-screen bg-slate-50">
        {/* Header */}
        <div className="g-bg">
          <div className="max-w-2xl mx-auto px-4 py-8 text-white">
            <div className="text-center mb-6">
              <div className="w-24 h-24 rounded-full bg-white/20 overflow-hidden flex items-center justify-center shrink-0 mx-auto mb-4 border-4 border-white/30">
                {doctor.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={doctor.avatar_url} alt={doctor.full_name} className="w-full h-full object-cover" />
                ) : (
                  <Activity className="w-10 h-10 text-white" />
                )}
              </div>
              <h1 className="text-3xl font-bold">Dr(a). {doctor.full_name}</h1>
              <p className="text-base text-white/80 mt-1">{doctor.specialty || 'Médico especialista'}</p>
            </div>

            {/* Trust bar */}
            <div className="flex items-center justify-center gap-4 text-xs font-semibold mb-6 flex-wrap">
              <span className="flex items-center gap-1.5">⭐ Atención profesional</span>
              <span className="text-white/40">·</span>
              <span className="flex items-center gap-1.5">⚡ Respuesta en minutos</span>
              <span className="text-white/40">·</span>
              <span className="flex items-center gap-1.5">✓ Confirmación inmediata</span>
            </div>

            {/* Steps */}
            <div className="flex items-center gap-2 mt-6">
              {['Tipo de consulta', 'Seleccionar fecha', 'Tus datos'].map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all ${step > i + 1 ? 'bg-emerald-500 text-white' : step === i + 1 ? 'bg-white text-teal-600' : 'bg-white/20 text-white/60'}`}>
                    <span>{i + 1}</span>
                    <span className="hidden sm:inline">{s}</span>
                  </div>
                  {i < 2 && <div className={`w-6 h-0.5 ${step > i + 1 ? 'bg-white' : 'bg-white/30'}`} />}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-8">

          {/* Step 1: Select plan */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900 mb-1">¿Qué tipo de consulta necesitas?</h2>
                <p className="text-sm text-slate-500">Elige el plan que mejor se adapte a tus necesidades</p>
              </div>

              <div className="grid gap-4">
                {plans.map((plan, idx) => {
                  const isMiddle = idx === Math.floor(plans.length / 2)
                  const isSelected = selectedPlan?.id === plan.id
                  return (
                    <button
                      key={plan.id}
                      onClick={() => { setSelectedPlan(plan); setStep(2) }}
                      className={`relative bg-white rounded-xl p-6 text-left transition-all group ${isSelected ? 'border-2 border-teal-500 shadow-lg' : isMiddle ? 'border-2 border-teal-300 shadow-md' : 'border-2 border-slate-200 hover:border-teal-300'}`}
                    >
                      {isMiddle && <span className="absolute -top-3 left-4 text-xs font-bold text-teal-600 bg-teal-50 px-3 py-1 rounded-full">Más elegido</span>}

                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-bold text-lg text-slate-900">{plan.name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            <p className="text-sm text-slate-600">{plan.duration_minutes} min por sesión</p>
                          </div>
                          {plan.sessions_count && plan.sessions_count > 1 && (
                            <span className="inline-block text-xs font-bold text-violet-600 bg-violet-50 px-3 py-1 rounded-full mt-2">
                              Paquete {plan.sessions_count} consultas
                            </span>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-3xl font-extrabold text-teal-600">${plan.price_usd}</p>
                          <p className="text-xs text-slate-400 mt-1">USD{plan.sessions_count && plan.sessions_count > 1 ? ` · $${(plan.price_usd / plan.sessions_count).toFixed(0)}/c/u` : ''}</p>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Payment methods info */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <p className="text-xs font-bold text-slate-600 uppercase tracking-widest mb-2">Métodos de pago aceptados</p>
                <div className="flex flex-wrap gap-2">
                  {['💵 Efectivo USD', '📱 Pago Móvil', '🏦 Transferencia', '🔄 Zelle'].map(method => (
                    <span key={method} className="text-xs text-slate-600 bg-white px-3 py-1.5 rounded-lg border border-slate-100">{method}</span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Select slot */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <button onClick={() => setStep(1)} className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-50"><ChevronLeft className="w-4 h-4 text-slate-500" /></button>
                <h2 className="text-lg font-bold text-slate-900">Elige fecha y hora</h2>
              </div>

              <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 py-3">
                <button onClick={() => setWeekOffset(Math.max(0, weekOffset - 1))} disabled={weekOffset === 0}
                  className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center disabled:opacity-40 transition-colors"><ChevronLeft className="w-4 h-4 text-slate-500" /></button>
                <span className="text-sm font-semibold text-slate-700">
                  {weekDates.length > 0 && `${new Date(weekDates[0]+'T12:00:00').toLocaleDateString('es-VE', { day: 'numeric', month: 'short' })} — ${new Date(weekDates[weekDates.length - 1]+'T12:00:00').toLocaleDateString('es-VE', { day: 'numeric', month: 'short' })}`}
                </span>
                <button onClick={() => setWeekOffset(weekOffset + 1)} disabled={(weekOffset + 1) * 5 >= dates.length}
                  className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center disabled:opacity-40 transition-colors"><ChevronRight className="w-4 h-4 text-slate-500" /></button>
              </div>

              {weekDates.map(date => (
                <div key={date} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                    <p className="text-xs font-bold text-slate-600 capitalize">
                      {new Date(date + 'T12:00:00').toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </p>
                  </div>
                  <div className="p-3 flex flex-wrap gap-2">
                    {grouped[date]?.map(slot => (
                      <button key={slot.time} onClick={() => setSelectedSlot(slot)}
                        className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all ${selectedSlot?.date === slot.date && selectedSlot?.time === slot.time ? 'g-bg text-white shadow-md' : 'bg-slate-100 text-slate-700 hover:bg-teal-50 hover:text-teal-700'}`}>
                        {slot.time}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              <button onClick={() => setStep(3)} disabled={!selectedSlot}
                className="w-full g-bg py-3 rounded-xl text-sm font-bold text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                <Clock className="w-4 h-4" />
                Continuar {selectedSlot ? `— ${selectedSlot.label} ${selectedSlot.time}` : ''}
              </button>
            </div>
          )}

          {/* Step 3: Patient data */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <button onClick={() => setStep(2)} className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-50"><ChevronLeft className="w-4 h-4 text-slate-500" /></button>
                <h2 className="text-lg font-bold text-slate-900">Tus datos</h2>
              </div>

              <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 flex items-center gap-3">
                <Calendar className="w-4 h-4 text-teal-600 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-teal-800">{selectedSlot?.label} a las {selectedSlot?.time}</p>
                  <p className="text-xs text-teal-600">{selectedPlan?.name} — ${selectedPlan?.price_usd} USD</p>
                </div>
              </div>

              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>}

              <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
                {/* Insurance selection */}
                <div className="border-b pb-5">
                  <p className="text-sm font-bold text-slate-700 mb-3">¿Cómo pagarás la consulta?</p>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setUseInsurance(false)}
                      className={`p-3 rounded-lg border-2 text-sm font-semibold transition-all ${!useInsurance ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                    >
                      💵 Pago directo
                    </button>
                    <button
                      type="button"
                      onClick={() => setUseInsurance(true)}
                      className={`p-3 rounded-lg border-2 text-sm font-semibold transition-all ${useInsurance ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                    >
                      🏥 Pago con Seguro
                    </button>
                  </div>
                </div>

                {/* Insurance details if selected */}
                {useInsurance && (
                  <div className="space-y-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Selecciona tu seguro</label>
                      <select
                        value={selectedInsurance}
                        onChange={e => setSelectedInsurance(e.target.value)}
                        className={fi}
                        required={useInsurance}
                      >
                        <option value="">-- Seleccionar seguro --</option>
                        {mockInsurances.map(ins => <option key={ins} value={ins}>{ins}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Clave de autorización (si aplica)</label>
                      <input
                        value={authCode}
                        onChange={e => setAuthCode(e.target.value)}
                        placeholder="Ej: AUTH-12345"
                        className={fi}
                      />
                    </div>
                  </div>
                )}

                {/* Patient info */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5"><User className="w-3.5 h-3.5 inline mr-1.5" />Nombre completo <span className="text-red-400">*</span></label>
                  <input value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} placeholder="María González" className={fi} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5"><Phone className="w-3.5 h-3.5 inline mr-1.5" />Teléfono <span className="text-red-400">*</span></label>
                  <input type="tel" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="+58 412 000 0000" className={fi} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5"><Mail className="w-3.5 h-3.5 inline mr-1.5" />Email <span className="text-slate-400 text-xs">(opcional)</span></label>
                  <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="tu@email.com" className={fi} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Motivo de consulta</label>
                  <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Describe brevemente por qué necesitas la consulta..." className={fi + ' resize-none'} />
                </div>
                <button type="submit" disabled={submitting} className="w-full g-bg py-3 rounded-xl text-sm font-bold text-white hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2">
                  {submitting ? 'Confirmando...' : <><CheckCircle className="w-4 h-4" />Confirmar cita</>}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

const fi = 'w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 bg-white transition-colors'
