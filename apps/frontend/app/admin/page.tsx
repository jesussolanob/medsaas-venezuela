/**
 * /admin — Dashboard del Super Admin
 * 2026-05-02: rediseño según handoff Delta Health Tech.
 *
 * Layout:
 *   Hero (gradient turquesa con isotipo + saludo + CTA)
 *   ↓
 *   Grid 4 cols × StatCard (KPIs)
 *   ↓
 *   Grid 1.6fr 1fr → [Chart suscripciones 6 meses] + [Aprobaciones pendientes]
 *   ↓
 *   Grid 3 cols → cards secundarias (crecimiento, total esp, consultas mes)
 */

import Link from 'next/link'
import { Users, Calendar, Heart, ClipboardList, ArrowRight, TrendingUp, Sparkles } from 'lucide-react'
import { StatCard, Card, Btn, DeltaMark } from '@/components/dh'
import AdminSubscriptionChart from './AdminSubscriptionChart'
import { backendGet } from '@/lib/api-client.server'

export const revalidate = 30

export default async function AdminDashboard() {
  // ETAPA 1 — agregados de los módulos NestJS `admin` + `billing` vía el BFF (sin Supabase).
  // RBAC (super_admin) lo aplica `proxy.ts` + el backend.
  interface DashboardKpis { totalDoctors: number }
  interface DashboardOverview {
    appointmentsToday: number
    appointmentsThisMonth: number
    activeSubscriptions: number
    trialSubscriptions: number
    recentDoctors: { id: string; fullName: string; specialty: string | null; subscriptionStatus: string; createdAt: string }[]
  }
  interface Growth { momGrowth: number; newThisMonth: number }
  interface FinancePending {
    pendingPayments: { id: string; doctorName: string; specialty: string | null; amountUsd: number; method: string; createdAt: string }[]
  }

  const [dashboardRes, overviewRes, growthRes, financeRes] = await Promise.all([
    backendGet<DashboardKpis>('/api/admin/dashboard'),
    backendGet<DashboardOverview>('/api/admin/dashboard/overview'),
    backendGet<Growth>('/api/admin/subscriptions/growth'),
    backendGet<FinancePending>('/api/admin/finance-stats'),
  ])

  const totalDoctors = dashboardRes.ok ? dashboardRes.value.totalDoctors : 0
  const overview = overviewRes.ok ? overviewRes.value : null
  const citasHoy = overview?.appointmentsToday ?? 0
  const totalCitasMonth = overview?.appointmentsThisMonth ?? 0
  const activeSubscriptions = overview?.activeSubscriptions ?? 0
  const trialSubscriptions = overview?.trialSubscriptions ?? 0
  const momGrowth = growthRes.ok ? growthRes.value.momGrowth : 0
  const newThisMonth = growthRes.ok ? growthRes.value.newThisMonth : 0

  const recentDoctors = (overview?.recentDoctors ?? []).map((d) => ({
    id: d.id,
    full_name: d.fullName,
    specialty: d.specialty,
    subscription_status: d.subscriptionStatus,
    created_at: d.createdAt,
  }))

  const pendingPayments = (financeRes.ok ? financeRes.value.pendingPayments : []).map((p) => ({
    id: p.id,
    doctor_id: '',
    amount_usd: p.amountUsd,
    method: p.method,
    created_at: p.createdAt,
    profiles: { full_name: p.doctorName, specialty: p.specialty } as { full_name: string; specialty: string | null } | null,
  }))

  const now = new Date()

  const hour = now.getHours()
  const greeting = hour < 12 ? 'Buenos días' : hour < 18 ? 'Buenas tardes' : 'Buenas noches'
  const dateStr = now.toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const initial = (recentDoctors[0]?.full_name?.[0] || 'A').toUpperCase()

  return (
    <div className="space-y-5">
      {/* ── Hero ── */}
      <div
        className="relative overflow-hidden rounded-[var(--dh-r-xl)] p-6 sm:p-8 lg:p-10 text-white"
        style={{ background: 'linear-gradient(135deg, var(--dh-turquoise-700) 0%, var(--dh-turquoise) 100%)' }}
      >
        <div className="absolute -right-16 -top-12 opacity-[0.15] pointer-events-none">
          <DeltaMark size={340} primary="#fff" accent="var(--dh-coral)" bold />
        </div>
        <div className="relative z-10 max-w-2xl">
          <p
            className="text-[11px] tracking-[0.12em] uppercase opacity-80 mb-2"
            style={{ fontFamily: 'var(--dh-font-mono)' }}
          >
            {dateStr}
          </p>
          <h1
            className="font-semibold tracking-tight leading-tight"
            style={{ fontFamily: 'var(--dh-font-display)', fontSize: 'clamp(28px, 4vw, 38px)' }}
          >
            {greeting}, Delta.
          </h1>
          <p className="text-base opacity-85 mt-2 mb-6 leading-relaxed">
            {pendingPayments.length > 0 && `${pendingPayments.length} pago${pendingPayments.length !== 1 ? 's' : ''} pendiente${pendingPayments.length !== 1 ? 's' : ''} de revisión, `}
            {newThisMonth > 0
              ? `${newThisMonth} especialista${newThisMonth !== 1 ? 's' : ''} nuevo${newThisMonth !== 1 ? 's' : ''} este mes`
              : 'sin nuevos especialistas este mes'}
            {momGrowth > 0 ? ` y +${momGrowth}% de crecimiento MoM.` : '.'}
          </p>
          <div className="flex flex-wrap gap-2.5">
            <Link
              href={pendingPayments.length > 0 ? '/admin/subscriptions' : '/admin/doctors'}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full text-[13px] font-semibold transition-all hover:-translate-y-px"
              style={{ background: '#fff', color: 'var(--dh-turquoise-700)' }}
            >
              {pendingPayments.length > 0 ? 'Revisar pagos' : 'Ver especialistas'}
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <Link
              href="/admin/doctors"
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full text-[13px] font-semibold transition-all"
              style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)' }}
            >
              Ver especialistas
            </Link>
          </div>
        </div>
      </div>

      {/* ── 4 KPI cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <StatCard
          label="Especialistas activos"
          value={totalDoctors.toLocaleString('es-VE')}
          delta={newThisMonth > 0 ? `+${newThisMonth} este mes` : 'Sin cambios'}
          deltaColor="success"
          icon={<Users size={16} />}
        />
        <StatCard
          label="Consultas hoy"
          value={citasHoy.toLocaleString('es-VE')}
          delta="Tiempo real"
          deltaColor="turquoise"
          icon={<Calendar size={16} />}
        />
        <StatCard
          label="Consultas este mes"
          value={totalCitasMonth.toLocaleString('es-VE')}
          delta={momGrowth > 0 ? `+${momGrowth}% vs. mes anterior` : 'Sin comparación'}
          deltaColor={momGrowth > 0 ? 'success' : 'neutral'}
          icon={<Heart size={16} />}
        />
        <StatCard
          label="Suscripciones activas"
          value={activeSubscriptions.toLocaleString('es-VE')}
          delta={trialSubscriptions > 0 ? `${trialSubscriptions} en trial` : 'Sin trials'}
          deltaColor="success"
          icon={<ClipboardList size={16} />}
        />
      </div>

      {/* ── Chart + Aprobaciones pendientes ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-3.5">
        <Card padding={24}>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div>
              <p className="text-base font-bold" style={{ color: 'var(--dh-ink)' }}>
                Suscripciones · últimos 6 meses
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--dh-gray-400)' }}>
                Crecimiento de la plataforma
              </p>
            </div>
            {momGrowth > 0 && (
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
                style={{ background: '#D1FAE5', color: '#047857' }}
              >
                <TrendingUp className="w-3 h-3" /> +{momGrowth}%
              </span>
            )}
          </div>
          <AdminSubscriptionChart />
        </Card>

        <Card padding={24}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-base font-bold" style={{ color: 'var(--dh-ink)' }}>
                Pagos pendientes
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--dh-gray-400)' }}>
                Cola de revisión
              </p>
            </div>
            {pendingPayments.length > 0 && (
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
                style={{ background: 'var(--dh-coral-100)', color: 'var(--dh-coral-600)' }}
              >
                {pendingPayments.length} {pendingPayments.length === 1 ? 'nuevo' : 'nuevos'}
              </span>
            )}
          </div>

          {pendingPayments.length === 0 ? (
            <div className="text-center py-10">
              <Sparkles className="w-7 h-7 mx-auto mb-2" style={{ color: 'var(--dh-gray-200)' }} />
              <p className="text-sm" style={{ color: 'var(--dh-gray-400)' }}>
                Todo al día. Sin pagos por revisar.
              </p>
            </div>
          ) : (
            <div className="space-y-0">
              {pendingPayments.slice(0, 4).map((p, i) => {
                const fullName = p.profiles?.full_name || 'Doctor/a'
                const specialty = p.profiles?.specialty || '—'
                const init = fullName.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
                return (
                  <Link
                    key={p.id}
                    href="/admin/subscriptions"
                    className={`flex items-center gap-3 py-3 ${i < pendingPayments.length - 1 ? 'border-b' : ''}`}
                    style={{ borderColor: 'var(--dh-gray-100)' }}
                  >
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0"
                      style={{ background: 'var(--dh-turquoise)', fontFamily: 'var(--dh-font-display)' }}
                    >
                      {init}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate" style={{ color: 'var(--dh-ink)' }}>
                        {fullName}
                      </div>
                      <div className="text-[11px] truncate" style={{ color: 'var(--dh-gray-400)' }}>
                        {specialty}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[13px] font-bold" style={{ fontFamily: 'var(--dh-font-mono)' }}>
                        ${Number(p.amount_usd).toFixed(0)}
                      </div>
                      <div className="text-[10px] capitalize" style={{ color: 'var(--dh-gray-400)' }}>
                        {p.method.replace('_', ' ')}
                      </div>
                    </div>
                  </Link>
                )
              })}
              <Link
                href="/admin/subscriptions"
                className="block text-center mt-3 text-xs font-semibold pt-3 border-t"
                style={{ color: 'var(--dh-turquoise-700)', borderColor: 'var(--dh-gray-100)' }}
              >
                Ver todos los pagos →
              </Link>
            </div>
          )}
        </Card>
      </div>

      {/* ── Doctores recientes ── */}
      <Card padding={24}>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <p className="text-base font-bold" style={{ color: 'var(--dh-ink)' }}>
              Especialistas recientes
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--dh-gray-400)' }}>
              Últimos 5 registrados
            </p>
          </div>
          <Btn variant="ghost" size="sm">
            <Link href="/admin/doctors" className="flex items-center gap-1">
              Ver todos <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </Btn>
        </div>

        {recentDoctors.length === 0 ? (
          <p className="text-sm text-center py-8" style={{ color: 'var(--dh-gray-400)' }}>
            Sin doctores registrados aún.
          </p>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--dh-gray-100)' }}>
            {recentDoctors.map(d => {
              const init = (d.full_name || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
              const status = (d.subscription_status || 'active') as 'active' | 'trial' | 'past_due' | 'suspended'
              const statusColors: Record<string, { bg: string; fg: string }> = {
                active:    { bg: '#D1FAE5', fg: '#047857' },
                trial:     { bg: '#DBEAFE', fg: '#1E40AF' },
                past_due:  { bg: '#FED7AA', fg: '#9A3412' },
                suspended: { bg: '#FEE2E2', fg: '#B91C1C' },
              }
              const c = statusColors[status] || statusColors.active
              const dateRel = new Date(d.created_at).toLocaleDateString('es-VE', { day: 'numeric', month: 'short' })
              return (
                <div key={d.id} className="flex items-center gap-3 py-3" style={{ borderColor: 'var(--dh-gray-100)' }}>
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0"
                    style={{ background: 'var(--dh-coral)', fontFamily: 'var(--dh-font-display)' }}
                  >
                    {init}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate" style={{ color: 'var(--dh-ink)' }}>
                      {d.full_name || 'Sin nombre'}
                    </div>
                    <div className="text-[11px] truncate" style={{ color: 'var(--dh-gray-400)' }}>
                      {d.specialty || 'Sin especialidad'}
                    </div>
                  </div>
                  <span
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize shrink-0"
                    style={{ background: c.bg, color: c.fg }}
                  >
                    {status === 'past_due' ? 'Vencido' : status}
                  </span>
                  <span
                    className="text-[11px] shrink-0 hidden sm:inline"
                    style={{ color: 'var(--dh-gray-400)', fontFamily: 'var(--dh-font-mono)' }}
                  >
                    {dateRel}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
