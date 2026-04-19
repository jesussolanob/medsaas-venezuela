'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loader2, CheckCircle2, AlertCircle, Shield, Users, Settings } from 'lucide-react'

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
  const [saving, setSaving] = useState(false)
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

  // Find the trial/beta plan
  const betaPlan = plans.find(p => p.plan_key === 'trial') || plans[0]

  async function updateBetaPlan(field: string, value: any) {
    if (!betaPlan) return
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('plan_configs')
      .update({ [field]: value, updated_at: new Date().toISOString() })
      .eq('id', betaPlan.id)

    if (error) {
      setToast({ type: 'error', msg: 'Error actualizando configuración' })
    } else {
      setPlans(prev => prev.map(p => p.id === betaPlan.id ? { ...p, [field]: value } : p))
      setToast({ type: 'success', msg: 'Configuración guardada' })
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
      </div>
    )
  }

  const totalPlans = plans.length
  const activePlans = plans.filter(p => p.is_active).length

  return (
    <div className="max-w-2xl space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${toast.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 p-5 text-white">
        <div className="flex items-center gap-3 mb-2">
          <Shield className="w-6 h-6" />
          <h2 className="text-lg font-bold">Beta Privada</h2>
        </div>
        <p className="text-sm text-white/70">
          Delta está actualmente en beta privada. Los médicos se registran y esperan aprobación del admin para acceder al sistema.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Settings className="w-4 h-4 text-slate-400" />
            <span className="text-xs text-slate-500 font-medium">Plan actual</span>
          </div>
          <p className="text-lg font-bold text-slate-900">Beta Privada (Gratis)</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-teal-500" />
            <span className="text-xs text-slate-500 font-medium">Planes en sistema</span>
          </div>
          <p className="text-lg font-bold text-slate-900">{activePlans} activo{activePlans !== 1 ? 's' : ''} / {totalPlans} total</p>
        </div>
      </div>

      {/* Beta Plan Config */}
      {betaPlan && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Configuración del Beta</h3>
              <p className="text-xs text-slate-400 mt-0.5">Ajusta los parámetros del periodo de prueba</p>
            </div>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${betaPlan.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
              {betaPlan.is_active ? 'Activo' : 'Inactivo'}
            </span>
          </div>

          <div className="px-5 py-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Días de trial para nuevos registros</label>
              <input
                type="number"
                value={betaPlan.trial_days}
                onChange={e => setPlans(prev => prev.map(p => p.id === betaPlan.id ? { ...p, trial_days: parseInt(e.target.value) || 0 } : p))}
                onBlur={e => updateBetaPlan('trial_days', parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10"
              />
              <p className="text-[10px] text-slate-400 mt-1">Los médicos tienen este número de días de prueba antes de que su cuenta sea suspendida o aprobada manualmente.</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Descripción del plan</label>
              <textarea
                value={betaPlan.description || ''}
                onChange={e => setPlans(prev => prev.map(p => p.id === betaPlan.id ? { ...p, description: e.target.value } : p))}
                onBlur={e => updateBetaPlan('description', e.target.value)}
                rows={2}
                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 resize-none"
                placeholder="Acceso completo a todas las funciones durante la beta privada..."
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Precio (USD)</label>
              <input
                type="number"
                value={betaPlan.price}
                onChange={e => setPlans(prev => prev.map(p => p.id === betaPlan.id ? { ...p, price: parseFloat(e.target.value) || 0 } : p))}
                onBlur={e => updateBetaPlan('price', parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10"
              />
              <p className="text-[10px] text-slate-400 mt-1">Durante la beta privada el precio es $0. Cámbialo cuando lances los planes de pago.</p>
            </div>
          </div>
        </div>
      )}

      {/* Info card */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <p className="text-sm text-blue-800 font-medium mb-1">¿Cómo funciona la beta privada?</p>
        <ol className="text-xs text-blue-700 space-y-1 list-decimal list-inside">
          <li>El médico se registra en /register y recibe un periodo trial</li>
          <li>Aparece en Aprobaciones con estado "Trial"</li>
          <li>El admin aprueba y activa su cuenta por 1 año</li>
          <li>El médico accede a todas las funciones sin costo</li>
        </ol>
      </div>
    </div>
  )
}
