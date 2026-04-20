'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard, Calendar, FileText, Pill, MessageCircle,
  User, LogOut, Menu, Bell
} from 'lucide-react'
import { clsx } from 'clsx'
import { createClient } from '@/lib/supabase/client'
import SearchCommandPalette from './SearchCommandPalette'

type NavItem = { name: string; href: string; icon: any }

const navItems: NavItem[] = [
  { name: 'Inicio', href: '/patient', icon: LayoutDashboard },
  { name: 'Mis citas', href: '/patient/appointments', icon: Calendar },
  { name: 'Mis informes', href: '/patient/reports', icon: FileText },
  { name: 'Recetas', href: '/patient/prescriptions', icon: Pill },
  { name: 'Mensajes', href: '/patient/messages', icon: MessageCircle },
  { name: 'Mi perfil', href: '/patient/profile', icon: User },
]

function isPathActive(pathname: string, href: string) {
  if (href === '/patient') return pathname === '/patient'
  return pathname === href || pathname.startsWith(href + '/')
}

const publicRoutes = ['/patient/login', '/patient/register']

/* Delta isotipo — lazo abierto */
const DeltaIsotipo = ({ size = 36 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 120 120" fill="none">
    <path
      d="M22 78 C 22 38, 56 18, 78 38 C 96 54, 86 82, 62 82 C 46 82, 36 70, 42 56"
      stroke="#06B6D4" strokeWidth="14" strokeLinecap="round" fill="none"
    />
    <path
      d="M58 92 C 78 92, 92 78, 88 60"
      stroke="#FF8A65" strokeWidth="14" strokeLinecap="round" fill="none"
    />
    <circle cx="78" cy="72" r="4.5" fill="#FF8A65" />
  </svg>
)

export default function PatientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [doctorName, setDoctorName] = useState('')
  const [loading, setLoading] = useState(true)
  const isPublicRoute = publicRoutes.some(r => pathname.startsWith(r))

  useEffect(() => {
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
        className="flex items-center gap-3 px-3.5 py-2.5 text-sm transition-all"
        style={{
          borderRadius: 14,
          background: active ? '#ECFEFF' : 'transparent',
          color: active ? '#0891B2' : '#5A6773',
          fontWeight: active ? 600 : 500,
        }}
      >
        <item.icon className="w-[18px] h-[18px] shrink-0" style={active ? { color: '#0891B2' } : {}} />
        {item.name}
      </Link>
    )
  }

  const getUserInitials = () => {
    const name = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'P'
    const parts = name.split(' ')
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
    return name.substring(0, 2).toUpperCase()
  }

  const SidebarInner = (
    <>
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5" style={{ borderBottom: '1px solid #E8ECF0' }}>
        <DeltaIsotipo size={36} />
        <div>
          <p className="text-sm font-extrabold leading-none" style={{ color: '#0F1A2A', letterSpacing: '-0.035em' }}>
            Delta<span style={{ color: '#06B6D4' }}>.</span>
          </p>
          <p className="mt-1" style={{ fontSize: 10, fontWeight: 600, color: '#0891B2', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace" }}>
            Paciente
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map(i => <NavLink key={i.href} item={i} />)}
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 space-y-3" style={{ borderTop: '1px solid #E8ECF0' }}>
        {/* User info */}
        <div className="px-3 py-3 rounded-xl" style={{ background: '#F4F6F8', border: '1px solid #E8ECF0' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#FF8A65', color: '#fff', fontWeight: 700, fontSize: 13, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              {getUserInitials()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold truncate" style={{ color: '#0F1A2A' }}>
                {user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Paciente'}
              </p>
              {doctorName && (
                <p className="truncate" style={{ fontSize: 10, color: '#97A3AF' }}>Con: {doctorName}</p>
              )}
            </div>
          </div>
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm w-full transition-all"
          style={{ color: '#97A3AF' }}
          onMouseEnter={e => { e.currentTarget.style.color = '#EF4444'; e.currentTarget.style.background = '#FEF2F2' }}
          onMouseLeave={e => { e.currentTarget.style.color = '#97A3AF'; e.currentTarget.style.background = 'transparent' }}
        >
          <LogOut className="w-4 h-4" />
          Cerrar sesión
        </button>
      </div>
    </>
  )

  if (isPublicRoute) {
    return <>{children}</>
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#FAFBFC' }}>
        <div className="text-center space-y-4">
          <div className="mx-auto animate-pulse">
            <DeltaIsotipo size={48} />
          </div>
          <p className="font-medium" style={{ color: '#97A3AF' }}>Cargando...</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');
        .patient-layout * { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; }
      `}</style>

      <div className="patient-layout flex min-h-screen text-[#0F1A2A]" style={{ background: '#FAFBFC' }}>
        {mobileOpen && (
          <div
            className="fixed inset-0 bg-black/40 z-40 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          className={clsx(
            'fixed inset-y-0 left-0 w-[260px] flex flex-col bg-white z-50 transition-transform',
            mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
          )}
          style={{ borderRight: '1px solid #E8ECF0' }}
        >
          {SidebarInner}
        </aside>

        {/* Main content */}
        <div className="flex-1 lg:ml-[260px] flex flex-col min-h-screen w-full">
          <header className="sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6 lg:px-8 py-4 bg-white/80 backdrop-blur" style={{ borderBottom: '1px solid #E8ECF0' }}>
            <div className="flex items-center gap-3">
              <button
                className="lg:hidden p-2 -ml-2 rounded-lg"
                style={{ color: '#5A6773' }}
                onClick={() => setMobileOpen(true)}
                aria-label="Abrir menú"
              >
                <Menu className="w-5 h-5" />
              </button>
              <h1 className="text-sm font-semibold" style={{ color: '#2A3340' }}>{activeTitle}</h1>
            </div>
            <div className="flex items-center gap-3">
              <SearchCommandPalette />
              {/* Notification bell */}
              <div className="relative p-2 rounded-full cursor-pointer" style={{ color: '#5A6773' }}>
                <Bell className="w-[18px] h-[18px]" />
              </div>
            </div>
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
