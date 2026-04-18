'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CheckCircle, AlertCircle, Clock, Upload } from 'lucide-react'

interface Subscription {
  id: string
  plan: string
  status: string
  current_period_start: string
  current_period_end: string
  price_usd: number
}

export default function DoctorPlansPage() {
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [daysRemaining, setDaysRemaining] = useState(0)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  useEffect(() => {
    async function loadSubscription() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

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
      setLoading(false)
    }

    loadSubscription()
  }, [])

  const handlePaymentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setUploadError('')

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No user found')

      const fileName = `payment-receipt-${user.id}-${Date.now()}.pdf`

      const { error: uploadError } = await supabase.storage
        .from('payment-receipts')
        .upload(fileName, file)

      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage.from('payment-receipts').getPublicUrl(fileName)

      await supabase.from('subscription_payments').insert({
        doctor_id: user.id,
        subscription_id: subscription?.id,
        receipt_url: urlData.publicUrl,
        status: 'pending',
        amount: subscription?.price_usd,
      })

      setUploadError('Comprobante subido exitosamente. El administrador lo revisará en breve.')
    } catch (error: any) {
      setUploadError('Error al subir el comprobante: ' + error.message)
    } finally {
      setUploading(false)
    }
  }

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'active':
        return { bg: 'bg-emerald-50', text: 'text-emerald-600', label: 'Activo' }
      case 'trial':
        return { bg: 'bg-amber-50', text: 'text-amber-600', label: 'Trial' }
      case 'suspended':
        return { bg: 'bg-red-50', text: 'text-red-600', label: 'Suspendido' }
      case 'past_due':
        return { bg: 'bg-orange-50', text: 'text-orange-600', label: 'Pendiente de pago' }
      default:
        return { bg: 'bg-slate-50', text: 'text-slate-600', label: 'Desconocido' }
    }
  }

  const getPlanBadgeColor = (plan: string) => {
    switch (plan) {
      case 'basic':
      case 'trial':
        return { bg: 'bg-slate-100', text: 'text-slate-600', label: 'Plan Basic' }
      case 'professional':
        return { bg: 'bg-teal-100', text: 'text-teal-600', label: 'Plan Professional' }
      case 'enterprise':
        return { bg: 'bg-violet-100', text: 'text-violet-600', label: 'Centro de Salud' }
      default:
        return { bg: 'bg-slate-100', text: 'text-slate-600', label: plan }
    }
  }

  const expiryDate = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString('es-VE', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'N/A'

  const progressPercentage = subscription?.plan === 'basic'
    ? (daysRemaining / 30) * 100
    : Math.min((daysRemaining / 30) * 100, 100)

  if (loading) {
    return <div className="py-12 text-center text-slate-400">Cargando plan…</div>
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
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
                {subscription.plan === 'professional' ? 'Professional - $20 USD' : subscription.plan === 'enterprise' ? 'Centro de Salud - $100 USD' : 'Plan Basic'}
              </p>
            </div>
            <div className={`px-3 py-1.5 rounded-full text-sm font-semibold ${getPlanBadgeColor(subscription.plan).bg} ${getPlanBadgeColor(subscription.plan).text}`}>
              {getPlanBadgeColor(subscription.plan).label}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Status */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Estado</p>
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg w-fit ${getStatusBadgeColor(subscription.status).bg} ${getStatusBadgeColor(subscription.status).text}`}>
                {subscription.status === 'active' && <CheckCircle className="w-4 h-4" />}
                {subscription.status === 'trial' && <Clock className="w-4 h-4" />}
                {subscription.status === 'suspended' && <AlertCircle className="w-4 h-4" />}
                {subscription.status === 'past_due' && <AlertCircle className="w-4 h-4" />}
                <span className="text-sm font-semibold">{getStatusBadgeColor(subscription.status).label}</span>
              </div>
            </div>

            {/* Days Remaining */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Tiempo restante</p>
              <p className="text-2xl font-bold text-slate-900">{daysRemaining} días</p>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500">Vencimiento</p>
              <p className="text-xs font-semibold text-slate-600">{expiryDate}</p>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-teal-400 to-teal-600 rounded-full transition-all"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
            {daysRemaining <= 7 && daysRemaining > 0 && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Aviso: Tu suscripción vence en {daysRemaining} día{daysRemaining !== 1 ? 's' : ''}. Renueva ahora para no perder acceso.
              </p>
            )}
            {daysRemaining === 0 && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                Tu suscripción ha vencido. Sube el comprobante de pago para reactivarla.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Payment Methods Section */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-widest">Métodos de pago</h3>
          <p className="text-xs text-slate-500 mt-1">Delta Payment — Acepta Pago Móvil y Transferencia Bancaria</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Pago Móvil */}
          <div className="border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl">📱</span>
              <h4 className="font-semibold text-slate-700">Pago Móvil</h4>
            </div>
            <div className="space-y-2 text-xs text-slate-600">
              <p><span className="font-semibold">Banco:</span> Banesco</p>
              <p><span className="font-semibold">Teléfono:</span> 0412-555-0000</p>
              <p><span className="font-semibold">Cédula/RIF:</span> J-12345678-9</p>
              <p><span className="font-semibold">Titular:</span> Delta Medical SRL</p>
            </div>
          </div>

          {/* Transferencia */}
          <div className="border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🏦</span>
              <h4 className="font-semibold text-slate-700">Transferencia</h4>
            </div>
            <div className="space-y-2 text-xs text-slate-600">
              <p><span className="font-semibold">Banco:</span> Mercantil</p>
              <p><span className="font-semibold">Cuenta:</span> 0102-xxxx-xx-xxxxxxxxxx</p>
              <p><span className="font-semibold">Titular:</span> Delta Medical SRL</p>
              <p><span className="font-semibold">RIF:</span> J-12345678-9</p>
            </div>
          </div>
        </div>
      </div>

      {/* Upload Receipt Section */}
      {subscription?.status === 'suspended' || subscription?.status === 'past_due' ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 space-y-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-amber-900">Subir comprobante de pago</h3>
              <p className="text-sm text-amber-700 mt-1">Realizaste una transferencia o pago móvil? Sube el comprobante para que el administrador lo verifique.</p>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-amber-300 p-4">
            <label className="flex items-center justify-center w-full cursor-pointer">
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                onChange={handlePaymentUpload}
                disabled={uploading}
                className="hidden"
              />
              <div className="flex items-center gap-3 text-center">
                <Upload className="w-5 h-5 text-amber-600" />
                <div>
                  <p className="text-sm font-semibold text-slate-700">
                    {uploading ? 'Subiendo…' : 'Haz clic para subir comprobante'}
                  </p>
                  <p className="text-xs text-slate-500">PDF, PNG o JPG · Máx. 5MB</p>
                </div>
              </div>
            </label>
          </div>

          {uploadError && (
            <div className={`text-xs px-3 py-2 rounded-lg ${uploadError.includes('exitosamente') ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {uploadError}
            </div>
          )}
        </div>
      ) : null}

      {/* Upgrade Section */}
      {subscription?.plan === 'basic' || subscription?.plan === 'trial' ? (
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-widest">Planes disponibles</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Professional Plan */}
            <div className="border border-slate-200 rounded-xl p-6 space-y-4 hover:border-teal-300 hover:shadow-md transition-all">
              <div>
                <h4 className="text-lg font-bold text-slate-900">Plan Professional</h4>
                <p className="text-2xl font-bold text-teal-600 mt-2">$20 <span className="text-sm text-slate-500">/mes</span></p>
              </div>
              <ul className="space-y-2 text-sm text-slate-600">
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  Agenda ilimitada de citas
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  Historial clínico (EHR)
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  CRM de leads
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  Recordatorios automáticos
                </li>
              </ul>
              <button className="w-full bg-teal-500 text-white font-semibold py-2.5 rounded-xl hover:bg-teal-600 transition-colors">
                Actualizar a Professional
              </button>
            </div>

            {/* Centro de Salud Plan */}
            <div className="border border-slate-200 rounded-xl p-6 space-y-4 ring-2 ring-teal-500 hover:shadow-md transition-all">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="text-lg font-bold text-slate-900">Centro de Salud</h4>
                  <p className="text-2xl font-bold text-violet-600 mt-2">$100 <span className="text-sm text-slate-500">/mes</span></p>
                </div>
                <span className="text-xs font-bold bg-teal-500 text-white px-2 py-1 rounded-full">Popular</span>
              </div>
              <ul className="space-y-2 text-sm text-slate-600">
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  Todo de Pro +
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  Hasta 5 médicos asociados
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  Facturación avanzada
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  Reportes y analytics
                </li>
              </ul>
              <button className="w-full bg-violet-500 text-white font-semibold py-2.5 rounded-xl hover:bg-violet-600 transition-colors">
                Upgrade a Centro de Salud
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Current Plan Info */}
      {subscription && subscription.plan !== 'basic' && subscription.plan !== 'trial' && (
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
          <p className="text-xs text-slate-600">
            Tu plan actual incluye todo lo necesario para gestionar tu práctica médica. Para cambiar de plan o necesitas ayuda, contacta a soporte.
          </p>
        </div>
      )}
    </div>
  )
}
