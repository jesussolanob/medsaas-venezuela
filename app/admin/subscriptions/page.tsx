import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react'

export default async function SubscriptionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: subscriptions } = await supabase
    .from('subscriptions')
    .select('*, profiles(full_name, email, specialty)')
    .order('created_at', { ascending: false })

  const statusConfig: Record<string, { label: string; icon: any; color: string; bg: string }> = {
    active:    { label: 'Activo',    icon: CheckCircle,  color: 'text-emerald-600', bg: 'bg-emerald-50' },
    trial:     { label: 'Trial',     icon: Clock,        color: 'text-amber-600',   bg: 'bg-amber-50' },
    suspended: { label: 'Suspendido',icon: XCircle,      color: 'text-red-500',     bg: 'bg-red-50' },
    cancelled: { label: 'Cancelado', icon: XCircle,      color: 'text-slate-400',   bg: 'bg-slate-50' },
    past_due:  { label: 'Vencido',   icon: AlertCircle,  color: 'text-orange-500',  bg: 'bg-orange-50' },
  }

  const planColors: Record<string, string> = {
    trial:        'bg-slate-100 text-slate-600',
    basic:        'bg-blue-50 text-blue-600',
    professional: 'bg-teal-50 text-teal-600',
    enterprise:   'bg-violet-50 text-violet-600',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Suscripciones</h2>
          <p className="text-slate-500 text-sm mt-1">{subscriptions?.length ?? 0} suscripciones en total</p>
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-4 gap-4">
        {['active', 'trial', 'suspended', 'past_due'].map((status) => {
          const count = subscriptions?.filter(s => s.status === status).length ?? 0
          const config = statusConfig[status]
          return (
            <div key={status} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className={`w-8 h-8 rounded-lg ${config.bg} flex items-center justify-center mb-3`}>
                <config.icon className={`w-4 h-4 ${config.color}`} />
              </div>
              <p className="text-2xl font-semibold text-slate-900">{count}</p>
              <p className="text-xs text-slate-400 mt-1">{config.label}</p>
            </div>
          )
        })}
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Médico</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Plan</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Estado</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Vence</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Precio</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!subscriptions || subscriptions.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-16 text-center text-slate-400 text-sm">
                  No hay suscripciones todavía
                </td>
              </tr>
            ) : (
              subscriptions.map((sub) => {
                const config = statusConfig[sub.status] ?? statusConfig.cancelled
                const planColor = planColors[sub.plan] ?? planColors.trial
                const vence = sub.current_period_end
                  ? new Date(sub.current_period_end).toLocaleDateString('es-VE')
                  : '—'
                return (
                  <tr key={sub.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-medium text-sm">
                          {sub.profiles?.full_name?.charAt(0) ?? '?'}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900">{sub.profiles?.full_name}</p>
                          <p className="text-xs text-slate-400">{sub.profiles?.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs px-2 py-1 rounded-full capitalize font-medium ${planColor}`}>
                        {sub.plan}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full w-fit ${config.bg} ${config.color}`}>
                        <config.icon className="w-3 h-3" />
                        {config.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">{vence}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">${sub.price_usd} USD</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button className="text-xs text-teal-600 hover:text-teal-700 font-medium">Editar</button>
                        <span className="text-slate-200">|</span>
                        <button className="text-xs text-slate-400 hover:text-red-500 font-medium">
                          {sub.status === 'active' ? 'Suspender' : 'Activar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}