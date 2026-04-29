'use client'

/**
 * components/doctor/SubscriptionPanel.tsx
 *
 * Panel completo de suscripción del doctor.
 * Pattern: Stripe Customer Portal — todo en una sola card.
 *   - Estado actual (Beta / Activo / Por vencer / Vencido)
 *   - CTA "Comprar plan" → modal con duración + método + comprobante
 *   - Historial de pagos
 *
 * Se puede embeber en /doctor/settings (tab Suscripción), en
 * /doctor (dashboard banner cuando está vencido) o standalone.
 */

import { useEffect, useState, useCallback } from 'react'
import {
  CreditCard, Clock, AlertTriangle, CheckCircle2, Sparkles, Loader2,
  Upload, X, FileText, Copy, ExternalLink,
} from 'lucide-react'

type SubscriptionData = {
  state: {
    plan: string
    status: string
    expires_at: string | null
    days_remaining: number
    is_expired: boolean
    is_in_trial: boolean
  }
  pricing: {
    base_price_usd: number
    currency: string
    duration_options: Array<{
      duration_months: number
      base_price_usd: number
      final_price_usd: number
      discount_pct: number
      promotion_id: string | null
      label: string | null
    }>
  }
  payment_methods: {
    enabled: string[]
    config: Record<string, Record<string, string>>
  }
  stripe_enabled: boolean
  payments: Array<{
    id: string
    amount_usd: number
    duration_months: number
    method: string
    reference_number: string | null
    status: 'pending' | 'approved' | 'rejected'
    created_at: string
    rejection_reason: string | null
  }>
}

const METHOD_LABELS: Record<string, string> = {
  pago_movil:    'Pago Móvil',
  transferencia: 'Transferencia',
  zelle:         'Zelle',
  stripe:        'Tarjeta (Stripe)',
}

export default function SubscriptionPanel({ embedded = false }: { embedded?: boolean }) {
  const [data, setData] = useState<SubscriptionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showCheckout, setShowCheckout] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/doctor/subscription', { cache: 'no-store' })
      const j = await r.json()
      if (r.ok) setData(j)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading || !data) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
        <Loader2 className="w-6 h-6 animate-spin text-slate-300 mx-auto" />
      </div>
    )
  }

  const { state, payments } = data
  const expiresStr = state.expires_at
    ? new Date(state.expires_at).toLocaleDateString('es-VE', { day: 'numeric', month: 'long', year: 'numeric' })
    : null

  // Calcular el "tono" de la card según el estado
  const tone = state.is_expired ? 'red'
    : state.days_remaining <= 7 ? 'amber'
    : state.is_in_trial ? 'blue'
    : 'emerald'

  const toneClasses = {
    red:     { bg: 'from-red-50 to-rose-50',         border: 'border-red-200',     icon: 'text-red-500',     label: 'bg-red-100 text-red-700' },
    amber:   { bg: 'from-amber-50 to-orange-50',     border: 'border-amber-200',   icon: 'text-amber-600',   label: 'bg-amber-100 text-amber-700' },
    blue:    { bg: 'from-blue-50 to-cyan-50',        border: 'border-blue-200',    icon: 'text-blue-600',    label: 'bg-blue-100 text-blue-700' },
    emerald: { bg: 'from-emerald-50 to-teal-50',     border: 'border-emerald-200', icon: 'text-emerald-600', label: 'bg-emerald-100 text-emerald-700' },
  }[tone]

  const stateLabel = state.is_expired ? 'Vencida'
    : state.is_in_trial ? 'Beta Privada'
    : state.status === 'suspended' ? 'Suspendida'
    : state.status === 'active' ? 'Activa'
    : state.status

  const stateMessage = state.is_expired
    ? `Tu suscripción venció el ${expiresStr}. Compra un plan para reactivar tu cuenta.`
    : state.is_in_trial
    ? `Tu acceso gratis termina el ${expiresStr}. Compra un plan antes para no perder acceso.`
    : state.days_remaining <= 7
    ? `Tu suscripción vence en ${state.days_remaining} día${state.days_remaining === 1 ? '' : 's'} (${expiresStr}). Renueva para no interrumpir tu servicio.`
    : `Suscripción activa hasta el ${expiresStr}.`

  return (
    <div className={embedded ? 'space-y-5' : 'max-w-3xl mx-auto space-y-5'}>
      {/* ── Estado actual ─────────────────────────────────────────────── */}
      <div className={`bg-gradient-to-br ${toneClasses.bg} border ${toneClasses.border} rounded-2xl p-6 space-y-4`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center">
              <CreditCard className={`w-6 h-6 ${toneClasses.icon}`} />
            </div>
            <div>
              <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${toneClasses.label}`}>
                {stateLabel}
              </span>
              <h2 className="text-xl font-bold text-slate-900 mt-1">Tu Suscripción</h2>
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-black text-slate-900">{state.days_remaining}</div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">días restantes</div>
          </div>
        </div>

        <p className="text-sm text-slate-700">{stateMessage}</p>

        {/* Barra de progreso */}
        {state.is_in_trial && state.days_remaining > 0 && (
          <div className="w-full bg-white/70 rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-teal-400 to-cyan-500 transition-all"
              style={{ width: `${Math.min(100, Math.max(5, (state.days_remaining / 365) * 100))}%` }}
            />
          </div>
        )}

        <button
          onClick={() => setShowCheckout(true)}
          className="w-full py-3 bg-gradient-to-r from-teal-500 to-cyan-600 text-white rounded-xl font-bold text-sm hover:opacity-95 transition flex items-center justify-center gap-2 shadow-sm"
        >
          <Sparkles className="w-4 h-4" />
          {state.is_expired ? 'Comprar plan ahora' : state.is_in_trial ? 'Adquirir mi plan' : 'Renovar / Extender'}
        </button>
      </div>

      {/* ── Historial de pagos ──────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h3 className="font-bold text-slate-900 mb-3">Historial de pagos</h3>
        {payments.length === 0 ? (
          <p className="text-sm text-slate-400 italic text-center py-6">Aún no has realizado pagos.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {payments.map(p => {
              const statusBadge = p.status === 'approved'
                ? { cls: 'bg-emerald-100 text-emerald-700', icon: <CheckCircle2 className="w-3 h-3" />, label: 'Aprobado' }
                : p.status === 'rejected'
                ? { cls: 'bg-red-100 text-red-700', icon: <X className="w-3 h-3" />, label: 'Rechazado' }
                : { cls: 'bg-amber-100 text-amber-700', icon: <Clock className="w-3 h-3" />, label: 'Pendiente' }
              return (
                <div key={p.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800 text-sm">${p.amount_usd} USD</span>
                      <span className="text-xs text-slate-500">·</span>
                      <span className="text-xs text-slate-500">{p.duration_months} mes{p.duration_months > 1 ? 'es' : ''}</span>
                      <span className="text-xs text-slate-500">·</span>
                      <span className="text-xs text-slate-500">{METHOD_LABELS[p.method] || p.method}</span>
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {new Date(p.created_at).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' })}
                      {p.reference_number && <span className="font-mono ml-2">#{p.reference_number}</span>}
                    </div>
                    {p.rejection_reason && <div className="text-xs text-red-600 mt-1 italic">Motivo: {p.rejection_reason}</div>}
                  </div>
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${statusBadge.cls}`}>
                    {statusBadge.icon} {statusBadge.label}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showCheckout && (
        <CheckoutModal data={data} onClose={() => { setShowCheckout(false); load() }} />
      )}
    </div>
  )
}

// ─── CheckoutModal ──────────────────────────────────────────────────────────
function CheckoutModal({ data, onClose }: { data: SubscriptionData; onClose: () => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [duration, setDuration] = useState(data.pricing.duration_options[0])
  const [method, setMethod] = useState<string>(data.payment_methods.enabled[0] || 'pago_movil')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [receipt, setReceipt] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  const config = data.payment_methods.config[method] || {}

  async function submit() {
    if (!reference.trim()) {
      alert('Ingresa el número de referencia o comprobante')
      return
    }
    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append('duration_months', String(duration.duration_months))
      fd.append('method', method)
      fd.append('reference_number', reference)
      fd.append('amount_usd', String(duration.final_price_usd))
      if (notes) fd.append('notes', notes)
      if (duration.promotion_id) fd.append('promotion_id', duration.promotion_id)
      if (receipt) fd.append('receipt', receipt)
      const r = await fetch('/api/doctor/subscription/checkout', { method: 'POST', body: fd })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error)
      setSuccess(true)
    } catch (e: any) {
      alert(`Error: ${e.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 text-center" onClick={e => e.stopPropagation()}>
          <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Comprobante enviado</h2>
          <p className="text-sm text-slate-600">
            Recibimos tu pago. El admin verificará el comprobante en breve y tu suscripción quedará activa por
            <strong> {duration.duration_months} mes{duration.duration_months > 1 ? 'es' : ''}</strong>. Te llegará una notificación cuando se apruebe.
          </p>
          <button onClick={onClose} className="w-full py-2.5 bg-teal-500 text-white rounded-xl font-bold text-sm hover:bg-teal-600">
            Entendido
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-slate-900">Adquirir plan</h2>
            <p className="text-xs text-slate-500">Paso {step} de 3</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* PASO 1: Duración */}
          {step === 1 && (
            <>
              <h3 className="font-bold text-slate-800">Selecciona la duración</h3>
              <div className="space-y-2">
                {data.pricing.duration_options.map(opt => (
                  <label
                    key={`${opt.duration_months}-${opt.promotion_id || 'base'}`}
                    className={`block p-4 rounded-xl border-2 cursor-pointer transition ${
                      duration.duration_months === opt.duration_months && duration.promotion_id === opt.promotion_id
                        ? 'border-teal-500 bg-teal-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="duration"
                        checked={duration.duration_months === opt.duration_months && duration.promotion_id === opt.promotion_id}
                        onChange={() => setDuration(opt)}
                        className="accent-teal-500"
                      />
                      <div className="flex-1">
                        <div className="font-bold text-slate-900">
                          {opt.label || `${opt.duration_months} mes${opt.duration_months > 1 ? 'es' : ''}`}
                          {opt.discount_pct > 0 && (
                            <span className="ml-2 text-xs font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">
                              −{opt.discount_pct}% OFF
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          ${(opt.final_price_usd / opt.duration_months).toFixed(2)} USD/mes
                        </div>
                      </div>
                      <div className="text-right">
                        {opt.discount_pct > 0 && (
                          <div className="text-xs text-slate-400 line-through">${opt.base_price_usd}</div>
                        )}
                        <div className="text-xl font-bold text-slate-900">${opt.final_price_usd}</div>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
              <button onClick={() => setStep(2)} className="w-full py-2.5 bg-teal-500 text-white rounded-xl font-bold text-sm hover:bg-teal-600">
                Continuar
              </button>
            </>
          )}

          {/* PASO 2: Método */}
          {step === 2 && (
            <>
              <h3 className="font-bold text-slate-800">Método de pago</h3>
              <div className="grid grid-cols-1 gap-2">
                {data.payment_methods.enabled.map(m => (
                  <label
                    key={m}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer ${
                      method === m ? 'border-teal-500 bg-teal-50' : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <input type="radio" name="method" checked={method === m} onChange={() => setMethod(m)} className="accent-teal-500" />
                    <span className="font-semibold text-slate-800 text-sm">{METHOD_LABELS[m] || m}</span>
                  </label>
                ))}
              </div>

              {/* Datos del admin */}
              {Object.keys(config).length > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Datos para el pago:</p>
                  {Object.entries(config).map(([k, v]) => (
                    v ? (
                      <div key={k} className="flex items-center justify-between gap-2 text-sm">
                        <span className="text-slate-500 capitalize">{k}:</span>
                        <span className="font-mono text-slate-800 truncate">{v}</span>
                        <button
                          onClick={() => navigator.clipboard?.writeText(v).catch(() => {})}
                          className="text-teal-600 hover:text-teal-800"
                          title="Copiar"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : null
                  ))}
                </div>
              )}

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                <p className="text-xs text-blue-700">
                  Total a pagar: <strong className="text-base">${duration.final_price_usd} USD</strong> ({duration.duration_months} {duration.duration_months > 1 ? 'meses' : 'mes'})
                </p>
              </div>

              <div className="flex gap-2">
                <button onClick={() => setStep(1)} className="flex-1 py-2.5 border border-slate-200 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-50">Atrás</button>
                <button onClick={() => setStep(3)} className="flex-1 py-2.5 bg-teal-500 text-white rounded-xl font-bold text-sm hover:bg-teal-600">Ya pagué</button>
              </div>
            </>
          )}

          {/* PASO 3: Comprobante */}
          {step === 3 && (
            <>
              <h3 className="font-bold text-slate-800">Sube tu comprobante</h3>
              <p className="text-xs text-slate-500">El admin verificará el pago y activará tu suscripción.</p>

              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Número de referencia *</label>
                <input
                  value={reference}
                  onChange={e => setReference(e.target.value)}
                  placeholder="Ej: 0123456 o últimos 4 dígitos"
                  className="mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Comprobante (imagen o PDF)</label>
                <label className="mt-1 flex items-center justify-center gap-2 p-4 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50">
                  <input type="file" accept="image/*,application/pdf" onChange={e => setReceipt(e.target.files?.[0] || null)} className="hidden" />
                  <Upload className="w-4 h-4 text-slate-400" />
                  <span className="text-xs text-slate-600">{receipt ? receipt.name : 'Click para subir (max 5 MB)'}</span>
                </label>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Notas (opcional)</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={2}
                  className="mt-1 w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none resize-none"
                />
              </div>

              <div className="flex gap-2">
                <button onClick={() => setStep(2)} className="flex-1 py-2.5 border border-slate-200 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-50">Atrás</button>
                <button
                  onClick={submit}
                  disabled={submitting || !reference.trim()}
                  className="flex-1 py-2.5 bg-emerald-500 text-white rounded-xl font-bold text-sm hover:bg-emerald-600 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {submitting ? 'Enviando...' : 'Enviar comprobante'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
