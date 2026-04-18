'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loader2, ToggleLeft, ToggleRight, DollarSign, Save, CheckCircle2, AlertCircle, Blocks } from 'lucide-react'

type PlanConfig = {
  id: string
  plan_key: string
  name: string
  price: number
  currency: string
  trial_days: number
  description: string | null
  is_active: boolean
  sort_order: number
}

export default function PlansPage() {
  const [plans, setPlans] = useState<PlanConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  useEffect(() => {
    loadPlans()
  }, [])

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000)
      return () => clearTimeout(t)
    }
  }, [toast])

  async function loadPlans() {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('plan_configs')
      .select('*')
      .order('sort_order')
    if (error) {
      console.error(error)
      setToast({ type: 'error', msg: 'Error cargando planes' })
    } else {
      setPlans(data ?? [])
    }
    setLoading(false)
  }

  async function togglePlan(plan: PlanConfig) {
    setSaving(plan.id)
    const supabase = createClient()
    const newActive = !plan.is_active
    const { error } = await supabase
      .from('plan_configs')
      .update({ is_active: newActive, updated_at: new Date().toISOString() })
      .eq('id', plan.id)

    if (error) {
      setToast({ type: 'error', msg: 'Error actualizando plan' })
    } else {
      setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, is_active: newActive } : p))
      setToast({ type: 'success', msg: `Plan ${plan.name} ${newActive ? 'activado' : 'desactivado'}` })
    }
    setSaving(null)
  }

  async function updatePrice(planId: string, price: number) {
    setSaving(planId)
    const supabase = createClient()
    const { error } = await supabase
      .from('plan_configs')
      .update({ price, updated_at: new Date().toISOString() })
      .eq('id', planId)

    if (error) {
      setToast({ type: 'error', msg: 'Error actualizando precio' })
    } else {
      setPlans(prev => prev.map(p => p.id === planId ? { ...p, price } : p))
      setToast({ type: 'success', msg: 'Precio actualizado' })
    }
    setSaving(null)
  }

  async function updateDescription(planId: string, description: string) {
    const supabase = createClient()
    await supabase
      .from('plan_configs')
      .update({ description, updated_at: new Date().toISOString() })
      .eq('id', planId)
    setPlans(prev => prev.map(p => p.id === planId ? { ...p, description } : p))
  }

  async function updateTrialDays(planId: string, trial_days: number) {
    const supabase = createClient()
    await supabase
      .from('plan_configs')
      .update({ trial_days, updated_at: new Date().toISOString() })
      .eq('id', planId)
    setPlans(prev => prev.map(p => p.id === planId ? { ...p, trial_days } : p))
  }

  const planColors: Record<string, { bg: string; border: string; text: string; dot: string }> = {
    trial: { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-700', dot: 'bg-slate-400' },
    basic: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', dot: 'bg-blue-400' },
    professional: { bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-700', dot: 'bg-teal-400' },
    clinic: { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700', dot: 'bg-violet-400' },
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-6">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');`}</style>

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${toast.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      <div>
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <Blocks className="w-5 h-5 text-teal-500" /> Gestión de Planes
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Activa o desactiva los planes disponibles para los usuarios. Los planes desactivados no se mostrarán en el formulario de registro.
        </p>
      </div>

      <div className="space-y-4">
        {plans.map(plan => {
          const colors = planColors[plan.plan_key] || planColors.trial
          return (
            <div key={plan.id} className={`bg-white border border-slate-200 rounded-2xl overflow-hidden transition-all ${!plan.is_active ? 'opacity-60' : ''}`}>
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${plan.is_active ? colors.dot : 'bg-slate-300'}`} />
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">{plan.name}</h3>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colors.bg} ${colors.text}`}>
                      {plan.plan_key}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => togglePlan(plan)}
                  disabled={saving === plan.id}
                  className="flex items-center gap-2 transition-all"
                >
                  {saving === plan.id ? (
                    <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                  ) : plan.is_active ? (
                    <ToggleRight className="w-8 h-8 text-teal-500" />
                  ) : (
                    <ToggleLeft className="w-8 h-8 text-slate-300" />
                  )}
                  <span className={`text-xs font-bold ${plan.is_active ? 'text-teal-600' : 'text-slate-400'}`}>
                    {plan.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </button>
              </div>

              {/* Body */}
              <div className="px-5 py-4 grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Precio (USD)</label>
                  <div className="relative">
                    <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="number"
                      value={plan.price}
                      onChange={e => setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, price: parseFloat(e.target.value) || 0 } : p))}
                      onBlur={e => updatePrice(plan.id, parseFloat(e.target.value) || 0)}
                      className="w-full pl-7 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Trial (días)</label>
                  <input
                    type="number"
                    value={plan.trial_days}
                    onChange={e => setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, trial_days: parseInt(e.target.value) || 0 } : p))}
                    onBlur={e => updateTrialDays(plan.id, parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Estado</label>
                  <div className={`px-3 py-2 text-sm rounded-lg border ${plan.is_active ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                    {plan.is_active ? 'Visible en registro' : 'Oculto'}
                  </div>
                </div>

                <div className="col-span-3">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Descripción</label>
                  <input
                    type="text"
                    value={plan.description || ''}
                    onChange={e => setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, description: e.target.value } : p))}
                    onBlur={e => updateDescription(plan.id, e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10"
                    placeholder="Descripción del plan..."
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {plans.length === 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl py-12 text-center">
          <Blocks className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 font-semibold">No hay planes configurados</p>
          <p className="text-xs text-slate-400 mt-1">Ejecuta el script SQL para crear los planes iniciales.</p>
        </div>
      )}
    </div>
  )
}
