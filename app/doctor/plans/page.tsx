'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CheckCircle, AlertCircle, Clock, Upload, Tag, Sparkles } from 'lucide-react'

interface Subscription {
  id: string
  plan: string
  status: string
  current_period_start: string
  current_period_end: string
  price_usd: number
}

interface PlanConfig {
  plan_key: string
  name: string
  price: number
  trial_days: number
  is_active: boolean
  description?: string
}

interface Promotion {
  id: string
  plan_key: string
  duration_months: number
  original_price_usd: number
  promo_price_usd: number
  label: string
}

export default function DoctorPlansPage() {
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [planConfigs, setPlanConfigs] = useState<PlanConfig[]>([])
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [daysRemaining, setDaysRemaining] = useState(0)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadMessage, setUploadMessage] = useState('')
  const [userId, setUserId] = useState<string | null>(null)

  // Upgrade/renewal state
  const [selectedAction, setSelectedAction] = useState<{
    planKey: string
    type: 'monthly' | 'promo'
    amount: number
    label: string
  } | null>(null)

  useEffect(() => {
    async function loadData() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      const { data } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('doctor_id', user.id)
        .single()

      if (data) {
        setSubscription(data)
        if (data.current_period_end) {
          const expiryDate = new Date(data.current_period_end)
          const today = new Date()
          const days = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
          setDaysRemaining(Math.max(0, days))
        }
      }

      // Fetch plan configs
      const { data: plans } = await supabase
        .from('plan_configs')
        .select('plan_key, name, price, trial_days, is_active, description')
        .eq('is_active', true)
        .order('sort_order')

      if (plans) setPlanConfigs(plans)

      // Fetch active promotions
      try {
        const res = await fetch('/api/promotions')
        const promos = await res.json()
        if (Array.isArray(promos)) setPromotions(promos)
      } catch {}

      setLoading(false)
    }

    loadData()
  }, [])

  const getPromo = (planKey: string) => promotions.find(p => p.plan_key === planKey)

  const handlePaymentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !userId || !selectedAction) return

    // Beta privada: el flujo de comprobantes y aprobaciones fue eliminado.
    // Todos los médicos tienen acceso gratis por 1 año automáticamente.
    setUploadMessage('En la beta privada el acceso es gratuito. No es necesario subir comprobantes.')
    setSelectedAction(null)
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active': return { bg: 'bg-emerald-50', text: 'text-emerald-600', label: 'Activo' }
      case 'trial': return { bg: 'bg-amber-50', text: 'text-amber-600', label: 'Trial' }
      case 'suspended': return { bg: 'bg-red-50', text: 'text-red-600', label: 'Suspendido' }
      case 'past_due': return { bg: 'bg-orange-50', text: 'text-orange-600', label: 'Pendiente de pago' }
      default: return { bg: 'bg-slate-50', text: 'text-slate-600', label: status }
    }
  }

  const getPlanName = (planKey: string) => {
    const plan = planConfigs.find(p => p.plan_key === planKey)
    if (plan) return plan.name
    const names: Record<string, string> = { trial: 'Trial', basic: 'Basic', professional: 'Professional', clinic: 'Centro de Salud' }
    return names[planKey] || planKey
  }

  const getPlanPrice = (planKey: string) => {
    const plan = planConfigs.find(p => p.plan_key === planKey)
    return plan?.price ?? 0
  }

  const planHierarchy: Record<string, number> = { trial: 0, basic: 1, professional: 2, clinic: 3 }

  const expiryDate = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString('es-VE', { year: 'numeric', month: 'long', day: 'numeric' })
    : 'N/A'

  const progressPercentage = Math.min((daysRemaining / 30) * 100, 100)

  if (loading) return <div className="py-12 text-center text-slate-400">Cargando plan…</div>

  const currentTier = planHierarchy[subscription?.plan || 'trial'] ?? 0
  const needsPayment = subscription?.status === 'suspended' || subscription?.status === 'past_due' || daysRemaining <= 7

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Plan de Suscripción</h1>
        <p className="text-sm text-slate-500 mt-1">Gestiona tu plan y método de pago</p>
      </div>

      {/* Current Plan Card */}
      {subscription && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Plan actual</p>
              <p className="text-3xl font-bold text-slate-900 mt-2">
                {getPlanName(subscription.plan)} - ${getPlanPrice(subscription.plan)} USD/mes
              </p>
            </div>
            <div className={`px-3 py-1.5 rounded-full text-sm font-semibold ${getStatusBadge(subscription.status).bg} ${getStatusBadge(subscription.status).text}`}>
              {getStatusBadge(subscription.status).label}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Estado</p>
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg w-fit ${getStatusBadge(subscription.status).bg} ${getStatusBadge(subscription.status).text}`}>
                {subscription.status === 'active' && <CheckCircle className="w-4 h-4" />}
                {subscription.status === 'trial' && <Clock className="w-4 h-4" />}
                {(subscription.status === 'suspended' || subscription.status === 'past_due') && <AlertCircle className="w-4 h-4" />}
                <span className="text-sm font-semibold">{getStatusBadge(subscription.status).label}</span>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Tiempo restante</p>
              <p className="text-2xl font-bold text-slate-900">{daysRemaining} días</p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500">Vencimiento</p>
              <p className="text-xs font-semibold text-slate-600">{expiryDate}</p>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-teal-400 to-teal-600 rounded-full transition-all" style={{ width: `${progressPercentage}%` }} />
            </div>
            {daysRemaining <= 7 && daysRemaining > 0 && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Tu suscripción vence en {daysRemaining} día{daysRemaining !== 1 ? 's' : ''}. Renueva ahora para no perder acceso.
              </p>
            )}
            {daysRemaining === 0 && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                Tu suscripción ha vencido. Selecciona una opción de pago abajo para reactivarla.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ═══ RENEWAL / UPGRADE OPTIONS ═══ */}
      {subscription && (
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-widest">
            {needsPayment ? 'Renueva tu plan' : 'Opciones de plan'}
          </h3>

          {/* Current Plan Renewal */}
          {subscription.plan !== 'trial' && (
            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-teal-500" />
                <h4 className="text-sm font-bold text-slate-800">Renovar {getPlanName(subscription.plan)}</h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Monthly option */}
                <button
                  onClick={() => setSelectedAction({
                    planKey: subscription.plan,
                    type: 'monthly',
                    amount: getPlanPrice(subscription.plan),
                    label: `${getPlanName(subscription.plan)} - 1 mes`,
                  })}
                  className={`text-left border rounded-xl p-4 transition-all ${
                    selectedAction?.planKey === subscription.plan && selectedAction?.type === 'monthly'
                      ? 'border-teal-500 bg-teal-50 ring-2 ring-teal-500/20'
                      : 'border-slate-200 hover:border-teal-300'
                  }`}
                >
                  <p className="text-sm font-semibold text-slate-900">1 mes</p>
                  <p className="text-2xl font-bold text-teal-600 mt-1">${getPlanPrice(subscription.plan)} USD</p>
                </button>

                {/* Promo option */}
                {getPromo(subscription.plan) && (() => {
                  const promo = getPromo(subscription.plan)!
                  const disc = Math.round(((promo.original_price_usd - promo.promo_price_usd) / promo.original_price_usd) * 100)
                  return (
                    <button
                      onClick={() => setSelectedAction({
                        planKey: subscription.plan,
                        type: 'promo',
                        amount: promo.promo_price_usd,
                        label: `${getPlanName(subscription.plan)} - ${promo.duration_months} meses`,
                      })}
                      className={`text-left border rounded-xl p-4 transition-all relative overflow-hidden ${
                        selectedAction?.planKey === subscription.plan && selectedAction?.type === 'promo'
                          ? 'border-teal-500 bg-teal-50 ring-2 ring-teal-500/20'
                          : 'border-teal-300 hover:border-teal-400 bg-gradient-to-br from-teal-50/50 to-emerald-50/50'
                      }`}
                    >
                      <div className="absolute top-2 right-2">
                        <span className="text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded-full font-bold">-{disc}%</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5 text-teal-600" />
                        <p className="text-sm font-semibold text-teal-800">{promo.label || `${promo.duration_months} meses`}</p>
                      </div>
                      <div className="mt-1 flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-teal-600">${promo.promo_price_usd} USD</span>
                        <span className="text-sm line-through text-slate-400">${promo.original_price_usd}</span>
                      </div>
                      <p className="text-[11px] text-teal-600 mt-0.5">{promo.duration_months} meses de acceso</p>
                    </button>
                  )
                })()}
              </div>
            </div>
          )}

          {/* Upgrade Options */}
          {planConfigs
            .filter(plan => {
              const planTier = planHierarchy[plan.plan_key as keyof typeof planHierarchy] ?? 0
              return planTier > currentTier && plan.plan_key !== 'trial'
            })
            .map(plan => {
              const promo = getPromo(plan.plan_key)
              const buttonColor = plan.plan_key === 'professional' ? 'border-teal-300' : 'border-violet-300'
              const accentColor = plan.plan_key === 'professional' ? 'text-teal-600' : 'text-violet-600'

              return (
                <div key={plan.plan_key} className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className={`w-4 h-4 ${accentColor}`} />
                      <h4 className="text-sm font-bold text-slate-800">Upgrade a {plan.name}</h4>
                    </div>
                    {plan.plan_key === 'professional' && (
                      <span className="text-[10px] font-bold bg-teal-500 text-white px-2 py-0.5 rounded-full">Popular</span>
                    )}
                  </div>
                  {plan.description && <p className="text-xs text-slate-500">{plan.description}</p>}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Monthly */}
                    <button
                      onClick={() => setSelectedAction({
                        planKey: plan.plan_key,
                        type: 'monthly',
                        amount: plan.price,
                        label: `${plan.name} - 1 mes`,
                      })}
                      className={`text-left border rounded-xl p-4 transition-all ${
                        selectedAction?.planKey === plan.plan_key && selectedAction?.type === 'monthly'
                          ? `${buttonColor} bg-slate-50 ring-2 ring-teal-500/20`
                          : 'border-slate-200 hover:border-teal-300'
                      }`}
                    >
                      <p className="text-sm font-semibold text-slate-900">{plan.name} - 1 mes</p>
                      <p className={`text-2xl font-bold mt-1 ${accentColor}`}>${plan.price} USD</p>
                    </button>

                    {/* Promo */}
                    {promo && (() => {
                      const disc = Math.round(((promo.original_price_usd - promo.promo_price_usd) / promo.original_price_usd) * 100)
                      return (
                        <button
                          onClick={() => setSelectedAction({
                            planKey: plan.plan_key,
                            type: 'promo',
                            amount: promo.promo_price_usd,
                            label: `${plan.name} - ${promo.duration_months} meses`,
                          })}
                          className={`text-left border rounded-xl p-4 transition-all relative overflow-hidden ${
                            selectedAction?.planKey === plan.plan_key && selectedAction?.type === 'promo'
                              ? `${buttonColor} bg-slate-50 ring-2 ring-teal-500/20`
                              : `${buttonColor} hover:border-teal-400 bg-gradient-to-br from-teal-50/30 to-emerald-50/30`
                          }`}
                        >
                          <div className="absolute top-2 right-2">
                            <span className="text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded-full font-bold">-{disc}%</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Tag className="w-3.5 h-3.5 text-teal-600" />
                            <p className="text-sm font-semibold text-teal-800">{promo.label || `${promo.duration_months} meses`}</p>
                          </div>
                          <div className="mt-1 flex items-baseline gap-2">
                            <span className={`text-2xl font-bold ${accentColor}`}>${promo.promo_price_usd} USD</span>
                            <span className="text-sm line-through text-slate-400">${promo.original_price_usd}</span>
                          </div>
                          <p className="text-[11px] text-teal-600 mt-0.5">{promo.duration_months} meses de acceso</p>
                        </button>
                      )
                    })()}
                  </div>
                </div>
              )
            })}
        </div>
      )}

      {/* ═══ PAYMENT SECTION — shows when an action is selected ═══ */}
      {selectedAction && (
        <div className="bg-white rounded-xl border-2 border-teal-300 p-6 space-y-5">
          <div>
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-widest">Pagar: {selectedAction.label}</h3>
            <p className="text-3xl font-bold text-teal-600 mt-2">${selectedAction.amount} USD</p>
          </div>

          {/* Payment Methods */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="border border-slate-200 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xl">📱</span>
                <h4 className="font-semibold text-slate-700 text-sm">Pago Móvil</h4>
              </div>
              <div className="space-y-1 text-xs text-slate-600">
                <p><span className="font-semibold">Banco:</span> Banesco</p>
                <p><span className="font-semibold">Teléfono:</span> 0412-555-0000</p>
                <p><span className="font-semibold">Cédula/RIF:</span> J-12345678-9</p>
              </div>
            </div>
            <div className="border border-slate-200 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xl">🏦</span>
                <h4 className="font-semibold text-slate-700 text-sm">Transferencia</h4>
              </div>
              <div className="space-y-1 text-xs text-slate-600">
                <p><span className="font-semibold">Banco:</span> Mercantil</p>
                <p><span className="font-semibold">Cuenta:</span> 0102-xxxx-xx-xxxxxxxxxx</p>
                <p><span className="font-semibold">RIF:</span> J-12345678-9</p>
              </div>
            </div>
          </div>

          {/* Upload receipt */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
            <div className="flex items-start gap-3">
              <Upload className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-amber-900 text-sm">Subir comprobante de pago</h4>
                <p className="text-xs text-amber-700 mt-0.5">Realiza el pago por ${selectedAction.amount} USD y sube el comprobante</p>
              </div>
            </div>
            <label className="flex items-center justify-center w-full cursor-pointer bg-white rounded-lg border border-amber-300 p-3">
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                onChange={handlePaymentUpload}
                disabled={uploading}
                className="hidden"
              />
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-700">
                  {uploading ? 'Subiendo…' : 'Haz clic para subir comprobante'}
                </p>
                <p className="text-xs text-slate-500">PDF, PNG o JPG · Máx. 5MB</p>
              </div>
            </label>
          </div>

          <button
            onClick={() => setSelectedAction(null)}
            className="text-xs text-slate-500 hover:text-slate-700 font-medium"
          >
            Cancelar selección
          </button>
        </div>
      )}

      {/* Upload message */}
      {uploadMessage && (
        <div className={`text-xs px-4 py-3 rounded-xl ${uploadMessage.includes('exitosamente') ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {uploadMessage}
        </div>
      )}
    </div>
  )
}
