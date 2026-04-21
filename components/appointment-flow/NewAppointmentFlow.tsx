'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { X, Loader2, Search, UserPlus, Calendar, CheckCircle2, AlertCircle, ChevronRight } from 'lucide-react'

/**
 * NewAppointmentFlow — componente único para crear citas desde TODOS los puntos
 * de entrada (agenda, ficha paciente, admin panel, portal paciente).
 *
 * La lógica está centralizada aquí; el UI se adapta con el `initialContext`
 * para precargar campos según de dónde venga el usuario.
 */
export type AppointmentOrigin =
  | 'agenda_slot'        // click en slot libre del calendario
  | 'agenda_btn'         // botón "Nueva cita" en la agenda
  | 'patient_sheet'      // desde /doctor/patients/[id]
  | 'admin_panel'        // admin crea cita para un doctor
  | 'patient_portal'     // paciente agenda desde su portal
  | 'public_booking'     // flujo /book/[doctorId] sin login

export type AppointmentContext = {
  patientId?: string
  doctorId?: string
  slotStart?: string          // ISO timestamp
  packageId?: string
  origin: AppointmentOrigin
}

type Props = {
  open: boolean
  onClose: () => void
  onSuccess?: (appointmentId: string) => void
  initialContext: AppointmentContext
}

type PatientLookup = {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  cedula: string | null
}

type PricingPlan = {
  id: string
  name: string
  price_usd: number
  duration_minutes: number | null
  sessions_count: number
}

type PatientPackageInfo = {
  id: string
  plan_name: string
  total_sessions: number
  used_sessions: number
  status: string
}

export default function NewAppointmentFlow({ open, onClose, onSuccess, initialContext }: Props) {
  const supabase = createClient()

  // ── Estado: pasos 1..4 ─────────────────────────────────────────────────
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // ── Paso 1: paciente ────────────────────────────────────────────────────
  const [patientQuery, setPatientQuery] = useState('')
  const [patientResults, setPatientResults] = useState<PatientLookup[]>([])
  const [selectedPatient, setSelectedPatient] = useState<PatientLookup | null>(null)
  const [showInlineCreator, setShowInlineCreator] = useState(false)
  const [newPatient, setNewPatient] = useState({
    full_name: '', cedula: '', email: '', phone: '', birth_date: '', sex: '',
  })
  const [creatingPatient, setCreatingPatient] = useState(false)

  // ── Paso 2: slot + doctor ───────────────────────────────────────────────
  const [doctorId, setDoctorId] = useState(initialContext.doctorId || '')
  const [scheduledAt, setScheduledAt] = useState(initialContext.slotStart || '')
  const [mode, setMode] = useState<'presencial' | 'online'>('presencial')

  // ── Paso 3: precio + pago ──────────────────────────────────────────────
  const [pricingPlans, setPricingPlans] = useState<PricingPlan[]>([])
  const [selectedPlan, setSelectedPlan] = useState<PricingPlan | null>(null)
  const [packages, setPackages] = useState<PatientPackageInfo[]>([])
  const [usePackage, setUsePackage] = useState<string | null>(initialContext.packageId || null)
  const [paymentMethod, setPaymentMethod] = useState('efectivo')
  const [chiefComplaint, setChiefComplaint] = useState('')

  // ── Carga inicial ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    setStep(1); setErrorMsg(null)

    // Precargar paciente si viene en el contexto
    if (initialContext.patientId) {
      ;(async () => {
        const { data } = await supabase
          .from('patients')
          .select('id, full_name, email, phone, cedula')
          .eq('id', initialContext.patientId!)
          .single()
        if (data) {
          setSelectedPatient(data as PatientLookup)
          setStep(2)
        }
      })()
    }
  }, [open, initialContext.patientId])

  // ── Carga doctor actual si no viene ────────────────────────────────────
  useEffect(() => {
    if (!doctorId && open) {
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (user) setDoctorId(user.id)
      })
    }
  }, [open])

  // ── Carga pricing_plans + paquetes cuando hay patient + doctor ─────────
  useEffect(() => {
    if (!doctorId || !open) return
    ;(async () => {
      const { data: plans } = await supabase
        .from('pricing_plans')
        .select('id, name, price_usd, duration_minutes, sessions_count')
        .eq('doctor_id', doctorId)
        .eq('is_active', true)
        .order('price_usd')
      setPricingPlans(plans || [])
      if (plans && plans.length > 0 && !selectedPlan) setSelectedPlan(plans[0])
    })()
  }, [doctorId, open])

  useEffect(() => {
    if (!selectedPatient || !doctorId || !open) return
    ;(async () => {
      const { data } = await supabase
        .from('patient_packages')
        .select('id, plan_name, total_sessions, used_sessions, status')
        .eq('doctor_id', doctorId)
        .eq('patient_id', selectedPatient.id)
        .eq('status', 'active')
      setPackages((data || []).filter(p => p.used_sessions < p.total_sessions))
    })()
  }, [selectedPatient, doctorId, open])

  // ── Búsqueda de pacientes (debounced simple) ───────────────────────────
  useEffect(() => {
    if (!patientQuery || patientQuery.length < 2 || !doctorId) {
      setPatientResults([])
      return
    }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('patients')
        .select('id, full_name, email, phone, cedula')
        .eq('doctor_id', doctorId)
        .or(`full_name.ilike.%${patientQuery}%,email.ilike.%${patientQuery}%,cedula.ilike.%${patientQuery}%,phone.ilike.%${patientQuery}%`)
        .limit(8)
      setPatientResults(data || [])
    }, 250)
    return () => clearTimeout(t)
  }, [patientQuery, doctorId])

  if (!open) return null

  // ── Acciones ────────────────────────────────────────────────────────────

  async function createPatientInline(e: React.FormEvent) {
    e.preventDefault()
    if (!doctorId) return
    setCreatingPatient(true); setErrorMsg(null)
    try {
      // Duplicado check
      if (newPatient.cedula || newPatient.email) {
        const { data: existing } = await supabase
          .from('patients')
          .select('id, full_name, email, cedula')
          .eq('doctor_id', doctorId)
          .or(`cedula.eq.${newPatient.cedula || '__none__'},email.eq.${newPatient.email || '__none__'}`)
          .limit(1)
        if (existing && existing.length > 0) {
          if (!confirm(`Ya existe un paciente con esta cédula o email: ${existing[0].full_name}. ¿Usar ese paciente en lugar de crear uno nuevo?`)) {
            throw new Error('Cancelado por el usuario')
          }
          setSelectedPatient(existing[0] as PatientLookup)
          setShowInlineCreator(false)
          setStep(2)
          return
        }
      }

      const { data: inserted, error } = await supabase
        .from('patients')
        .insert({
          doctor_id: doctorId,
          full_name: newPatient.full_name,
          cedula: newPatient.cedula || null,
          email: newPatient.email || null,
          phone: newPatient.phone || null,
          birth_date: newPatient.birth_date || null,
          sex: newPatient.sex || null,
          source: 'inline_booking',
        })
        .select('id, full_name, email, phone, cedula')
        .single()
      if (error) throw error
      setSelectedPatient(inserted as PatientLookup)
      setShowInlineCreator(false)
      setStep(2)
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al crear paciente')
    } finally {
      setCreatingPatient(false)
    }
  }

  async function submit() {
    if (!selectedPatient || !doctorId || !scheduledAt) {
      setErrorMsg('Faltan datos obligatorios')
      return
    }
    setLoading(true); setErrorMsg(null)
    try {
      // Usar el endpoint /api/book — ya maneja paquetes, duplicados, RPC
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctorId,
          accessToken: session?.access_token,
          patientName: selectedPatient.full_name,
          patientPhone: selectedPatient.phone,
          patientEmail: selectedPatient.email,
          patientCedula: selectedPatient.cedula,
          scheduledAt,
          chiefComplaint,
          planName: selectedPlan?.name || 'Consulta General',
          planPrice: usePackage ? 0 : (selectedPlan?.price_usd || 20),
          sessionsCount: selectedPlan?.sessions_count || 1,
          paymentMethod: usePackage ? 'package' : paymentMethod,
          appointmentMode: mode,
          packageId: usePackage,
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Error al crear cita')
      onSuccess?.(j.appointmentId)
      onClose()
    } catch (err: any) {
      setErrorMsg(err.message)
    } finally {
      setLoading(false)
    }
  }

  const canStep2 = !!selectedPatient
  const canStep3 = !!scheduledAt
  const canStep4 = canStep3 && (!!selectedPlan || !!usePackage)

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-xl shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white px-5 py-4 border-b border-slate-100 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Nueva consulta</h2>
            <p className="text-xs text-slate-400">Paso {step} de 4</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded"><X className="w-5 h-5 text-slate-400" /></button>
        </div>

        {errorMsg && (
          <div className="mx-5 mt-4 px-3 py-2 bg-red-50 text-red-700 rounded-lg text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> {errorMsg}
          </div>
        )}

        <div className="p-5 space-y-4">
          {/* ── Paso 1: Paciente ─────────────────────────────────────────── */}
          {step === 1 && !showInlineCreator && (
            <>
              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Paciente</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar por nombre, email, cédula o teléfono..."
                  value={patientQuery}
                  onChange={e => setPatientQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm"
                  autoFocus
                />
              </div>

              {patientResults.length > 0 && (
                <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-60 overflow-y-auto">
                  {patientResults.map(p => (
                    <button
                      key={p.id}
                      onClick={() => { setSelectedPatient(p); setStep(2) }}
                      className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center justify-between"
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-900">{p.full_name}</p>
                        <p className="text-xs text-slate-500">{p.email || p.phone || p.cedula || '—'}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    </button>
                  ))}
                </div>
              )}

              {patientQuery.length >= 2 && patientResults.length === 0 && (
                <div className="text-center py-6 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                  <p className="text-sm text-slate-500 mb-3">No se encontró ningún paciente</p>
                  <button
                    onClick={() => {
                      setShowInlineCreator(true)
                      setNewPatient(p => ({ ...p, full_name: patientQuery }))
                    }}
                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-teal-500 hover:bg-teal-600 text-white text-xs font-semibold rounded-lg"
                  >
                    <UserPlus className="w-3.5 h-3.5" /> Crear nuevo paciente
                  </button>
                </div>
              )}
            </>
          )}

          {/* ── Paso 1b: Crear paciente inline ─────────────────────────── */}
          {step === 1 && showInlineCreator && (
            <form onSubmit={createPatientInline} className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">Nuevo paciente</h3>
                <button type="button" onClick={() => setShowInlineCreator(false)}
                  className="text-xs text-slate-500 hover:text-slate-700">
                  ← Volver al buscador
                </button>
              </div>
              <input required placeholder="Nombre completo *" value={newPatient.full_name}
                onChange={e => setNewPatient({ ...newPatient, full_name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="Cédula" value={newPatient.cedula}
                  onChange={e => setNewPatient({ ...newPatient, cedula: e.target.value })}
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                <input type="tel" placeholder="Teléfono" value={newPatient.phone}
                  onChange={e => setNewPatient({ ...newPatient, phone: e.target.value })}
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                <input type="email" placeholder="Email" value={newPatient.email}
                  onChange={e => setNewPatient({ ...newPatient, email: e.target.value })}
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm col-span-2" />
                <input type="date" value={newPatient.birth_date}
                  onChange={e => setNewPatient({ ...newPatient, birth_date: e.target.value })}
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                <select value={newPatient.sex}
                  onChange={e => setNewPatient({ ...newPatient, sex: e.target.value })}
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm">
                  <option value="">Sexo</option>
                  <option value="masculino">Masculino</option>
                  <option value="femenino">Femenino</option>
                  <option value="otro">Otro</option>
                </select>
              </div>
              <button type="submit" disabled={creatingPatient}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
                {creatingPatient ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                Crear paciente y continuar
              </button>
            </form>
          )}

          {/* ── Paso 2: Fecha + modalidad ───────────────────────────────── */}
          {step === 2 && (
            <>
              <div className="bg-slate-50 rounded-lg p-3 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-teal-500" />
                <span className="text-sm text-slate-700">Paciente: <strong>{selectedPatient?.full_name}</strong></span>
                <button onClick={() => { setSelectedPatient(null); setStep(1) }}
                  className="ml-auto text-xs text-slate-400 hover:text-slate-600">cambiar</button>
              </div>
              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Fecha y hora</label>
              <input type="datetime-local" value={scheduledAt.slice(0,16)}
                onChange={e => setScheduledAt(new Date(e.target.value).toISOString())}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
              <div className="flex gap-2">
                <button onClick={() => setMode('presencial')}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold ${mode === 'presencial' ? 'bg-teal-500 text-white' : 'bg-slate-100 text-slate-600'}`}>
                  Presencial
                </button>
                <button onClick={() => setMode('online')}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold ${mode === 'online' ? 'bg-teal-500 text-white' : 'bg-slate-100 text-slate-600'}`}>
                  Online
                </button>
              </div>
              <div className="flex justify-between">
                <button onClick={() => setStep(1)} className="text-sm text-slate-500">← Atrás</button>
                <button onClick={() => setStep(3)} disabled={!canStep3}
                  className="px-3 py-1.5 bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
                  Continuar →
                </button>
              </div>
            </>
          )}

          {/* ── Paso 3: Plan + pago ─────────────────────────────────────── */}
          {step === 3 && (
            <>
              {packages.length > 0 && (
                <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-semibold text-violet-800 uppercase tracking-wider">Paquete activo disponible</p>
                  {packages.map(p => (
                    <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" checked={usePackage === p.id}
                        onChange={() => setUsePackage(usePackage === p.id ? null : p.id)}
                        className="accent-violet-600" />
                      <span className="text-sm text-slate-900">{p.plan_name} — queda {p.total_sessions - p.used_sessions} de {p.total_sessions}</span>
                    </label>
                  ))}
                </div>
              )}
              {!usePackage && (
                <>
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Tipo de consulta</label>
                  <select value={selectedPlan?.id || ''}
                    onChange={e => setSelectedPlan(pricingPlans.find(p => p.id === e.target.value) || null)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
                    {pricingPlans.length === 0 && <option value="">Consulta General — $20</option>}
                    {pricingPlans.map(p => (
                      <option key={p.id} value={p.id}>{p.name} — ${p.price_usd}</option>
                    ))}
                  </select>

                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Método de pago</label>
                  <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
                    <option value="efectivo">Efectivo</option>
                    <option value="pago_movil">Pago Móvil</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="zelle">Zelle</option>
                    <option value="courtesy">Cortesía</option>
                  </select>
                </>
              )}
              <textarea value={chiefComplaint} onChange={e => setChiefComplaint(e.target.value)}
                placeholder="Motivo de consulta (opcional)" rows={2}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none" />
              <div className="flex justify-between">
                <button onClick={() => setStep(2)} className="text-sm text-slate-500">← Atrás</button>
                <button onClick={() => setStep(4)} disabled={!canStep4}
                  className="px-3 py-1.5 bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
                  Continuar →
                </button>
              </div>
            </>
          )}

          {/* ── Paso 4: Confirmación ────────────────────────────────────── */}
          {step === 4 && (
            <>
              <div className="bg-slate-50 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Paciente:</span><strong>{selectedPatient?.full_name}</strong></div>
                <div className="flex justify-between"><span className="text-slate-500">Fecha:</span><strong>{new Date(scheduledAt).toLocaleString('es-VE')}</strong></div>
                <div className="flex justify-between"><span className="text-slate-500">Modalidad:</span><strong>{mode}</strong></div>
                {usePackage ? (
                  <div className="flex justify-between"><span className="text-slate-500">Pago:</span><strong className="text-violet-600">Con paquete</strong></div>
                ) : (
                  <>
                    <div className="flex justify-between"><span className="text-slate-500">Plan:</span><strong>{selectedPlan?.name}</strong></div>
                    <div className="flex justify-between"><span className="text-slate-500">Monto:</span><strong>${selectedPlan?.price_usd || 20}</strong></div>
                    <div className="flex justify-between"><span className="text-slate-500">Pago:</span><strong>{paymentMethod}</strong></div>
                  </>
                )}
              </div>
              <div className="flex justify-between">
                <button onClick={() => setStep(3)} className="text-sm text-slate-500">← Atrás</button>
                <button onClick={submit} disabled={loading}
                  className="flex items-center gap-2 px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Confirmar cita
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
