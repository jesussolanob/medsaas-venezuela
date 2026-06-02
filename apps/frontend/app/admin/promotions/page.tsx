'use client'

import { useState, useEffect } from 'react'
import { Tag, Plus, Trash2, ToggleLeft, ToggleRight, Percent, Calendar, DollarSign } from 'lucide-react'

interface PlanConfig {
  plan_key: string
  name: string
  price: number
}

interface Promotion {
  id: string
  plan_key: string
  duration_months: number
  original_price_usd: number
  promo_price_usd: number
  label: string
  is_active: boolean
  ends_at: string | null
  created_at: string
  plan_configs?: PlanConfig
}

const PLAN_NAMES: Record<string, string> = {
  trial: 'Trial',
  basic: 'Basic',
  professional: 'Professional',
  clinic: 'Centro de Salud',
}

export default function PromotionsPage() {
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [plans, setPlans] = useState<PlanConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  // Form state
  const [formPlanKey, setFormPlanKey] = useState('')
  const [formMonths, setFormMonths] = useState(3)
  const [formOriginalPrice, setFormOriginalPrice] = useState('')
  const [formPromoPrice, setFormPromoPrice] = useState('')
  const [formLabel, setFormLabel] = useState('')
  const [formEndsAt, setFormEndsAt] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [promosRes, plansRes] = await Promise.all([
        fetch('/api/admin/promotions'),
        fetch('/api/plans'),
      ])

      const promosData = await promosRes.json()
      setPromotions(Array.isArray(promosData) ? promosData : [])

      const plansData = await plansRes.json()
      if (Array.isArray(plansData)) {
        setPlans(plansData.filter((p: PlanConfig) => p.plan_key !== 'trial'))
      }
    } catch (err) {
      console.error('Error loading data:', err)
    }
    setLoading(false)
  }

  function resetForm() {
    setFormPlanKey('')
    setFormMonths(3)
    setFormOriginalPrice('')
    setFormPromoPrice('')
    setFormLabel('')
    setFormEndsAt('')
    setShowForm(false)
  }

  // Auto-calculate original price when plan and months change
  useEffect(() => {
    if (formPlanKey && formMonths) {
      const plan = plans.find(p => p.plan_key === formPlanKey)
      if (plan) {
        setFormOriginalPrice(String(plan.price * formMonths))
      }
    }
  }, [formPlanKey, formMonths, plans])

  async function handleCreate() {
    if (!formPlanKey || !formOriginalPrice || !formPromoPrice) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/promotions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan_key: formPlanKey,
          duration_months: formMonths,
          original_price_usd: parseFloat(formOriginalPrice),
          promo_price_usd: parseFloat(formPromoPrice),
          label: formLabel || `Oferta ${formMonths} meses`,
          ends_at: formEndsAt || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        alert(err.error || 'Error al crear promoción')
      } else {
        resetForm()
        loadData()
      }
    } catch (err) {
      console.error(err)
    }
    setSaving(false)
  }

  async function togglePromo(id: string, currentActive: boolean) {
    try {
      await fetch('/api/admin/promotions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_active: !currentActive }),
      })
      loadData()
    } catch (err) {
      console.error(err)
    }
  }

  async function deletePromo(id: string) {
    if (!confirm('¿Eliminar esta promoción?')) return
    try {
      await fetch(`/api/admin/promotions?id=${id}`, { method: 'DELETE' })
      loadData()
    } catch (err) {
      console.error(err)
    }
  }

  const discount = (orig: number, promo: number) => Math.round(((orig - promo) / orig) * 100)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold text-slate-900">Promociones</h2>
          <p className="text-slate-500 text-xs sm:text-sm mt-1">Configura descuentos por suscripción multi-mes</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-teal-500 text-white text-sm font-semibold rounded-lg hover:bg-teal-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nueva Promoción
        </button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900">Nueva Promoción</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Plan */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Plan</label>
              <select
                value={formPlanKey}
                onChange={e => setFormPlanKey(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 outline-none"
              >
                <option value="">Seleccionar plan</option>
                {plans.map(p => (
                  <option key={p.plan_key} value={p.plan_key}>
                    {PLAN_NAMES[p.plan_key] || p.name} (${p.price}/mes)
                  </option>
                ))}
              </select>
            </div>

            {/* Duration */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Duración (meses)</label>
              <select
                value={formMonths}
                onChange={e => setFormMonths(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 outline-none"
              >
                <option value={2}>2 meses</option>
                <option value={3}>3 meses</option>
                <option value={6}>6 meses</option>
                <option value={12}>12 meses</option>
              </select>
            </div>

            {/* Label */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Etiqueta (opcional)</label>
              <input
                type="text"
                value={formLabel}
                onChange={e => setFormLabel(e.target.value)}
                placeholder="Ej: Oferta de lanzamiento"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 outline-none"
              />
            </div>

            {/* Original price */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Precio original (USD)</label>
              <input
                type="number"
                value={formOriginalPrice}
                onChange={e => setFormOriginalPrice(e.target.value)}
                placeholder="90"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 outline-none bg-slate-50"
                readOnly
              />
              <p className="text-[10px] text-slate-400 mt-0.5">Calculado automáticamente</p>
            </div>

            {/* Promo price */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Precio promocional (USD)</label>
              <input
                type="number"
                value={formPromoPrice}
                onChange={e => setFormPromoPrice(e.target.value)}
                placeholder="60"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 outline-none"
              />
              {formOriginalPrice && formPromoPrice && parseFloat(formPromoPrice) < parseFloat(formOriginalPrice) && (
                <p className="text-[10px] text-emerald-600 mt-0.5 font-semibold">
                  {discount(parseFloat(formOriginalPrice), parseFloat(formPromoPrice))}% de descuento
                </p>
              )}
            </div>

            {/* Ends at */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Vence (opcional)</label>
              <input
                type="date"
                value={formEndsAt}
                onChange={e => setFormEndsAt(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 outline-none"
              />
              <p className="text-[10px] text-slate-400 mt-0.5">Dejar vacío = sin fecha límite</p>
            </div>
          </div>

          {/* Preview */}
          {formPlanKey && formPromoPrice && formOriginalPrice && (
            <div className="bg-gradient-to-r from-teal-50 to-emerald-50 rounded-lg p-4 border border-teal-200">
              <p className="text-xs font-semibold text-teal-700 mb-1">Vista previa</p>
              <p className="text-sm text-slate-700">
                <span className="font-bold">{PLAN_NAMES[formPlanKey] || formPlanKey}</span> x {formMonths} meses:{' '}
                <span className="line-through text-slate-400">${formOriginalPrice}</span>{' '}
                <span className="font-bold text-teal-600">${formPromoPrice} USD</span>{' '}
                <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-semibold">
                  -{discount(parseFloat(formOriginalPrice), parseFloat(formPromoPrice))}%
                </span>
              </p>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button onClick={resetForm} className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
              Cancelar
            </button>
            <button
              onClick={handleCreate}
              disabled={saving || !formPlanKey || !formPromoPrice || !formOriginalPrice}
              className="px-4 py-2 text-sm font-semibold text-white bg-teal-500 rounded-lg hover:bg-teal-600 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Guardando...' : 'Crear Promoción'}
            </button>
          </div>
        </div>
      )}

      {/* Promotions List */}
      {loading ? (
        <div className="text-center py-12 text-slate-400">Cargando promociones...</div>
      ) : promotions.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Tag className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No hay promociones todavía</p>
          <p className="text-sm text-slate-400 mt-1">Crea tu primera promoción para atraer más médicos</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {promotions.map(promo => {
            const planName = PLAN_NAMES[promo.plan_key] || promo.plan_configs?.name || promo.plan_key
            const disc = discount(promo.original_price_usd, promo.promo_price_usd)
            const isExpired = promo.ends_at && new Date(promo.ends_at) < new Date()

            return (
              <div
                key={promo.id}
                className={`bg-white rounded-xl border p-5 flex flex-col sm:flex-row sm:items-center gap-4 transition-all ${
                  promo.is_active && !isExpired ? 'border-slate-200' : 'border-slate-100 opacity-60'
                }`}
              >
                {/* Info */}
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-slate-900">{planName}</span>
                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{promo.duration_months} meses</span>
                    <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-semibold">-{disc}%</span>
                    {!promo.is_active && (
                      <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Inactiva</span>
                    )}
                    {isExpired && (
                      <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full">Expirada</span>
                    )}
                  </div>
                  <p className="text-sm text-slate-600">
                    <span className="line-through text-slate-400">${promo.original_price_usd}</span>{' '}
                    <span className="font-bold text-teal-600">${promo.promo_price_usd} USD</span>
                    {promo.label && <span className="text-slate-400"> — {promo.label}</span>}
                  </p>
                  {promo.ends_at && (
                    <p className="text-xs text-slate-400 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Vence: {new Date(promo.ends_at).toLocaleDateString('es-VE')}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => togglePromo(promo.id, promo.is_active)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      promo.is_active
                        ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {promo.is_active ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                    {promo.is_active ? 'Activa' : 'Inactiva'}
                  </button>
                  <button
                    onClick={() => deletePromo(promo.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
