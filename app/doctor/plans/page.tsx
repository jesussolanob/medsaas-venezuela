'use client'

import { useState, useEffect } from 'react'
import { DollarSign, Plus, X, Trash2, ToggleLeft, ToggleRight, Link2, Copy, Check, ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type PricingPlan = { id: string; name: string; price_usd: number; duration_minutes: number; sessions_count: number; is_active: boolean }

const fi = 'w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-500/10 bg-white transition-colors'

export default function PlansPage() {
  const [plans, setPlans] = useState<PricingPlan[]>([])
  const [showNewPlan, setShowNewPlan] = useState(false)
  const [newPlan, setNewPlan] = useState({ name: '', price_usd: '', duration_minutes: '30', sessions_count: '1' })
  const [planError, setPlanError] = useState('')
  const [plansSaving, setPlansSaving] = useState(false)
  const [doctorId, setDoctorId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const publicLink = doctorId ? `${baseUrl}/book/${doctorId}` : ''

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      setDoctorId(user.id)
      const { data } = await supabase.from('pricing_plans').select('*').eq('doctor_id', user.id).order('price_usd')
      if (data) setPlans(data as PricingPlan[])
      setLoading(false)
    })
  }, [])

  async function savePlan(e: React.FormEvent) {
    e.preventDefault()
    if (!newPlan.name.trim()) { setPlanError('El nombre es obligatorio'); return }
    if (!newPlan.price_usd || isNaN(parseFloat(newPlan.price_usd))) { setPlanError('Precio inválido'); return }
    if (!doctorId) return
    setPlansSaving(true); setPlanError('')
    const supabase = createClient()
    const { data, error: dbErr } = await supabase.from('pricing_plans').insert({
      doctor_id: doctorId,
      name: newPlan.name,
      price_usd: parseFloat(newPlan.price_usd),
      duration_minutes: parseInt(newPlan.duration_minutes) || 30,
      sessions_count: parseInt(newPlan.sessions_count) || 1,
      is_active: true,
    }).select().single()

    if (dbErr) {
      const localPlan: PricingPlan = { id: Date.now().toString(), name: newPlan.name, price_usd: parseFloat(newPlan.price_usd), duration_minutes: parseInt(newPlan.duration_minutes) || 30, sessions_count: parseInt(newPlan.sessions_count) || 1, is_active: true }
      setPlans(prev => [...prev, localPlan])
      setPlanError('Error al guardar en DB: ' + dbErr.message)
    } else if (data) {
      setPlans(prev => [...prev, data as PricingPlan])
    }
    setNewPlan({ name: '', price_usd: '', duration_minutes: '30', sessions_count: '1' })
    setShowNewPlan(false)
    setPlansSaving(false)
  }

  async function togglePlan(planId: string) {
    const plan = plans.find(p => p.id === planId)
    setPlans(prev => prev.map(p => p.id === planId ? { ...p, is_active: !p.is_active } : p))
    if (plan) { const supabase = createClient(); await supabase.from('pricing_plans').update({ is_active: !plan.is_active }).eq('id', planId) }
  }

  async function deletePlan(planId: string) {
    setPlans(prev => prev.filter(p => p.id !== planId))
    const supabase = createClient(); await supabase.from('pricing_plans').delete().eq('id', planId)
  }

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');* { font-family: 'Inter', sans-serif; }.g-bg{background:linear-gradient(135deg,#00C4CC 0%,#0891b2 100%)}`}</style>

      <div className="max-w-2xl space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Planes de consulta</h1>
            <p className="text-sm text-slate-500">Define tus tipos de consulta y precios</p>
          </div>
          <button onClick={() => setShowNewPlan(true)} className="g-bg flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white hover:opacity-90">
            <Plus className="w-4 h-4" /> Nuevo plan
          </button>
        </div>

        {/* Booking link rápido */}
        {doctorId && (
          <div className="g-bg rounded-xl p-4 text-white flex items-center gap-3">
            <Link2 className="w-5 h-5 text-white/70 shrink-0" />
            <p className="text-sm font-mono flex-1 truncate text-white/90">{publicLink}</p>
            <button onClick={() => { navigator.clipboard.writeText(publicLink); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
              className="shrink-0 flex items-center gap-1.5 bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
              {copied ? <><Check className="w-3.5 h-3.5" />Copiado</> : <><Copy className="w-3.5 h-3.5" />Copiar link</>}
            </button>
            <button onClick={() => window.open(publicLink, '_blank')} className="shrink-0 w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors">
              <ExternalLink className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 flex items-start gap-3">
          <DollarSign className="w-4 h-4 text-teal-500 shrink-0 mt-0.5" />
          <p className="text-sm text-teal-700">Los planes activos aparecen en tu <strong>página pública de booking</strong> para que el paciente seleccione al agendar su cita.</p>
        </div>

        {/* Formulario nuevo plan */}
        {showNewPlan && (
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-700">Nuevo plan de consulta</p>
              <button onClick={() => { setShowNewPlan(false); setPlanError('') }} className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center"><X className="w-4 h-4 text-slate-500" /></button>
            </div>
            {planError && <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{planError}</p>}
            <form onSubmit={savePlan} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Nombre del plan</label>
                <input value={newPlan.name} onChange={e => setNewPlan(p => ({ ...p, name: e.target.value }))} placeholder="Consulta inicial, Control, Urgencia, Paquete..." className={fi} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Precio total (USD)</label>
                  <input type="number" min="0" step="0.01" value={newPlan.price_usd} onChange={e => setNewPlan(p => ({ ...p, price_usd: e.target.value }))} placeholder="20" className={fi} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">N° de consultas</label>
                  <input type="number" min="1" max="100" value={newPlan.sessions_count} onChange={e => setNewPlan(p => ({ ...p, sessions_count: e.target.value }))} placeholder="1" className={fi} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Duración (min)</label>
                  <select value={newPlan.duration_minutes} onChange={e => setNewPlan(p => ({ ...p, duration_minutes: e.target.value }))} className={fi}>
                    {[15,20,30,45,60,90,120].map(d => <option key={d} value={d}>{d} min</option>)}
                  </select>
                </div>
              </div>
              {parseInt(newPlan.sessions_count) > 1 && parseFloat(newPlan.price_usd) > 0 && (
                <div className="bg-violet-50 border border-violet-200 rounded-lg px-3 py-2 text-xs text-violet-700">
                  💡 Paquete de <strong>{newPlan.sessions_count} consultas</strong> por <strong>${newPlan.price_usd} USD</strong> — equivale a <strong>${(parseFloat(newPlan.price_usd) / parseInt(newPlan.sessions_count)).toFixed(2)}</strong> por consulta
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowNewPlan(false)} className="flex-1 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-500">Cancelar</button>
                <button type="submit" disabled={plansSaving} className="flex-1 g-bg py-2 rounded-xl text-xs font-bold text-white disabled:opacity-60">{plansSaving ? 'Guardando...' : 'Guardar plan'}</button>
              </div>
            </form>
          </div>
        )}

        {/* Lista de planes */}
        {loading ? (
          <div className="py-12 text-center text-slate-400 text-sm">Cargando planes...</div>
        ) : plans.length === 0 ? (
          <div className="bg-white border border-dashed border-slate-200 rounded-xl py-12 text-center">
            <DollarSign className="w-10 h-10 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-500 font-semibold text-sm">Sin planes creados</p>
            <p className="text-slate-400 text-xs mt-1">Crea tu primer tipo de consulta.</p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {plans.map((plan, i) => (
              <div key={plan.id} className={`flex items-center gap-4 px-5 py-4 ${i < plans.length - 1 ? 'border-b border-slate-100' : ''}`}>
                <div className="w-10 h-10 rounded-xl g-bg flex items-center justify-center shrink-0"><DollarSign className="w-5 h-5 text-white" /></div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-800">{plan.name}</p>
                    {plan.sessions_count > 1 && (
                      <span className="text-[10px] font-bold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">
                        {plan.sessions_count} consultas
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {plan.duration_minutes} min/sesión
                    {plan.sessions_count > 1 && ` · $${(plan.price_usd / plan.sessions_count).toFixed(2)} c/u`}
                  </p>
                </div>
                <p className="text-lg font-bold text-teal-600">${plan.price_usd} <span className="text-xs text-slate-400 font-normal">USD</span></p>
                <button onClick={() => togglePlan(plan.id)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${plan.is_active ? 'bg-teal-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                  {plan.is_active ? <><ToggleRight className="w-4 h-4" />Activo</> : <><ToggleLeft className="w-4 h-4" />Inactivo</>}
                </button>
                <button onClick={() => deletePlan(plan.id)} className="w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 flex items-center justify-center transition-colors"><Trash2 className="w-4 h-4 text-red-400" /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
