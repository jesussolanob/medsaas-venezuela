'use client'

import { useState, useEffect } from 'react'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { TrendingUp, Users, DollarSign, Activity, RefreshCw } from 'lucide-react'
import { getFinanceStats } from './actions'

type Period = 'day' | 'week' | 'month'

const PERIOD_LABELS: Record<Period, string> = { day: 'Día', week: 'Semana', month: 'Mes' }

export default function AdminFinancesPage() {
  const [period, setPeriod] = useState<Period>('day')
  const [data, setData] = useState<Awaited<ReturnType<typeof getFinanceStats>> | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    getFinanceStats(period).then(d => { setData(d); setLoading(false) })
  }, [period])

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');* { font-family: 'Inter', sans-serif; }.recharts-tooltip-wrapper{font-family:'Inter',sans-serif;font-size:12px}`}</style>

      <div className="space-y-4 sm:space-y-6 w-full max-w-6xl px-4 sm:px-0">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900">Finanzas & Analíticas</h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Seguimiento de registros, ingresos y distribución por especialidad</p>
          </div>
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1 flex-shrink-0">
            {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`px-3 sm:px-4 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${period === p ? 'bg-white text-teal-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
          <KPICard icon={<Users className="w-5 h-5 text-teal-500" />} label="Nuevos médicos" value={loading ? '…' : String(data?.totalDoctors ?? 0)} sub={`últimos registros`} color="teal" />
          <KPICard icon={<DollarSign className="w-5 h-5 text-emerald-500" />} label="Ingresos USD" value={loading ? '…' : `$${(data?.totalIncome ?? 0).toLocaleString()}`} sub={`${data?.totalPayments ?? 0} pagos aprobados`} color="emerald" />
          <KPICard icon={<Activity className="w-5 h-5 text-violet-500" />} label="Especialidades" value={loading ? '…' : String(data?.specialties.length ?? 0)} sub="distintas activas" color="violet" />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-32">
            <div className="flex items-center gap-2 text-slate-400">
              <RefreshCw className="w-5 h-5 animate-spin" />
              <span className="text-sm">Cargando datos...</span>
            </div>
          </div>
        ) : (
          <div className="space-y-4 sm:space-y-6">
            {/* Registros de médicos */}
            <ChartCard title="Nuevos registros de médicos" subtitle={`Agrupado por ${PERIOD_LABELS[period].toLowerCase()}`} icon={<Users className="w-4 h-4 text-teal-500" />}>
              {(data?.registrations.length ?? 0) === 0 ? (
                <EmptyChart label="Sin registros en este período" />
              ) : (
                <ResponsiveContainer width="100%" height={180} className="sm:h-[220px]">
                  <AreaChart data={data?.registrations} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#00C4CC" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#00C4CC" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }} />
                    <Area type="monotone" dataKey="count" name="Médicos" stroke="#00C4CC" strokeWidth={2.5} fill="url(#g1)" dot={{ fill: '#00C4CC', r: 3 }} activeDot={{ r: 5 }} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            {/* Ingresos */}
            <ChartCard title="Ingresos por suscripciones" subtitle="Solo pagos aprobados por el administrador" icon={<TrendingUp className="w-4 h-4 text-emerald-500" />}>
              {(data?.income.length ?? 0) === 0 ? (
                <EmptyChart label="Sin ingresos aprobados en este período" />
              ) : (
                <ResponsiveContainer width="100%" height={180} className="sm:h-[220px]">
                  <AreaChart data={data?.income} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }} formatter={(v) => [`$${v as number}`, 'Ingresos USD']} />
                    <Area type="monotone" dataKey="amount" name="Ingresos (USD)" stroke="#10b981" strokeWidth={2.5} fill="url(#g2)" dot={{ fill: '#10b981', r: 3 }} activeDot={{ r: 5 }} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            {/* Especialidades */}
            <ChartCard title="Médicos por especialidad" subtitle="Top 10 especialidades registradas" icon={<Activity className="w-4 h-4 text-violet-500" />}>
              {(data?.specialties.length ?? 0) === 0 ? (
                <EmptyChart label="Sin datos de especialidades" />
              ) : (
                <ResponsiveContainer width="100%" height={220} className="sm:h-[260px]">
                  <BarChart data={data?.specialties} layout="vertical" margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="g3" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#00C4CC" />
                        <stop offset="100%" stopColor="#0891b2" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <YAxis type="category" dataKey="specialty" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={90} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }} />
                    <Bar dataKey="count" name="Médicos" fill="url(#g3)" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>
        )}
      </div>
    </>
  )
}

function KPICard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub: string; color: string }) {
  const bg: Record<string, string> = { teal: 'bg-teal-50', emerald: 'bg-emerald-50', violet: 'bg-violet-50' }
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex items-start gap-3 sm:gap-4 min-w-0">
      <div className={`w-10 h-10 rounded-xl ${bg[color]} flex items-center justify-center flex-shrink-0`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-slate-500 font-medium truncate">{label}</p>
        <p className="text-xl sm:text-2xl font-bold text-slate-900 mt-0.5">{value}</p>
        <p className="text-xs text-slate-400 mt-0.5 truncate">{sub}</p>
      </div>
    </div>
  )
}

function ChartCard({ title, subtitle, icon, children }: { title: string; subtitle: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6">
      <div className="flex items-start gap-2 mb-4 sm:mb-5">
        {icon}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate">{title}</p>
          <p className="text-xs text-slate-400 mt-0.5 truncate">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  )
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-[220px]">
      <div className="text-center">
        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
          <Activity className="w-5 h-5 text-slate-300" />
        </div>
        <p className="text-sm text-slate-400">{label}</p>
      </div>
    </div>
  )
}
