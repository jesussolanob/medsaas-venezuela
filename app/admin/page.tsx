import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { Users, Calendar, CreditCard, TrendingUp } from 'lucide-react'
import AdminSubscriptionChart from './AdminSubscriptionChart'

// Plan names displayed to the user
const PLAN_LABELS: Record<string, string> = {
  basic: 'Basic',
  professional: 'Professional',
  enterprise: 'Centro de Salud',
  centro_salud: 'Centro de Salud',
}

function getPlanTag(plan?: string | null, status?: string | null): { label: string; color: string } {
  const planName = PLAN_LABELS[plan || ''] || 'Basic'

  // Status determines the color/badge style
  if (status === 'suspended') return { label: `${planName} · Suspendida`, color: 'bg-red-50 text-red-700' }
  if (status === 'active') return { label: planName, color: 'bg-teal-50 text-teal-700' }
  if (status === 'past_due' || status === 'pending_payment') return { label: `${planName} · Pendiente`, color: 'bg-orange-50 text-orange-700' }
  // trial or default — everyone has at least trial
  return { label: `${planName} · Trial`, color: 'bg-amber-50 text-amber-700' }
}

export default async function AdminDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: kpis } = await supabase.rpc('bi_platform_kpis')

  // Use admin client for all queries to bypass RLS
  const adminClient = createAdminClient()

  // Fetch recent doctors (simple query, no joins)
  const { data: recentDoctors } = await adminClient
    .from('profiles')
    .select('id, full_name, specialty, email, created_at, clinic_id')
    .eq('role', 'doctor')
    .order('created_at', { ascending: false })
    .limit(5)

  // Fetch ALL clinics (for doctor plan lookup + active clinics section)
  const { data: allClinics } = await adminClient
    .from('clinics')
    .select('id, name, city, subscription_plan, subscription_status, is_active')
    .order('created_at', { ascending: false })

  // Build a lookup map: clinic_id → clinic data
  const clinicMap: Record<string, { subscription_plan: string; subscription_status: string; name: string; city: string; is_active: boolean }> = {}
  ;(allClinics || []).forEach(c => {
    clinicMap[c.id] = c
  })

  // Filter active clinics for the "Clínicas activas" section
  const activeClinics = (allClinics || []).filter(c => c.is_active).slice(0, 5)

  // Get doctor count per clinic
  const clinicIds = activeClinics.map(c => c.id)
  const { data: clinicDoctorCounts } = clinicIds.length > 0
    ? await adminClient
      .from('profiles')
      .select('clinic_id')
      .in('clinic_id', clinicIds)
    : { data: [] }

  // Count doctors per clinic
  const doctorCountByClinic: Record<string, number> = {}
  ;(clinicDoctorCounts || []).forEach(record => {
    if (record.clinic_id) {
      doctorCountByClinic[record.clinic_id] = (doctorCountByClinic[record.clinic_id] || 0) + 1
    }
  })

  // Fetch subscriptions for ALL recent doctors (source of truth for plan + status)
  const recentDoctorIds = (recentDoctors || []).map(d => d.id)
  const { data: doctorSubscriptions } = recentDoctorIds.length > 0
    ? await adminClient
      .from('subscriptions')
      .select('doctor_id, plan, status')
      .in('doctor_id', recentDoctorIds)
    : { data: [] }

  // Build subscription lookup: doctor_id → { plan, status }
  const subMap: Record<string, { plan: string; status: string }> = {}
  ;(doctorSubscriptions || []).forEach(s => {
    subMap[s.doctor_id] = { plan: s.plan, status: s.status }
  })

  // Fetch subscription stats for MoM calculation
  let momGrowth = 0
  let newThisMonth = 0

  try {
    const { data: subscriptions } = await adminClient
      .from('subscriptions')
      .select('id, created_at')
      .order('created_at', { ascending: true })

    if (subscriptions) {
      const now = new Date()
      const monthCounts: Record<string, number> = {}
      const months = []

      // Initialize last 6 months
      for (let i = 5; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const monthKey = date.toISOString().slice(0, 7)
        monthCounts[monthKey] = 0
        months.push(monthKey)
      }

      // Count subscriptions created in each month
      subscriptions.forEach((sub) => {
        const createdDate = new Date(sub.created_at)
        const monthKey = createdDate.toISOString().slice(0, 7)
        if (monthKey in monthCounts) {
          monthCounts[monthKey]++
        }
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
    console.error('Error fetching subscription stats:', err)
  }

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
          <AdminSubscriptionChart />
        </div>

        {/* Growth MoM Metric */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6 min-w-0 flex flex-col justify-center">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <span className="text-xs text-slate-400 uppercase tracking-wider font-medium">Crecimiento MoM</span>
            <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-semibold text-slate-900">{momGrowth >= 0 ? '+' : ''}{momGrowth}%</p>
          <p className="text-xs text-slate-400 mt-1">Vs. mes anterior</p>
          <p className="text-xs text-emerald-600 font-semibold mt-3">{newThisMonth} nueva{newThisMonth !== 1 ? 's' : ''} suscripción{newThisMonth !== 1 ? 'es' : ''}</p>
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
            {(recentDoctors || []).map((doctor) => {
              // subscriptions table is the source of truth
              const sub = subMap[doctor.id]
              const tag = getPlanTag(sub?.plan, sub?.status)
              return (
                <div key={doctor.id} className="flex items-center justify-between p-3 border border-slate-100 rounded-lg hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-semibold text-xs flex-shrink-0">
                      {doctor.full_name?.charAt(0) || '?'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs sm:text-sm font-medium text-slate-800 truncate">{doctor.full_name}</p>
                      <p className="text-[10px] text-slate-400 truncate">{doctor.specialty}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${tag.color}`}>
                      {tag.label}
                    </span>
                    <span className="text-[10px] text-slate-400 whitespace-nowrap">
                      {new Date(doctor.created_at).toLocaleDateString('es-VE', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Clínicas Activas */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6 min-w-0">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-600">Clínicas activas</h3>
            <a href="/admin/doctors" className="text-xs text-teal-600 hover:text-teal-700 font-semibold">Ver todas</a>
          </div>
          <div className="space-y-2">
            {(activeClinics || []).map((clinic) => {
              const doctorCount = doctorCountByClinic[clinic.id] || 0
              const tag = getPlanTag(clinic.subscription_plan, clinic.subscription_status)
              return (
                <div key={clinic.id} className="flex items-center justify-between p-3 border border-slate-100 rounded-lg hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center text-violet-700 font-semibold text-xs flex-shrink-0">
                      {clinic.name?.charAt(0) || '?'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs sm:text-sm font-medium text-slate-800 truncate">{clinic.name}</p>
                      <p className="text-[10px] text-slate-400 truncate">{doctorCount} médico{doctorCount !== 1 ? 's' : ''} • {clinic.city}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-1 rounded-full flex-shrink-0 ml-2 whitespace-nowrap ${tag.color}`}>
                    {tag.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}