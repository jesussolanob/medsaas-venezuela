import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Users, Calendar, CreditCard, Activity, ArrowUpRight, TrendingUp, Bell } from 'lucide-react'

export default async function AdminDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: kpis } = await supabase.rpc('bi_platform_kpis')

  const stats = [
    {
      label: 'Médicos activos',
      value: kpis?.total_doctors ?? 0,
      icon: Users,
      change: '+3 este mes',
      color: 'text-teal-600',
      bg: 'bg-teal-50',
      border: 'border-teal-100',
    },
    {
      label: 'Citas hoy',
      value: kpis?.appts_today ?? 0,
      icon: Calendar,
      change: 'Tiempo real',
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      border: 'border-blue-100',
    },
    {
      label: 'Citas este mes',
      value: kpis?.appts_this_month ?? 0,
      icon: TrendingUp,
      change: 'Acumulado',
      color: 'text-violet-600',
      bg: 'bg-violet-50',
      border: 'border-violet-100',
    },
    {
      label: 'Suscripciones activas',
      value: kpis?.active_subscriptions ?? 0,
      icon: CreditCard,
      change: `${kpis?.trial_subscriptions ?? 0} en trial`,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
      border: 'border-amber-100',
    },
  ]

  return (
    <div className="space-y-4 sm:space-y-6 lg:space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-xl sm:text-2xl font-semibold text-slate-900">Bienvenido de nuevo 👋</h2>
        <p className="text-slate-400 text-xs sm:text-sm mt-1">Resumen general de la plataforma</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className={`rounded-xl border ${stat.border} bg-white p-4 sm:p-5 hover:shadow-sm transition-all min-w-0`}>
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <span className="text-xs text-slate-400 uppercase tracking-wider truncate">{stat.label}</span>
              <div className={`w-9 h-9 rounded-lg ${stat.bg} flex items-center justify-center flex-shrink-0`}>
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-semibold text-slate-900">{stat.value}</p>
            <p className="text-xs text-slate-400 mt-1">{stat.change}</p>
          </div>
        ))}
      </div>

      {/* Segunda fila */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 min-w-0">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <h3 className="text-sm font-medium text-slate-600 truncate">Leads calientes</h3>
            <span className="text-xs bg-red-50 text-red-500 px-2 py-1 rounded-full border border-red-100 flex-shrink-0">Hot</span>
          </div>
          <p className="text-2xl sm:text-3xl font-semibold text-slate-900">{kpis?.hot_leads_total ?? 0}</p>
          <p className="text-xs text-slate-400 mt-1">En toda la plataforma</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 min-w-0">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <h3 className="text-sm font-medium text-slate-600 truncate">Recordatorios pendientes</h3>
            <span className="text-xs bg-amber-50 text-amber-500 px-2 py-1 rounded-full border border-amber-100 flex-shrink-0">Cola</span>
          </div>
          <p className="text-2xl sm:text-3xl font-semibold text-slate-900">{kpis?.pending_reminders ?? 0}</p>
          <p className="text-xs text-slate-400 mt-1">Próxima hora</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 min-w-0">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <h3 className="text-sm font-medium text-slate-600 truncate">Ingresos del mes</h3>
            <span className="text-xs bg-teal-50 text-teal-500 px-2 py-1 rounded-full border border-teal-100 flex-shrink-0">USD</span>
          </div>
          <p className="text-2xl sm:text-3xl font-semibold text-slate-900">${kpis?.revenue_this_month ?? 0}</p>
          <p className="text-xs text-slate-400 mt-1">Pagos verificados</p>
        </div>
      </div>

      {/* Accesos rápidos */}
      <div>
        <h3 className="text-xs sm:text-sm font-medium text-slate-400 mb-3 sm:mb-4 uppercase tracking-wider">Acciones rápidas</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
          <a href="/admin/doctors" className="flex items-center justify-between p-3 sm:p-4 rounded-xl border border-slate-200 bg-white hover:border-teal-200 hover:shadow-sm transition-all group">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center flex-shrink-0">
                <Users className="w-4 h-4 text-teal-600" />
              </div>
              <span className="text-xs sm:text-sm text-slate-600 group-hover:text-slate-900 transition-colors truncate">Gestionar médicos</span>
            </div>
            <ArrowUpRight className="w-4 h-4 text-slate-300 group-hover:text-teal-500 transition-colors flex-shrink-0 ml-2" />
          </a>
          <a href="/admin/subscriptions" className="flex items-center justify-between p-3 sm:p-4 rounded-xl border border-slate-200 bg-white hover:border-teal-200 hover:shadow-sm transition-all group">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                <CreditCard className="w-4 h-4 text-blue-600" />
              </div>
              <span className="text-xs sm:text-sm text-slate-600 group-hover:text-slate-900 transition-colors truncate">Ver suscripciones</span>
            </div>
            <ArrowUpRight className="w-4 h-4 text-slate-300 group-hover:text-teal-500 transition-colors flex-shrink-0 ml-2" />
          </a>
          <a href="/admin/reminders" className="flex items-center justify-between p-3 sm:p-4 rounded-xl border border-slate-200 bg-white hover:border-teal-200 hover:shadow-sm transition-all group">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
                <Bell className="w-4 h-4 text-amber-600" />
              </div>
              <span className="text-xs sm:text-sm text-slate-600 group-hover:text-slate-900 transition-colors truncate">Monitor recordatorios</span>
            </div>
            <ArrowUpRight className="w-4 h-4 text-slate-300 group-hover:text-teal-500 transition-colors flex-shrink-0 ml-2" />
          </a>
          <a href="/admin/settings" className="flex items-center justify-between p-3 sm:p-4 rounded-xl border border-slate-200 bg-white hover:border-teal-200 hover:shadow-sm transition-all group">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center flex-shrink-0">
                <Activity className="w-4 h-4 text-slate-600" />
              </div>
              <span className="text-xs sm:text-sm text-slate-600 group-hover:text-slate-900 transition-colors truncate">Configuración</span>
            </div>
            <ArrowUpRight className="w-4 h-4 text-slate-300 group-hover:text-teal-500 transition-colors flex-shrink-0 ml-2" />
          </a>
        </div>
      </div>
    </div>
  )
}