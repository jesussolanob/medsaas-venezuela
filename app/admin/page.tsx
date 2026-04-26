import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import AdminSubscriptionChart from './AdminSubscriptionChart'

// Cache corto de 30s: KPIs frescos sin re-ejecutar todas las queries en cada request
export const revalidate = 30

export default async function AdminDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const adminClient = createAdminClient()

  // ── MoM stats: ahora basadas en profiles.created_at de doctores ──
  let momGrowth = 0
  let newThisMonth = 0

  try {
    const { data: doctors } = await adminClient
      .from('profiles')
      .select('id, created_at')
      .eq('role', 'doctor')
      .order('created_at', { ascending: true })

    if (doctors) {
      const now = new Date()
      const monthCounts: Record<string, number> = {}
      const months: string[] = []

      for (let i = 5; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const monthKey = date.toISOString().slice(0, 7)
        monthCounts[monthKey] = 0
        months.push(monthKey)
      }

      doctors.forEach((d) => {
        const monthKey = new Date(d.created_at).toISOString().slice(0, 7)
        if (monthKey in monthCounts) monthCounts[monthKey]++
      })

      const currentMonthCount = monthCounts[months[months.length - 1]] || 0
      const previousMonthCount = monthCounts[months[months.length - 2]] || 0

      if (previousMonthCount > 0) {
        momGrowth = parseFloat((((currentMonthCount - previousMonthCount) / previousMonthCount) * 100).toFixed(1))
      } else if (currentMonthCount > 0) {
        momGrowth = 100
      }
      newThisMonth = currentMonthCount
    }
  } catch (err) {
    console.error('Error fetching doctor stats:', err)
  }

  // ── Stats: all direct queries (no RPC dependency) ──
  const now = new Date()

  // Today range
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString()

  // Month range
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString()

  // Citas de hoy (appointments + consultations sin appointment)
  let citasHoy = 0
  try {
    const { data: apptsToday } = await adminClient
      .from('appointments')
      .select('id')
      .gte('scheduled_at', todayStart)
      .lte('scheduled_at', todayEnd)

    const { data: consToday } = await adminClient
      .from('consultations')
      .select('id')
      .is('appointment_id', null)
      .gte('consultation_date', todayStart)
      .lte('consultation_date', todayEnd)

    citasHoy = (apptsToday?.length || 0) + (consToday?.length || 0)
  } catch {}

  // Consultas este mes
  let totalCitasMonth = 0
  try {
    const { data: apptCounts } = await adminClient
      .from('appointments')
      .select('id')
      .gte('scheduled_at', startOfMonth)
      .lte('scheduled_at', endOfMonth)

    const { data: consCounts } = await adminClient
      .from('consultations')
      .select('id')
      .is('appointment_id', null)
      .gte('consultation_date', startOfMonth)
      .lte('consultation_date', endOfMonth)

    totalCitasMonth = (apptCounts?.length || 0) + (consCounts?.length || 0)
  } catch {}

  // Total doctores activos
  let totalDoctors = 0
  try {
    const { count } = await adminClient
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'doctor')
      .eq('is_active', true)

    totalDoctors = count ?? 0
  } catch {}

  // Suscripciones activas y trials — ahora desde profiles
  let activeSubscriptions = 0
  let trialSubscriptions = 0
  try {
    const { count: activeCount } = await adminClient
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'doctor')
      .eq('subscription_status', 'active')

    const { count: trialCount } = await adminClient
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'doctor')
      .eq('plan', 'trial')
      .eq('subscription_status', 'active')

    activeSubscriptions = activeCount ?? 0
    trialSubscriptions = trialCount ?? 0
  } catch {}

  // ── Format greeting ──
  const hour = now.getHours()
  const greeting = hour < 12 ? 'Buenos días' : hour < 18 ? 'Buenas tardes' : 'Buenas noches'
  const dateStr = now.toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  // pendingCount eliminado — ya no hay aprobaciones

  // Accent colors for avatars
  // avatarColors eliminado — sin sección de aprobaciones

  return (
    <div className="space-y-6">
      {/* ── Hero Banner ── */}
      <div className="relative overflow-hidden rounded-[24px] p-8 lg:p-10 text-white" style={{ background: 'linear-gradient(135deg, #0891B2 0%, #06B6D4 100%)' }}>
        {/* Background isotipo */}
        <svg className="absolute -right-20 -top-10 opacity-[0.12]" width="340" height="340" viewBox="0 0 120 120" fill="none">
          <path d="M22 78 C 22 38, 56 18, 78 38 C 96 54, 86 82, 62 82 C 46 82, 36 70, 42 56" stroke="#fff" strokeWidth="14" strokeLinecap="round" fill="none"/>
          <path d="M58 92 C 78 92, 92 78, 88 60" stroke="#FF8A65" strokeWidth="14" strokeLinecap="round" fill="none"/>
        </svg>

        <div className="relative z-10">
          <p className="text-xs tracking-[0.1em] uppercase opacity-70 mb-2" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            {dateStr}
          </p>
          <h1 className="text-3xl lg:text-[42px] font-bold tracking-tight leading-tight" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            {greeting}, Delta.
          </h1>
          <p className="text-base opacity-85 mt-2 mb-6 max-w-xl leading-relaxed">
            {newThisMonth > 0 ? `${newThisMonth} especialista${newThisMonth !== 1 ? 's' : ''} nuevo${newThisMonth !== 1 ? 's' : ''} este mes` : 'Sin nuevos especialistas este mes'}
            {momGrowth > 0 ? ` · +${momGrowth}% de crecimiento MoM.` : '.'}
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin/doctors"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-full text-sm font-semibold transition-all"
              style={{ background: '#fff', color: '#0891B2' }}
            >
              Ver especialistas →
            </Link>
          </div>
        </div>
      </div>

      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Especialistas activos', value: totalDoctors, delta: `+${newThisMonth} este mes`, icon: '👤' },
          { label: 'Consultas hoy', value: citasHoy, delta: 'Tiempo real', deltaColor: '#0891B2', icon: '📅' },
          { label: 'Consultas este mes', value: totalCitasMonth, delta: momGrowth > 0 ? `+${momGrowth}% vs. mes anterior` : 'Sin cambio', icon: '❤️' },
          { label: 'Suscripciones activas', value: activeSubscriptions, delta: `${trialSubscriptions} en trial`, icon: '📋' },
        ].map(stat => (
          <div key={stat.label} className="rounded-[22px] bg-white p-5" style={{ border: '1px solid #E8ECF0' }}>
            <div className="flex items-center justify-between mb-3.5">
              <span className="text-[11px] uppercase tracking-[0.08em] font-medium" style={{ color: '#97A3AF', fontFamily: "'JetBrains Mono', monospace" }}>{stat.label}</span>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#ECFEFF', color: '#0891B2' }}>
                <span className="text-sm">{stat.icon}</span>
              </div>
            </div>
            <p className="text-4xl font-bold tracking-tight" style={{ color: '#0F1A2A', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              {typeof stat.value === 'number' ? stat.value.toLocaleString('es-VE') : stat.value}
            </p>
            {stat.delta && (
              <p className="text-xs font-semibold mt-2" style={{ color: stat.deltaColor || '#10B981' }}>{stat.delta}</p>
            )}
          </div>
        ))}
      </div>

      {/* ── Chart suscripciones ── */}
      <div className="rounded-[22px] bg-white p-6" style={{ border: '1px solid #E8ECF0' }}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-base font-bold" style={{ color: '#0F1A2A' }}>Suscripciones · últimos 6 meses</p>
            <p className="text-xs mt-1" style={{ color: '#97A3AF' }}>Crecimiento de la plataforma</p>
          </div>
          {momGrowth > 0 && (
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold" style={{ background: '#D1FAE5', color: '#047857' }}>
              ↑ +{momGrowth}%
            </span>
          )}
        </div>
        <AdminSubscriptionChart />
      </div>

      {/* ── Growth MoM card ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-[22px] bg-white p-6 flex flex-col justify-center" style={{ border: '1px solid #E8ECF0' }}>
          <span className="text-[11px] uppercase tracking-[0.08em] font-medium" style={{ color: '#97A3AF', fontFamily: "'JetBrains Mono', monospace" }}>
            Crecimiento MoM
          </span>
          <p className="text-4xl font-bold mt-2" style={{ color: '#0F1A2A' }}>{momGrowth >= 0 ? '+' : ''}{momGrowth}%</p>
          <p className="text-xs mt-1" style={{ color: '#97A3AF' }}>Vs. mes anterior</p>
          <p className="text-xs font-semibold mt-3" style={{ color: '#10B981' }}>
            {newThisMonth} {newThisMonth !== 1 ? 'nuevas suscripciones' : 'nueva suscripción'}
          </p>
        </div>

        <div className="rounded-[22px] bg-white p-6 flex flex-col justify-center" style={{ border: '1px solid #E8ECF0' }}>
          <span className="text-[11px] uppercase tracking-[0.08em] font-medium" style={{ color: '#97A3AF', fontFamily: "'JetBrains Mono', monospace" }}>
            Total especialistas
          </span>
          <p className="text-4xl font-bold mt-2" style={{ color: '#0F1A2A' }}>{totalDoctors}</p>
          <p className="text-xs mt-1" style={{ color: '#97A3AF' }}>Registrados en la plataforma</p>
          <Link href="/admin/doctors" className="text-xs font-semibold mt-3" style={{ color: '#0891B2' }}>
            Ver listado completo →
          </Link>
        </div>

        <div className="rounded-[22px] bg-white p-6 flex flex-col justify-center" style={{ border: '1px solid #E8ECF0' }}>
          <span className="text-[11px] uppercase tracking-[0.08em] font-medium" style={{ color: '#97A3AF', fontFamily: "'JetBrains Mono', monospace" }}>
            Consultas totales (mes)
          </span>
          <p className="text-4xl font-bold mt-2" style={{ color: '#0F1A2A' }}>
            {totalCitasMonth.toLocaleString('es-VE')}
          </p>
          <p className="text-xs mt-1" style={{ color: '#97A3AF' }}>Appointments + Consultas directas</p>
        </div>
      </div>
    </div>
  )
}
