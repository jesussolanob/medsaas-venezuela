'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard, Calendar, ClipboardList, Users,
  DollarSign, Settings, LogOut, Activity, Menu
} from 'lucide-react'
import { clsx } from 'clsx'
import { createClient } from '@/lib/supabase/client'
import {
  buildSubscriptionInfo, isMvpFeatureEnabled,
  getPlanLabel, getStatusLabel, type SubscriptionInfo
} from '@/lib/subscription'

type NavItem = { name: string; href: string; icon: any; featureKey: string }

const navItems: NavItem[] = [
  { name: 'Inicio',      href: '/doctor',              icon: LayoutDashboard, featureKey: 'dashboard' },
  { name: 'Agenda',      href: '/doctor/agenda',       icon: Calendar,        featureKey: 'agenda' },
  { name: 'Pacientes',   href: '/doctor/patients',     icon: Users,           featureKey: 'patients' },
  { name: 'Consultas',   href: '/doctor/consultations',icon: ClipboardList,   featureKey: 'consultations' },
  { name: 'Finanzas',    href: '/doctor/finances',     icon: DollarSign,      featureKey: 'finances' },
]

function isPathActive(pathname: string, href: string) {
  if (href === '/doctor') return pathname === '/doctor'
  return pathname === href || pathname.startsWith(href + '/')
}

export default function DoctorLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [subInfo, setSubInfo] = useState<SubscriptionInfo | null>(null)

  // Fetch subscription info once on mount
  useEffect(() => {
    const supabase = createClient()

    async function loadSubscription() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data: subscription } = await supabase
          .from('subscriptions')
          .select('plan, status, current_period_end')
          .eq('doctor_id', user.id)
          .maybeSingle()

        setSubInfo(buildSubscriptionInfo(subscription))
      } catch (error) {
        console.error('Error fetching subscription:', error)
        setSubInfo(buildSubscriptionInfo(null))
      }
    }

    loadSubscription()
  }, [])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const activeTitle = navItems.find(i => isPathActive(pathname, i.href))?.name
    ?? (pathname.includes('/settings') ? 'Configuración' : 'Portal Médico')

  const isActive = subInfo?.isActive ?? false

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        .doctor-layout * { font-family: 'Inter', sans-serif; }
        .g-logo { background: linear-gradient(135deg, #00C4CC 0%, #0891b2 100%); }
        .g-text-logo { background: linear-gradient(135deg, #00C4CC, #0891b2); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .nav-active-doc { background: linear-gradient(135deg, rgba(0,196,204,0.1) 0%, rgba(8,145,178,0.08) 100%); border-left: 3px solid #00C4CC; }
        .nav-item-doc { border-left: 3px solid transparent; }
      `}</style>

      <div className="doctor-layout flex min-h-screen bg-slate-50 text-slate-900">
        {mobileOpen && (
          <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setMobileOpen(false)} />
        )}

        {/* Sidebar */}
        <aside className={clsx(
          'fixed inset-y-0 left-0 w-[240px] flex flex-col border-r border-slate-200 bg-white z-50 transition-transform',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}>
          {/* Logo */}
          <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-100">
            <div className="w-9 h-9 rounded-xl g-logo flex items-center justify-center shadow-md shadow-cyan-200">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold leading-none g-text-logo">Delta Medical CRM</p>
              <p className="text-[10px] text-slate-400 mt-0.5 font-medium">Portal Médico</p>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
            {navItems.map(item => {
              const active = isPathActive(pathname, item.href)
              const enabled = isMvpFeatureEnabled(item.featureKey, isActive)

              if (!enabled) {
                return (
                  <div
                    key={item.href}
                    className="nav-item-doc flex items-center gap-3 px-3 py-2.5 rounded-r-lg text-sm text-slate-300 cursor-not-allowed"
                    title="Activa tu suscripción para acceder"
                  >
                    <item.icon className="w-4 h-4" />
                    {item.name}
                  </div>
                )
              }

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={clsx(
                    'nav-item-doc flex items-center gap-3 px-3 py-2.5 rounded-r-lg text-sm transition-all',
                    active
                      ? 'nav-active-doc text-teal-600 font-semibold'
                      : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                  )}
                >
                  <item.icon className={clsx('w-4 h-4 shrink-0', active && 'text-teal-500')} />
                  {item.name}
                </Link>
              )
            })}
          </nav>

          {/* Subscription badge + footer */}
          <div className="px-3 py-4 border-t border-slate-100 space-y-2">
            {subInfo && (
              <div className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200">
                <p className="text-[10px] text-slate-400 uppercase font-semibold">Tu plan</p>
                <p className="text-xs font-bold text-slate-700">{subInfo.planLabel}</p>
                <p className="text-[10px] text-slate-400">
                  {subInfo.statusLabel}
                  {subInfo.daysRemaining >= 0 && ` · ${subInfo.daysRemaining}d restantes`}
                </p>
              </div>
            )}

            <Link
              href="/doctor/settings"
              onClick={() => setMobileOpen(false)}
              className={clsx(
                'nav-item-doc flex items-center gap-3 px-3 py-2.5 rounded-r-lg text-sm transition-all',
                pathname.includes('/settings')
                  ? 'nav-active-doc text-teal-600 font-semibold'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
              )}
            >
              <Settings className="w-4 h-4" />
              Configuración
            </Link>

            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-400 hover:text-red-500 hover:bg-red-50 w-full transition-all"
            >
              <LogOut className="w-4 h-4" />
              Cerrar sesión
            </button>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 lg:ml-[240px] flex flex-col min-h-screen w-full">
          <header className="sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6 lg:px-8 py-4 border-b border-slate-200 bg-white/80 backdrop-blur">
            <div className="flex items-center gap-3">
              <button
                className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-slate-100"
                onClick={() => setMobileOpen(true)}
              >
                <Menu className="w-5 h-5 text-slate-600" />
              </button>
              <h1 className="text-sm font-semibold text-slate-700">{activeTitle}</h1>
            </div>
            <span className="hidden sm:inline-flex text-xs text-slate-400 bg-slate-100 px-3 py-1 rounded-full font-medium">
              Delta Medical CRM
            </span>
          </header>

          <main className="flex-1 px-4 sm:px-6 lg:px-10 py-6 lg:py-8 w-full">
            <div className="max-w-6xl xl:max-w-7xl mx-auto w-full">
              {children}
            </div>
          </main>
        </div>
      </div>
    </>
  )
}
