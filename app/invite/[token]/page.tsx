'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Activity, Calendar, Clock, User, Phone, Mail, CheckCircle2, ArrowRight, AlertCircle, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { getProfessionalTitle } from '@/lib/professional-title'

type Invitation = {
  id: string
  token: string
  patient_name: string
  patient_phone: string
  doctor_id: string
  used_at: string | null
}

type DoctorProfile = {
  full_name: string
  specialty: string | null
  phone: string | null
  professional_title?: string | null
}

type AvailableSlot = { date: string; time: string; label: string }

function generateSlots(): AvailableSlot[] {
  const slots: AvailableSlot[] = []
  const today = new Date()
  for (let d = 1; d <= 14; d++) {
    const date = new Date(today)
    date.setDate(today.getDate() + d)
    const weekday = date.getDay()
    if (weekday === 0) continue // Skip Sunday
    const times = weekday === 6 ? ['09:00', '10:00', '11:00'] : ['08:00', '09:00', '10:00', '11:00', '14:00', '15:00', '16:00']
    const dateStr = date.toISOString().split('T')[0]
    const dateLabel = date.toLocaleDateString('es-VE', { weekday: 'long', day: '2-digit', month: 'long' })
    times.forEach(time => {
      slots.push({ date: dateStr, time, label: `${dateLabel} a las ${time}` })
    })
  }
  return slots
}

export default function InviteBookingPage() {
  const params = useParams()
  const token = params?.token as string

  const [invitation, setInvitation] = useState<Invitation | null>(null)
  const [doctor, setDoctor] = useState<DoctorProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [alreadyUsed, setAlreadyUsed] = useState(false)
  const [step, setStep] = useState<'slots' | 'form' | 'success'>('slots')

  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null)
  const [form, setForm] = useState({ full_name: '', phone: '', email: '', notes: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const availableSlots = generateSlots()

  useEffect(() => {
    if (!token) return
    const supabase = createClient()

    supabase
      .from('doctor_invitations')
      .select('*')
      .eq('token', token)
      .single()
      .then(async ({ data, error }) => {
        if (error || !data) { setNotFound(true); setLoading(false); return }
        setInvitation(data)
        if (data.used_at) { setAlreadyUsed(true); setLoading(false); return }

        // Pre-fill from invitation
        setForm(prev => ({
          ...prev,
          full_name: data.patient_name,
          phone: data.patient_phone,
        }))

        // Fetch doctor profile
        const { data: prof } = await supabase
          .from('profiles')
          .select('full_name, specialty, phone, professional_title')
          .eq('id', data.doctor_id)
          .single()

        setDoctor(prof)
        setLoading(false)
      })
  }, [token])

  async function handleBook() {
    if (!selectedSlot || !invitation) return
    setSubmitting(true)
    setError('')

    const supabase = createClient()

    // Add patient if not exists, create consultation
    const { data: patient, error: patErr } = await supabase
      .from('patients')
      .insert({
        doctor_id: invitation.doctor_id,
        full_name: form.full_name,
        phone: form.phone,
        email: form.email || null,
        notes: form.notes || null,
        source: 'invitation',
      })
      .select()
      .single()

    if (patErr && !patErr.message.includes('duplicate')) {
      setError('Hubo un problema al registrar tu información. Intenta nuevamente.')
      setSubmitting(false)
      return
    }

    const patientId = patient?.id

    if (patientId) {
      const consultDate = new Date(`${selectedSlot.date}T${selectedSlot.time}:00`)
      const dateStr = selectedSlot.date.replace(/-/g, '')
      const rand = Math.floor(1000 + Math.random() * 9000)
      const appointmentCode = `CIT-${dateStr}-${rand}`
      const consultationCode = `CON-${dateStr}-${rand}`

      // 1. Create appointment (financial + agenda source of truth)
      const { data: appt } = await supabase.from('appointments').insert({
        appointment_code: appointmentCode,
        doctor_id: invitation.doctor_id,
        patient_id: patientId,
        patient_name: form.full_name,
        patient_phone: form.phone || null,
        patient_email: form.email || null,
        scheduled_at: consultDate.toISOString(),
        status: 'confirmed',
        source: 'invitation',
        plan_name: 'Consulta por invitación',
        plan_price: 0,
        payment_method: null,
        appointment_mode: 'presencial',
        chief_complaint: form.notes || 'Consulta agendada por invitación',
      }).select('id').single()

      // 2. Create consultation linked to appointment (clinical container)
      if (appt) {
        await supabase.from('consultations').insert({
          consultation_code: consultationCode,
          patient_id: patientId,
          doctor_id: invitation.doctor_id,
          appointment_id: appt.id,
          chief_complaint: form.notes || 'Consulta agendada por invitación',
          payment_status: 'unpaid',
          consultation_date: consultDate.toISOString(),
        })
      }

      // 3. Mark invitation as used
      await supabase
        .from('doctor_invitations')
        .update({ used_at: new Date().toISOString() })
        .eq('id', invitation.id)
    }

    setSubmitting(false)
    setStep('success')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center" style={{ fontFamily: "'Inter', sans-serif" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');`}</style>
        <div className="flex items-center gap-2 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Cargando tu invitación...</span>
        </div>
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4" style={{ fontFamily: "'Inter', sans-serif" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');`}</style>
        <div className="bg-white rounded-2xl p-8 text-center max-w-sm shadow-lg border border-slate-200">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-slate-800">Invitación no válida</h2>
          <p className="text-slate-500 text-sm mt-2">Este link de invitación no existe o ha expirado.</p>
          <Link href="/" className="mt-5 inline-block text-sm text-teal-600 font-semibold">← Ir al inicio</Link>
        </div>
      </div>
    )
  }

  if (alreadyUsed) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4" style={{ fontFamily: "'Inter', sans-serif" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');`}</style>
        <div className="bg-white rounded-2xl p-8 text-center max-w-sm shadow-lg border border-slate-200">
          <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-slate-800">Consulta ya agendada</h2>
          <p className="text-slate-500 text-sm mt-2">Esta invitación ya fue utilizada. Si necesitas otra cita, pide a tu médico que te envíe un nuevo link.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');.g-bg{background:linear-gradient(135deg,#00C4CC 0%,#0891b2 100%)}.slot-btn{transition:all .15s}.slot-btn.sel{border-color:#00C4CC;background:rgba(0,196,204,0.07)}`}</style>

      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl g-bg flex items-center justify-center">
            <Activity className="w-4 h-4 text-white" />
          </div>
          <div>
            <span className="font-bold text-slate-900">Delta</span>
            <span className="text-slate-400 text-xs block">Booking de consulta</span>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-8 space-y-6">
        {/* Doctor card */}
        {doctor && (
          <div className="g-bg rounded-2xl p-5 text-white relative overflow-hidden">
            <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-white/10 blur-xl pointer-events-none" />
            <p className="text-white/70 text-xs font-semibold uppercase tracking-widest mb-2">Tu médico</p>
            <h1 className="text-xl font-bold text-white">{getProfessionalTitle(doctor.professional_title, doctor.specialty)} {doctor.full_name}</h1>
            {doctor.specialty && <p className="text-white/70 text-sm mt-0.5">{doctor.specialty}</p>}
            <p className="text-white/60 text-xs mt-3">Hola, <strong className="text-white/90">{invitation?.patient_name}</strong> — selecciona el horario de tu consulta</p>
          </div>
        )}

        {/* STEP: Slot selection */}
        {step === 'slots' && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-widest">Selecciona fecha y hora</h2>
            <div className="grid grid-cols-1 gap-2 max-h-80 overflow-y-auto pr-1">
              {availableSlots.map((slot, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedSlot(slot)}
                  className={`slot-btn w-full flex items-center gap-3 px-4 py-3 bg-white rounded-xl border-2 text-left ${selectedSlot?.label === slot.label ? 'sel border-teal-400' : 'border-slate-200 hover:border-slate-300'}`}
                >
                  <Calendar className={`w-4 h-4 shrink-0 ${selectedSlot?.label === slot.label ? 'text-teal-500' : 'text-slate-400'}`} />
                  <div>
                    <p className={`text-sm font-semibold capitalize ${selectedSlot?.label === slot.label ? 'text-teal-700' : 'text-slate-700'}`}>{slot.label}</p>
                  </div>
                  {selectedSlot?.label === slot.label && <CheckCircle2 className="w-4 h-4 text-teal-500 ml-auto shrink-0" />}
                </button>
              ))}
            </div>

            <button
              onClick={() => selectedSlot && setStep('form')}
              disabled={!selectedSlot}
              className="g-bg w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
            >
              Continuar <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* STEP: Patient form */}
        {step === 'form' && selectedSlot && (
          <div className="space-y-4">
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 flex items-center gap-3">
              <Calendar className="w-4 h-4 text-teal-500 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-teal-700 capitalize">{selectedSlot.label}</p>
                <button onClick={() => setStep('slots')} className="text-xs text-teal-500 hover:text-teal-700 underline">Cambiar horario</button>
              </div>
            </div>

            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-widest">Confirma tus datos</h2>

            {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">{error}</div>}

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Nombre completo</label>
                <input value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} placeholder="Tu nombre" className={fi} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Teléfono (WhatsApp)</label>
                <input type="tel" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="+58 412 000 0000" className={fi} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Email (opcional)</label>
                <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="tu@email.com" className={fi} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Motivo de consulta</label>
                <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Describe brevemente el motivo de tu consulta..." className={fi + ' resize-none'} />
              </div>
            </div>

            <p className="text-xs text-slate-400 bg-slate-50 rounded-xl p-3">
              💡 Si no puedes pagar antes, aún puedes agendar. El médico podrá actualizar el estado de pago luego.
            </p>

            <button
              onClick={handleBook}
              disabled={submitting || !form.full_name.trim()}
              className="g-bg w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-bold text-white disabled:opacity-50"
            >
              {submitting ? <><Loader2 className="w-4 h-4 animate-spin" />Agendando...</> : <>Confirmar consulta <ArrowRight className="w-4 h-4" /></>}
            </button>
          </div>
        )}

        {/* STEP: Success */}
        {step === 'success' && selectedSlot && (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-5 shadow-sm">
            <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">¡Consulta agendada!</h2>
              <p className="text-slate-500 text-sm mt-1">Tu cita ha sido confirmada exitosamente.</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-4 text-left space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="w-4 h-4 text-teal-500" />
                <span className="text-slate-700 font-semibold capitalize">{selectedSlot.label}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <User className="w-4 h-4 text-slate-400" />
                <span className="text-slate-600">{form.full_name}</span>
              </div>
              {doctor && (
                <div className="flex items-center gap-2 text-sm">
                  <Activity className="w-4 h-4 text-slate-400" />
                  <span className="text-slate-600">{getProfessionalTitle(doctor.professional_title, doctor.specialty)} {doctor.full_name}{doctor.specialty ? ` · ${doctor.specialty}` : ''}</span>
                </div>
              )}
            </div>
            <p className="text-xs text-slate-400">Guarda esta información. Recibirás un recordatorio antes de tu consulta.</p>
          </div>
        )}
      </main>
    </div>
  )
}

const fi = 'w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 bg-white transition-colors'
