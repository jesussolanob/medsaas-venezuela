import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Users, Calendar, CreditCard, TrendingUp } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

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

      {/* Segunda fila: Chart + Métrica de Crecimiento */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
        {/* Subscriptions Chart - Takes 2 columns on large screens */}
        <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-4 sm:p-6 min-w-0">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-600">Suscripciones Mes a Mes</h3>
            <span className="text-xs bg-teal-50 text-teal-600 px-2 py-1 rounded-full border border-teal-100">Últimos 6 meses</span>
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart
              data={[
                { month: 'Nov', count: 12 },
                { month: 'Dic', count: 18 },
                { month: 'Ene', count: 25 },
                { month: 'Feb', count: 32 },
                { month: 'Mar', count: 38 },
                { month: 'Abr', count: 45 },
              ]}
              margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
            >
              <defs>
                <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#14b8a6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="month" stroke="#94a3b8" style={{ fontSize: '12px' }} />
              <YAxis stroke="#94a3b8" style={{ fontSize: '12px' }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                labelStyle={{ color: '#1e293b' }}
              />
              <Area type="monotone" dataKey="count" stroke="#0d9488" strokeWidth={2} fillOpacity={1} fill="url(#colorCount)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Growth MoM Metric */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6 min-w-0 flex flex-col justify-center">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <span className="text-xs text-slate-400 uppercase tracking-wider font-medium">Crecimiento MoM</span>
            <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-semibold text-slate-900">+18.4%</p>
          <p className="text-xs text-slate-400 mt-1">Vs. mes anterior</p>
          <p className="text-xs text-emerald-600 font-semibold mt-3">7 nuevas suscripciones</p>
        </div>
      </div>

      {/* Tercera fila: Médicos Activos + Clínicas Activas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        {/* Médicos Activos */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6 min-w-0">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-600">Últimos médicos registrados</h3>
            <a href="/admin/doctors" className="text-xs text-teal-600 hover:text-teal-700 font-semibold">Ver todos</a>
          </div>
          <div className="space-y-2">
            {/* Sample doctors - in production, this would come from the database */}
            {[
              { id: '1', name: 'Dr. Carlos Ramírez', specialty: 'Cardiología', email: 'carlos@email.com', createdAt: '2024-04-15' },
              { id: '2', name: 'Dra. María López', specialty: 'Dermatología', email: 'maria@email.com', createdAt: '2024-04-14' },
              { id: '3', name: 'Dr. Juan Pérez', specialty: 'Pediatría', email: 'juan@email.com', createdAt: '2024-04-13' },
              { id: '4', name: 'Dra. Ana González', specialty: 'Ginecología', email: 'ana@email.com', createdAt: '2024-04-12' },
              { id: '5', name: 'Dr. Roberto Silva', specialty: 'Neurología', email: 'roberto@email.com', createdAt: '2024-04-11' },
            ].map((doctor) => (
              <div key={doctor.id} className="flex items-center justify-between p-3 border border-slate-100 rounded-lg hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-semibold text-xs flex-shrink-0">
                    {doctor.name.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs sm:text-sm font-medium text-slate-800 truncate">{doctor.name}</p>
                    <p className="text-[10px] text-slate-400 truncate">{doctor.specialty}</p>
                  </div>
                </div>
                <span className="text-[10px] text-slate-400 flex-shrink-0 ml-2 whitespace-nowrap">
                  {new Date(doctor.createdAt).toLocaleDateString('es-VE', { month: 'short', day: 'numeric' })}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Clínicas Activas */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6 min-w-0">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-600">Clínicas activas</h3>
            <a href="/admin/clinics" className="text-xs text-teal-600 hover:text-teal-700 font-semibold">Ver todas</a>
          </div>
          <div className="space-y-2">
            {/* Sample clinics - in production, this would come from the database */}
            {[
              { id: '1', name: 'Centro Médico Ávila', city: 'Caracas', doctors: 3, status: 'active' },
              { id: '2', name: 'Clínica San Cristóbal', city: 'Caracas', doctors: 2, status: 'active' },
              { id: '3', name: 'Centro de Salud Metropolitano', city: 'Valencia', doctors: 5, status: 'active' },
              { id: '4', name: 'Clínica Integral Plus', city: 'Maracaibo', doctors: 4, status: 'active' },
              { id: '5', name: 'Centro Médico del Este', city: 'Caracas', doctors: 2, status: 'trial' },
            ].map((clinic) => (
              <div key={clinic.id} className="flex items-center justify-between p-3 border border-slate-100 rounded-lg hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center text-violet-700 font-semibold text-xs flex-shrink-0">
                    {clinic.name.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs sm:text-sm font-medium text-slate-800 truncate">{clinic.name}</p>
                    <p className="text-[10px] text-slate-400 truncate">{clinic.doctors} médico{clinic.doctors !== 1 ? 's' : ''} • {clinic.city}</p>
                  </div>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-1 rounded-full flex-shrink-0 ml-2 whitespace-nowrap ${clinic.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                  {clinic.status === 'active' ? 'Activa' : 'Trial'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}