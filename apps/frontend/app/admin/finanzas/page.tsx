/**
 * /admin/finanzas — Finanzas globales del SaaS
 * 2026-05-02: nueva ruta del design Delta Health Tech.
 * Muestra ingresos por suscripciones aprobadas + transacciones recientes.
 *
 * NOTA: este es el panel admin (vista global de la plataforma).
 * Distinto del /doctor/finances (que es del doctor individual).
 */

import { backendGet } from '@/lib/api-client.server'
import { TrendingUp, DollarSign, ClipboardList, CheckCircle2 } from 'lucide-react'
import { PageHead, StatCard, Card, StatusPill } from '@/components/dh'

export const revalidate = 60

export default async function AdminFinanzasPage() {
  // ETAPA 1 — agregados del módulo NestJS `billing` (`GET /api/admin/finance-stats`) vía el BFF.
  // Sin Supabase. RBAC (super_admin) lo aplica `proxy.ts` + el backend.
  interface FinanceStats {
    mtdRevenue: number
    prevMtdRevenue: number
    momChange: number
    pendingTotal: number
    pendingCount: number
    totalApproved: number
    monthBuckets: { label: string; total: number }[]
    recentApproved: { id: string; doctorName: string; amountUsd: number; method: string; reviewedAt: string | null }[]
  }
  const statsRes = await backendGet<FinanceStats>('/api/admin/finance-stats')
  const stats = statsRes.ok ? statsRes.value : null

  const mtdRevenue = stats?.mtdRevenue ?? 0
  const prevMtdRevenue = stats?.prevMtdRevenue ?? 0
  const momChange = stats?.momChange ?? 0
  const pendingTotal = stats?.pendingTotal ?? 0
  const pendingCount = stats?.pendingCount ?? 0
  const totalApproved = stats?.totalApproved ?? 0
  const monthBuckets = stats?.monthBuckets ?? []
  const maxMonthTotal = Math.max(1, ...monthBuckets.map(b => b.total))

  // Transacciones recientes — mapeadas a la forma que consume el JSX existente.
  const allApproved = (stats?.recentApproved ?? []).map(t => ({
    id: t.id,
    amount_usd: t.amountUsd,
    method: t.method,
    reviewed_at: t.reviewedAt,
    created_at: t.reviewedAt,
    profiles: { full_name: t.doctorName, specialty: null as string | null },
  }))

  return (
    <div>
      <PageHead
        title="Finanzas"
        subtitle="Ingresos globales por suscripciones de la plataforma"
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-5">
        <StatCard
          label="Ingresos MTD"
          value={`$${mtdRevenue.toLocaleString('es-VE', { maximumFractionDigits: 0 })}`}
          icon={<DollarSign size={16} />}
          delta={momChange !== 0 ? `${momChange > 0 ? '+' : ''}${momChange}% vs. mes anterior` : 'Sin comparación'}
          deltaColor={momChange >= 0 ? 'success' : 'error'}
        />
        <StatCard
          label="Pendientes"
          value={`$${pendingTotal.toLocaleString('es-VE', { maximumFractionDigits: 0 })}`}
          icon={<ClipboardList size={16} />}
          delta={pendingCount > 0 ? `${pendingCount} comprobante${pendingCount > 1 ? 's' : ''} sin revisar` : 'Todo al día'}
          deltaColor={pendingCount > 0 ? 'error' : 'success'}
        />
        <StatCard
          label="Pagos aprobados"
          value={(totalApproved || 0).toLocaleString('es-VE')}
          icon={<CheckCircle2 size={16} />}
          delta="Histórico total"
          deltaColor="success"
        />
        <StatCard
          label="Mes anterior"
          value={`$${prevMtdRevenue.toLocaleString('es-VE', { maximumFractionDigits: 0 })}`}
          icon={<TrendingUp size={16} />}
          delta="Comparativo MoM"
          deltaColor="neutral"
        />
      </div>

      {/* Chart + transactions side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-3.5 mb-5">
        <Card padding={24}>
          <div className="mb-4">
            <p className="text-base font-bold" style={{ color: 'var(--dh-ink)' }}>Ingresos mensuales</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--dh-gray-400)' }}>Últimos 6 meses</p>
          </div>
          {/* SVG bars chart */}
          <svg width="100%" height="200" viewBox="0 0 600 200" preserveAspectRatio="none">
            {[40, 90, 140].map(y => (
              <line key={y} x1="0" y1={y} x2="600" y2={y} stroke="#E8ECF0" strokeDasharray="3,4" />
            ))}
            {monthBuckets.map((b, i) => {
              const h = (b.total / maxMonthTotal) * 140
              const isLast = i === monthBuckets.length - 1
              const x = 40 + i * 90
              return (
                <g key={i}>
                  <rect
                    x={x}
                    y={180 - h}
                    width="50"
                    height={h}
                    rx="6"
                    fill={isLast ? 'var(--dh-turquoise)' : 'var(--dh-turquoise-100)'}
                  />
                  {isLast && <rect x={x} y={180 - h} width="50" height="6" rx="3" fill="var(--dh-coral)" />}
                </g>
              )
            })}
          </svg>
          <div
            className="flex justify-around mt-2.5"
            style={{ fontSize: 11, color: 'var(--dh-gray-400)', fontFamily: 'var(--dh-font-mono)' }}
          >
            {monthBuckets.map((b, i) => (
              <span key={i}>{b.label}</span>
            ))}
          </div>
        </Card>

        <Card padding={24}>
          <p className="text-base font-bold mb-4" style={{ color: 'var(--dh-ink)' }}>Resumen del mes</p>

          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs" style={{ color: 'var(--dh-gray-600)' }}>Ingreso total</span>
                <span className="font-bold" style={{ fontFamily: 'var(--dh-font-mono)' }}>${mtdRevenue.toFixed(2)}</span>
              </div>
              <div className="h-1.5 rounded-full" style={{ background: 'var(--dh-gray-100)' }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, (mtdRevenue / Math.max(1, mtdRevenue + pendingTotal)) * 100)}%`,
                    background: 'var(--dh-success)',
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs" style={{ color: 'var(--dh-gray-600)' }}>Pendientes</span>
                <span className="font-bold" style={{ fontFamily: 'var(--dh-font-mono)' }}>${pendingTotal.toFixed(2)}</span>
              </div>
              <div className="h-1.5 rounded-full" style={{ background: 'var(--dh-gray-100)' }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, (pendingTotal / Math.max(1, mtdRevenue + pendingTotal)) * 100)}%`,
                    background: 'var(--dh-coral)',
                  }}
                />
              </div>
            </div>

            <div className="border-t pt-3" style={{ borderColor: 'var(--dh-gray-100)' }}>
              <div className="flex items-center justify-between text-sm">
                <span style={{ color: 'var(--dh-gray-600)' }}>Esperado total</span>
                <span className="font-bold text-base" style={{ color: 'var(--dh-ink)', fontFamily: 'var(--dh-font-mono)' }}>
                  ${(mtdRevenue + pendingTotal).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Transacciones recientes */}
      <Card padding={0}>
        <div
          className="flex items-center justify-between flex-wrap gap-2"
          style={{ padding: '18px 24px', borderBottom: '1px solid var(--dh-gray-100)' }}
        >
          <div className="text-[15px] font-bold" style={{ color: 'var(--dh-ink)' }}>
            Transacciones recientes
          </div>
          <a
            href="/admin/aprobaciones"
            className="text-xs font-semibold"
            style={{ color: 'var(--dh-turquoise-700)' }}
          >
            Ver cola de aprobación →
          </a>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr style={{ background: 'var(--dh-gray-50)' }}>
                {['ID', 'Fecha', 'Especialista', 'Monto', 'Método', 'Estado'].map(h => (
                  <th
                    key={h}
                    className="text-left"
                    style={{
                      padding: '12px 20px', fontSize: 10, fontFamily: 'var(--dh-font-mono)',
                      color: 'var(--dh-gray-600)', textTransform: 'uppercase', letterSpacing: '.08em',
                      fontWeight: 500,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allApproved.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12" style={{ color: 'var(--dh-gray-400)' }}>
                    Sin transacciones aún
                  </td>
                </tr>
              ) : (
                allApproved.map((t: any, i: number) => {
                  const doctor: any = Array.isArray(t.profiles) ? t.profiles[0] : t.profiles
                  return (
                    <tr key={t.id} style={{ borderTop: '1px solid var(--dh-gray-100)' }}>
                      <td
                        style={{
                          padding: '14px 20px', fontFamily: 'var(--dh-font-mono)',
                          color: 'var(--dh-turquoise-700)', fontWeight: 600, fontSize: 12,
                        }}
                      >
                        {t.id.slice(0, 8).toUpperCase()}
                      </td>
                      <td
                        style={{
                          padding: '14px 20px', fontFamily: 'var(--dh-font-mono)',
                          color: 'var(--dh-gray-600)',
                        }}
                      >
                        {new Date(t.reviewed_at || t.created_at).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td style={{ padding: '14px 20px', fontWeight: 500 }}>
                        {doctor?.full_name || 'Doctor/a'}
                      </td>
                      <td
                        style={{
                          padding: '14px 20px', fontFamily: 'var(--dh-font-mono)',
                          fontWeight: 600,
                        }}
                      >
                        ${Number(t.amount_usd).toFixed(2)}
                      </td>
                      <td className="capitalize" style={{ padding: '14px 20px', color: 'var(--dh-gray-600)' }}>
                        {t.method.replace('_', ' ')}
                      </td>
                      <td style={{ padding: '14px 20px' }}>
                        <StatusPill status="approved" size="sm" />
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
