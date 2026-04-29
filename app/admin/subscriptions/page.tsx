'use client'

/**
 * /admin/subscriptions
 *
 * Centro de control de suscripciones de los doctores.
 * Tres pestañas, inspirado en el dashboard de billing de Stripe:
 *   1. Doctores → lista con filtros (vencidos, por vencer, en trial, suspendidos).
 *   2. Comprobantes → cola de aprobación de pagos manuales.
 *   3. Configuración → precio base, duración beta, métodos de pago, descuentos.
 */

import { useEffect, useState, useCallback } from 'react'
import {
  CreditCard, Users, Search, Filter, Clock, CheckCircle2, XCircle,
  AlertTriangle, Plus, Settings as SettingsIcon, RefreshCw, Loader2,
  FileText, Eye, Pause, Play, Calendar, DollarSign, Percent,
} from 'lucide-react'

type DoctorRow = {
  doctor_id: string
  doctor_name: string
  doctor_email: string
  specialty: string | null
  plan: string | null
  status: string | null
  current_period_end: string | null
  days_remaining: number
  is_expired: boolean
  expiring_soon: boolean
  is_in_trial: boolean
}

type PaymentRow = {
  id: string
  doctor_id: string
  amount_usd: number
  duration_months: number
  method: string
  reference_number: string | null
  receipt_url: string | null
  status: 'pending' | 'approved' | 'rejected'
  notes: string | null
  rejection_reason: string | null
  created_at: string
  reviewed_at: string | null
  profiles: { full_name: string; email: string; specialty: string | null } | null
}

type AppSettings = {
  subscription_base_price_usd: number
  subscription_currency: string
  beta_duration_days: number
  payment_methods_enabled: string[]
  payment_methods_config: Record<string, Record<string, string>>
  stripe_enabled: boolean
  expiration_warning_days: number[]
  sales_whatsapp_number: string
  sales_whatsapp_message: string
}

type Promotion = {
  id: string
  plan_key: string
  duration_months: number
  original_price_usd: number
  promo_price_usd: number
  label: string | null
  is_active: boolean
  ends_at: string | null
}

const STATUS_BADGES: Record<string, { label: string; cls: string }> = {
  active:    { label: 'Activo',     cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  trial:     { label: 'Trial',      cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  past_due:  { label: 'Vencido',    cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  suspended: { label: 'Suspendido', cls: 'bg-red-50 text-red-700 border-red-200' },
  cancelled: { label: 'Cancelado',  cls: 'bg-slate-100 text-slate-500 border-slate-200' },
}

export default function AdminSubscriptionsPage() {
  const [tab, setTab] = useState<'doctors' | 'payments' | 'config'>('doctors')

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-teal-400 to-cyan-600 flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Suscripciones</h1>
            <p className="text-sm text-slate-500">Gestión de planes, comprobantes y configuración global</p>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {([
          { key: 'doctors',  label: 'Doctores',     icon: Users },
          { key: 'payments', label: 'Comprobantes', icon: FileText },
          { key: 'config',   label: 'Configuración', icon: SettingsIcon },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
              tab === t.key
                ? 'border-teal-500 text-teal-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'doctors'  && <DoctorsTab />}
      {tab === 'payments' && <PaymentsTab />}
      {tab === 'config'   && <ConfigTab />}
    </div>
  )
}

// ─── DOCTORS TAB ────────────────────────────────────────────────────────────
function DoctorsTab() {
  const [doctors, setDoctors] = useState<DoctorRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('')
  const [search, setSearch] = useState('')
  const [actioning, setActioning] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const url = new URL('/api/admin/subscriptions', window.location.origin)
    if (filter) url.searchParams.set('filter', filter)
    if (search.trim()) url.searchParams.set('search', search.trim())
    try {
      const r = await fetch(url.toString())
      const j = await r.json()
      if (r.ok) setDoctors(j.doctors || [])
    } finally {
      setLoading(false)
    }
  }, [filter, search])

  useEffect(() => { load() }, [load])

  async function extendDoctor(doctor_id: string, doctor_name: string) {
    const months = prompt(`Extender suscripción de ${doctor_name}\n\n¿Cuántos meses?`, '1')
    if (!months) return
    const m = Number(months)
    if (!Number.isFinite(m) || m < 1 || m > 36) return alert('Entre 1 y 36 meses')
    const reason = prompt('Razón / nota (opcional)') || undefined

    setActioning(doctor_id)
    try {
      const r = await fetch('/api/admin/subscriptions/extend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doctor_id, months: m, reason }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error)
      alert(`✓ Extendido. Nueva fecha: ${new Date(j.new_expires_at).toLocaleDateString('es-VE')}`)
      load()
    } catch (e: any) {
      alert(`Error: ${e.message}`)
    } finally {
      setActioning(null)
    }
  }

  async function suspendDoctor(doctor_id: string, doctor_name: string) {
    const reason = prompt(`Suspender a ${doctor_name}.\n\nRazón:`)
    if (reason === null) return
    setActioning(doctor_id)
    try {
      const r = await fetch('/api/admin/subscriptions/suspend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doctor_id, reason }),
      })
      if (!r.ok) throw new Error((await r.json()).error)
      load()
    } catch (e: any) {
      alert(`Error: ${e.message}`)
    } finally {
      setActioning(null)
    }
  }

  async function reactivateDoctor(doctor_id: string) {
    if (!confirm('¿Reactivar suscripción?')) return
    setActioning(doctor_id)
    try {
      const r = await fetch('/api/admin/subscriptions/reactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doctor_id }),
      })
      if (!r.ok) throw new Error((await r.json()).error)
      load()
    } catch (e: any) {
      alert(`Error: ${e.message}`)
    } finally {
      setActioning(null)
    }
  }

  return (
    <>
      {/* Filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[240px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre o email…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none bg-white"
          />
        </div>
        {[
          { key: '',          label: 'Todos' },
          { key: 'expiring',  label: 'Por vencer (7d)' },
          { key: 'expired',   label: 'Vencidos' },
          { key: 'trial',     label: 'En trial' },
          { key: 'active',    label: 'Activos' },
          { key: 'suspended', label: 'Suspendidos' },
        ].map(f => (
          <button
            key={f.key || 'all'}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border ${
              filter === f.key
                ? 'bg-teal-500 text-white border-teal-500'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {f.label}
          </button>
        ))}
        <button onClick={load} className="ml-auto p-2 text-slate-500 hover:text-slate-800" title="Recargar">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Tabla */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-slate-300 mx-auto" /></div>
        ) : doctors.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">Sin doctores que coincidan con el filtro.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 text-left">Doctor</th>
                  <th className="px-4 py-3 text-left">Estado</th>
                  <th className="px-4 py-3 text-left">Plan</th>
                  <th className="px-4 py-3 text-right">Días restantes</th>
                  <th className="px-4 py-3 text-left">Vence</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {doctors.map(d => {
                  const badge = STATUS_BADGES[d.status || 'trial'] || STATUS_BADGES.trial
                  return (
                    <tr key={d.doctor_id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{d.doctor_name || '—'}</div>
                        <div className="text-xs text-slate-500">{d.doctor_email}</div>
                        {d.specialty && <div className="text-xs text-teal-600 mt-0.5">{d.specialty}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${badge.cls}`}>
                          {badge.label}
                        </span>
                        {d.expiring_soon && (
                          <span className="block mt-1 text-xs text-orange-600 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Vence pronto
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-700 capitalize">{d.plan || '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-bold ${d.days_remaining === 0 ? 'text-red-600' : d.days_remaining < 7 ? 'text-orange-600' : 'text-slate-700'}`}>
                          {d.days_remaining}
                        </span>
                        <span className="text-xs text-slate-400 ml-1">días</span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 text-xs">
                        {d.current_period_end
                          ? new Date(d.current_period_end).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' })
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => extendDoctor(d.doctor_id, d.doctor_name)}
                            disabled={actioning === d.doctor_id}
                            title="Extender N meses"
                            className="p-1.5 text-teal-600 hover:bg-teal-50 rounded-md disabled:opacity-40"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                          {d.status === 'suspended' ? (
                            <button
                              onClick={() => reactivateDoctor(d.doctor_id)}
                              disabled={actioning === d.doctor_id}
                              title="Reactivar"
                              className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-md disabled:opacity-40"
                            >
                              <Play className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
                              onClick={() => suspendDoctor(d.doctor_id, d.doctor_name)}
                              disabled={actioning === d.doctor_id}
                              title="Suspender"
                              className="p-1.5 text-red-500 hover:bg-red-50 rounded-md disabled:opacity-40"
                            >
                              <Pause className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}

// ─── PAYMENTS TAB ───────────────────────────────────────────────────────────
function PaymentsTab() {
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected'>('pending')
  const [loading, setLoading] = useState(true)
  const [actioning, setActioning] = useState<string | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/admin/payments?status=${statusFilter}`)
      const j = await r.json()
      if (r.ok) setPayments(j.payments || [])
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => { load() }, [load])

  async function approve(id: string, doctorName: string, months: number) {
    if (!confirm(`Aprobar pago de ${doctorName}?\nSe extenderá la suscripción por ${months} mes${months > 1 ? 'es' : ''}.`)) return
    setActioning(id)
    try {
      const r = await fetch('/api/admin/payments/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_id: id }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error)
      alert(`✓ Aprobado. Nueva expiración: ${new Date(j.new_expires_at).toLocaleDateString('es-VE')}`)
      load()
    } catch (e: any) {
      alert(`Error: ${e.message}`)
    } finally {
      setActioning(null)
    }
  }

  async function reject(id: string) {
    const reason = prompt('Razón del rechazo:')
    if (!reason) return
    setActioning(id)
    try {
      const r = await fetch('/api/admin/payments/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_id: id, reason }),
      })
      if (!r.ok) throw new Error((await r.json()).error)
      load()
    } catch (e: any) {
      alert(`Error: ${e.message}`)
    } finally {
      setActioning(null)
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        {(['pending', 'approved', 'rejected'] as const).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border capitalize ${
              statusFilter === s
                ? 'bg-teal-500 text-white border-teal-500'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {s === 'pending' ? 'Pendientes' : s === 'approved' ? 'Aprobados' : 'Rechazados'}
          </button>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-slate-300 mx-auto" /></div>
        ) : payments.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">Sin comprobantes en este estado.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {payments.map(p => (
              <div key={p.id} className="p-4 flex items-center gap-4 hover:bg-slate-50">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900 truncate">{p.profiles?.full_name || '—'}</span>
                    <span className="text-xs text-slate-500">{p.profiles?.email}</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1 flex items-center gap-3 flex-wrap">
                    <span><DollarSign className="w-3 h-3 inline" />{p.amount_usd} USD</span>
                    <span><Calendar className="w-3 h-3 inline" /> {p.duration_months} mes{p.duration_months > 1 ? 'es' : ''}</span>
                    <span className="capitalize">{p.method.replace('_', ' ')}</span>
                    <span className="font-mono">{p.reference_number || '—'}</span>
                    <span className="text-slate-400">{new Date(p.created_at).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  {p.notes && <div className="text-xs text-slate-600 mt-1 italic">"{p.notes}"</div>}
                  {p.rejection_reason && <div className="text-xs text-red-600 mt-1">Rechazado: {p.rejection_reason}</div>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {p.receipt_url && (
                    <button
                      onClick={() => setPreviewId(p.id)}
                      title="Ver comprobante"
                      className="p-2 text-slate-500 hover:bg-slate-100 rounded-md"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  )}
                  {p.status === 'pending' && (
                    <>
                      <button
                        onClick={() => approve(p.id, p.profiles?.full_name || 'doctor', p.duration_months)}
                        disabled={actioning === p.id}
                        className="px-3 py-1.5 text-xs font-semibold bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:opacity-50 flex items-center gap-1"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Aprobar
                      </button>
                      <button
                        onClick={() => reject(p.id)}
                        disabled={actioning === p.id}
                        className="px-3 py-1.5 text-xs font-semibold bg-white border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50 flex items-center gap-1"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Rechazar
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {previewId && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setPreviewId(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-slate-900">Comprobante</h3>
              <button onClick={() => setPreviewId(null)} className="text-slate-400 hover:text-slate-700">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto bg-slate-100 flex items-center justify-center p-4">
              <iframe
                src={`/api/doctor/subscription/receipt/${previewId}`}
                title="Comprobante"
                className="w-full h-[70vh] bg-white rounded-md"
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ─── CONFIG TAB ─────────────────────────────────────────────────────────────
function ConfigTab() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  // Form fields para nueva promoción
  const [newPromo, setNewPromo] = useState({ duration_months: 3, original_price_usd: 90, promo_price_usd: 75, label: '' })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [sRes, pRes] = await Promise.all([
        fetch('/api/admin/app-settings').then(r => r.json()),
        fetch('/api/admin/promotions').then(r => r.json()),
      ])
      if (sRes.settings) setSettings(sRes.settings)
      if (Array.isArray(pRes)) setPromotions(pRes)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function save(updates: Partial<AppSettings>) {
    setSaving(true); setMsg(null)
    try {
      const r = await fetch('/api/admin/app-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error)
      setSettings(j.settings)
      setMsg('✓ Guardado')
      setTimeout(() => setMsg(null), 2000)
    } catch (e: any) {
      setMsg(`Error: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  async function createPromotion() {
    if (newPromo.promo_price_usd >= newPromo.original_price_usd) {
      alert('El precio promocional debe ser menor al original')
      return
    }
    setSaving(true)
    try {
      const r = await fetch('/api/admin/promotions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan_key: 'basic',
          duration_months: newPromo.duration_months,
          original_price_usd: newPromo.original_price_usd,
          promo_price_usd: newPromo.promo_price_usd,
          label: newPromo.label || `${newPromo.duration_months} meses`,
          is_active: true,
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error)
      load()
      setNewPromo({ duration_months: 3, original_price_usd: 90, promo_price_usd: 75, label: '' })
    } catch (e: any) {
      alert(`Error: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  async function togglePromo(p: Promotion) {
    setSaving(true)
    try {
      await fetch('/api/admin/promotions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: p.id, is_active: !p.is_active }),
      })
      load()
    } finally { setSaving(false) }
  }

  async function deletePromo(p: Promotion) {
    if (!confirm(`¿Eliminar promoción "${p.label}"?`)) return
    await fetch(`/api/admin/promotions?id=${p.id}`, { method: 'DELETE' })
    load()
  }

  if (loading || !settings) return <div className="p-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-slate-300 mx-auto" /></div>

  return (
    <div className="grid lg:grid-cols-2 gap-5">
      {/* Precio base + duración beta */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-teal-500" />
          <h2 className="font-bold text-slate-900">Precio y trial</h2>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Precio mensual base (USD)</label>
          <input
            type="number" min={0} step="0.01"
            defaultValue={settings.subscription_base_price_usd}
            onBlur={e => save({ subscription_base_price_usd: Number(e.target.value) })}
            className="mt-1.5 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
          />
          <p className="text-xs text-slate-400 mt-1">Aplicable inmediatamente a nuevas compras. No retroactivo.</p>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Duración del trial Beta (días)</label>
          <input
            type="number" min={0} max={3650}
            defaultValue={settings.beta_duration_days}
            onBlur={e => save({ beta_duration_days: Number(e.target.value) })}
            className="mt-1.5 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
          />
          <p className="text-xs text-slate-400 mt-1">Se aplica solo a nuevos registros. {settings.beta_duration_days} días ≈ {Math.round(settings.beta_duration_days / 30)} meses.</p>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Días de aviso de vencimiento</label>
          <input
            type="text"
            defaultValue={settings.expiration_warning_days.join(',')}
            onBlur={e => save({ expiration_warning_days: e.target.value.split(',').map(s => Number(s.trim())).filter(Boolean) })}
            placeholder="7,3,1"
            className="mt-1.5 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
          />
          <p className="text-xs text-slate-400 mt-1">Coma-separados. Ej: "7,3,1" notifica 7, 3 y 1 día antes.</p>
        </div>
      </div>

      {/* Métodos de pago */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-teal-500" />
          <h2 className="font-bold text-slate-900">Métodos de pago habilitados</h2>
        </div>
        <p className="text-xs text-slate-500">Estos son los métodos que el doctor verá al pagar su suscripción.</p>
        {[
          { key: 'pago_movil',    label: 'Pago Móvil',    fields: [['phone','Teléfono'], ['cedula','Cédula'], ['bank','Banco']] },
          { key: 'transferencia', label: 'Transferencia', fields: [['bank','Banco'], ['account','Nro de cuenta'], ['holder','Titular']] },
          { key: 'zelle',         label: 'Zelle',         fields: [['email','Email Zelle'], ['holder','Titular']] },
          { key: 'stripe',        label: 'Stripe (próximamente)', fields: [] as [string,string][] },
        ].map(m => {
          const enabled = settings.payment_methods_enabled.includes(m.key)
          const config = settings.payment_methods_config[m.key] || {}
          return (
            <div key={m.key} className="border border-slate-200 rounded-lg p-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enabled}
                  disabled={m.key === 'stripe'}
                  onChange={e => {
                    const next = e.target.checked
                      ? [...settings.payment_methods_enabled, m.key]
                      : settings.payment_methods_enabled.filter(k => k !== m.key)
                    save({ payment_methods_enabled: next })
                  }}
                  className="w-4 h-4 accent-teal-500"
                />
                <span className="font-semibold text-slate-800 text-sm">{m.label}</span>
              </label>
              {enabled && m.fields.length > 0 && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {m.fields.map(([fkey, flabel]) => (
                    <input
                      key={fkey}
                      type="text"
                      placeholder={flabel}
                      defaultValue={config[fkey] || ''}
                      onBlur={e => {
                        const next = { ...settings.payment_methods_config, [m.key]: { ...config, [fkey]: e.target.value } }
                        save({ payment_methods_config: next as any })
                      }}
                      className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-md focus:ring-1 focus:ring-teal-500 outline-none"
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* WhatsApp ventas (landing page) */}
      <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-emerald-500" />
          <h2 className="font-bold text-slate-900">Botón "Hablar con ventas" del landing</h2>
        </div>
        <p className="text-xs text-slate-500">
          El landing page muestra un botón "Hablar con ventas" que abre WhatsApp con un mensaje
          pre-rellenado. Configura aquí el número (con código país, sin <code>+</code>) y el mensaje.
        </p>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Número WhatsApp</label>
            <input
              type="text"
              defaultValue={settings.sales_whatsapp_number}
              onBlur={e => save({ sales_whatsapp_number: e.target.value.replace(/\D/g, '') })}
              placeholder="584141234567"
              className="mt-1.5 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none font-mono"
            />
            <p className="text-xs text-slate-400 mt-1">Sin "+" ni espacios. Ej: 584141234567</p>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Mensaje pre-rellenado</label>
            <input
              type="text"
              defaultValue={settings.sales_whatsapp_message}
              onBlur={e => save({ sales_whatsapp_message: e.target.value })}
              placeholder="Hola, vengo de la web…"
              className="mt-1.5 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
            />
          </div>
        </div>
        {settings.sales_whatsapp_number && (
          <a
            href={`https://wa.me/${settings.sales_whatsapp_number.replace(/\D/g, '')}?text=${encodeURIComponent(settings.sales_whatsapp_message)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-teal-600 hover:underline"
          >
            🔗 Probar link →
          </a>
        )}
      </div>

      {/* Promociones multi-mes */}
      <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Percent className="w-5 h-5 text-teal-500" />
          <h2 className="font-bold text-slate-900">Descuentos por duración</h2>
        </div>
        <p className="text-xs text-slate-500">Define paquetes de varios meses con precio promocional. Ej: 3 meses por $75 (en lugar de $90).</p>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end p-3 bg-slate-50 rounded-lg">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase">Meses</label>
            <input type="number" min={2} max={36} value={newPromo.duration_months} onChange={e => setNewPromo(p => ({...p, duration_months: Number(e.target.value)}))} className="mt-1 w-full px-2 py-1.5 border border-slate-200 rounded-md text-sm" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase">Precio normal</label>
            <input type="number" min={0} step="0.01" value={newPromo.original_price_usd} onChange={e => setNewPromo(p => ({...p, original_price_usd: Number(e.target.value)}))} className="mt-1 w-full px-2 py-1.5 border border-slate-200 rounded-md text-sm" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase">Precio promo</label>
            <input type="number" min={0} step="0.01" value={newPromo.promo_price_usd} onChange={e => setNewPromo(p => ({...p, promo_price_usd: Number(e.target.value)}))} className="mt-1 w-full px-2 py-1.5 border border-slate-200 rounded-md text-sm" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase">Etiqueta (op)</label>
            <input type="text" value={newPromo.label} onChange={e => setNewPromo(p => ({...p, label: e.target.value}))} placeholder="Trimestral" className="mt-1 w-full px-2 py-1.5 border border-slate-200 rounded-md text-sm" />
          </div>
          <button onClick={createPromotion} disabled={saving} className="px-3 py-2 bg-teal-500 text-white rounded-md text-sm font-bold hover:bg-teal-600 disabled:opacity-50">
            <Plus className="w-4 h-4 inline mr-1" /> Agregar
          </button>
        </div>

        {promotions.length === 0 ? (
          <p className="text-xs text-slate-400 italic text-center py-4">Sin promociones configuradas. Solo plan mensual estará disponible.</p>
        ) : (
          <div className="space-y-2">
            {promotions.map(p => {
              const discount = p.original_price_usd > 0 ? Math.round(((p.original_price_usd - p.promo_price_usd) / p.original_price_usd) * 100) : 0
              return (
                <div key={p.id} className={`flex items-center gap-3 p-3 rounded-lg border ${p.is_active ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-200 bg-slate-50'}`}>
                  <div className="flex-1">
                    <div className="font-semibold text-slate-800">{p.label || `${p.duration_months} meses`}</div>
                    <div className="text-xs text-slate-500">
                      {p.duration_months} meses · <span className="line-through">${p.original_price_usd}</span> → <strong className="text-emerald-600">${p.promo_price_usd}</strong>
                      <span className="ml-2 text-emerald-600 font-bold">−{discount}%</span>
                    </div>
                  </div>
                  <button onClick={() => togglePromo(p)} className={`px-3 py-1 text-xs font-semibold rounded-md ${p.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                    {p.is_active ? 'Activa' : 'Inactiva'}
                  </button>
                  <button onClick={() => deletePromo(p)} className="text-red-500 hover:text-red-700 p-1.5">
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {msg && (
        <div className="lg:col-span-2 fixed top-6 left-1/2 -translate-x-1/2 px-4 py-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-sm font-semibold shadow-md">
          {msg}
        </div>
      )}
    </div>
  )
}
