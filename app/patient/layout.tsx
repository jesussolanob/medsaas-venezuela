'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard, Calendar, FileText, Pill, MessageCircle,
  User, LogOut, Settings, Menu, X, Activity, ChevronDown
} from 'lucide-react'
import { clsx } from 'clsx'
import { createClient } from '@/lib/supabase/client'

type NavItem = { name: string; href: string; icon: any }

const navItems: NavItem[] = [
  { name: 'Inicio', href: '/patient', icon: LayoutDashboard },
  { name: 'Mis citas', href: '/patient/appointments', icon: Calendar },
  { name: 'Mis informes', href: '/patient/reports', icon: FileText },
  { name: 'Mi perfil', href: '/patient/profile', icon: User },
]

function isPathActive(pathname: string, href: string) {
  if (href === '/patient') return pathname === '/patient'
  return pathname === href || pathname.startsWith(href + '/')
}

// Public routes that don't need auth or sidebar
const publicRoutes = ['/patient/login', '/patient/register']

export default function PatientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [doctorName, setDoctorName] = useState('')
  const [loading, setLoading] = useState(true)
  const isPublicRoute = publicRoutes.some(r => pathname.startsWith(r))

  useEffect(() => {
    // Skip auth check for public routes
    if (isPublicRoute) {
      setLoading(false)
      return
    }

    const checkAuth = async () => {
      try {
        const supabase = createClient()
        const { data: { user: authUser }, error: userErr } = await supabase.auth.getUser()

        if (userErr || !authUser) {
          router.push('/patient/login')
          return
        }

        setUser(authUser)

        // Get patient info to show doctor name
        const { data: patients } = await supabase
          .from('patients')
          .select('id')
          .eq('auth_user_id', authUser.id)
          .maybeSingle()

        if (patients?.id) {
          const { data: appointments } = await supabase
            .from('appointments')
            .select('doctor_id')
            .eq('auth_user_id', authUser.id)
            .limit(1)
            .maybeSingle()

          if (appointments?.doctor_id) {
            const { data: doctor } = await supabase
              .from('profiles')
              .select('full_name')
              .eq('id', appointments.doctor_id)
              .single()

            if (doctor?.full_name) {
              setDoctorName(doctor.full_name)
            }
          }
        }

        setLoading(false)
      } catch (err) {
        console.error('Auth check error:', err)
        router.push('/patient/login')
      }
    }

    checkAuth()
  }, [router, isPublicRoute])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/patient/login')
  }

  const activeTitle = navItems.find(i => isPathActive(pathname, i.href))?.name ?? 'Portal del Paciente'

  const NavLink = ({ item }: { item: NavItem }) => {
    const active = isPathActive(pathname, item.href)
    return (
      <Link
        href={item.href}
        onClick={() => setMobileOpen(false)}
        className={clsx(
          'flex items-center gap-3 px-3 py-2.5 rounded-r-lg text-sm transition-all border-l-3',
          active
            ? 'nav-active-patient text-teal-600 font-semibold border-teal-500'
            : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50 border-transparent'
        )}
      >
        <item.icon className={clsx('w-4 h-4 shrink-0', active ? 'text-teal-500' : '')} />
        {item.name}
      </Link>
    )
  }

  const SidebarInner = (
    <>
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-100">
        <div className="w-9 h-9 rounded-xl g-logo flex items-center justify-center shadow-md shadow-cyan-200">
          <Activity className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-sm font-bold leading-none g-text-logo">Delta</p>
          <p className="text-[10px] text-slate-400 mt-0.5 font-medium">Portal Paciente</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map(i => <NavLink key={i.href} item={i} />)}
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 border-t border-slate-100 space-y-3">
        {/* User info */}
        <div className="px-3 py-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-teal-500 flex items-center justify-center flex-shrink-0">
              <User className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-900 truncate">
                {user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Paciente'}
              </p>
              {doctorName && (
                <p className="text-[10px] text-slate-500 truncate">Con: {doctorName}</p>
              )}
            </div>
          </div>
        </div>

        {/* Logout button */}
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-400 hover:text-red-500 hover:bg-red-50 w-full transition-all"
        >
          <LogOut className="w-4 h-4" />
          Cerrar sesión
        </button>
      </div>
    </>
  )

  // Public routes: render just children, no sidebar
  if (isPublicRoute) {
    return <>{children}</>
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-teal-500 flex items-center justify-center mx-auto animate-pulse">
            <Activity className="w-6 h-6 text-white" />
          </div>
          <p className="text-slate-500 font-medium">Cargando...</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        .patient-layout * { font-family: 'Inter', sans-serif; }
        .g-logo { background: linear-gradient(135deg, #00C4CC 0%, #0891b2 100%); }
        .g-text-logo { background: linear-gradient(135deg, #00C4CC, #0891b2); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .nav-active-patient { background: linear-gradient(135deg, rgba(0,196,204,0.1) 0%, rgba(8,145,178,0.08) 100%); }
      `}</style>

      <div className="patient-layout flex min-h-screen bg-slate-50 text-slate-900">
        {/* Mobile overlay */}
        {mobileOpen && (
          <div
            className="fixed inset-0 bg-black/40 z-40 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          className={clsx(
            'fixed inset-y-0 left-0 w-[240px] flex flex-col border-r border-slate-200 bg-white z-50 transition-transform',
            mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
          )}
        >
          {SidebarInner}
        </aside>

        {/* Main content */}
        <div className="flex-1 lg:ml-[240px] flex flex-col min-h-screen w-full">
          {/* Top bar */}
          <header className="sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6 lg:px-8 py-4 border-b border-slate-200 bg-white/80 backdrop-blur">
            <div className="flex items-center gap-3">
              <button
                className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-slate-100"
                onClick={() => setMobileOpen(true)}
                aria-label="Abrir menú"
              >
                <Menu className="w-5 h-5 text-slate-600" />
              </button>
              <h1 className="text-sm font-semibold text-slate-700">{activeTitle}</h1>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden sm:inline-flex text-xs text-slate-400 bg-slate-100 px-3 py-1 rounded-full font-medium">
                Delta
              </span>
            </div>
          </header>

          {/* Page content */}
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
