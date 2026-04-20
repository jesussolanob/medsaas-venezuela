'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useCallback } from 'react'
import {
  LayoutDashboard, Calendar, ClipboardList, Users,
  DollarSign, Settings, LogOut, Activity, Menu, MessageSquarePlus,
  Building2, Package, Receipt, FileEdit, Pin, PanelLeftClose, PanelLeft, TrendingUp
} from 'lucide-react'
import { clsx } from 'clsx'
import { createClient } from '@/lib/supabase/client'
import { CheckCircle } from 'lucide-react'
import DoctorNotificationToast from './DoctorNotificationToast'

type NavItem = { name: string; href: string; icon: any }

const navItems: NavItem[] = [
  { name: 'Inicio',        href: '/doctor',               icon: LayoutDashboard },
  { name: 'Agenda',        href: '/doctor/agenda',        icon: Calendar },
  { name: 'Pacientes',     href: '/doctor/patients',      icon: Users },
  { name: 'Consultas',     href: '/doctor/consultations', icon: ClipboardList },
  { name: 'Finanzas',      href: '/doctor/finances',      icon: TrendingUp },
  { name: 'Cobros',        href: '/doctor/cobros',        icon: Receipt },
  { name: 'Consultorios',  href: '/doctor/offices',       icon: Building2 },
  { name: 'Servicios',     href: '/doctor/services',      icon: Package },
  { name: 'Plantillas',   href: '/doctor/templates',     icon: FileEdit },
]

function isPathActive(pathname: string, href: string) {
  if (href === '/doctor') return pathname === '/doctor'
  return pathname === href || pathname.startsWith(href + '/')
}

export default function DoctorLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)

  // Collapsible sidebar state
  const [pinned, setPinned] = useState(true)
  const [hovered, setHovered] = useState(false)

  // Read pinned preference from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('delta_sidebar_pinned')
      if (saved !== null) setPinned(saved === 'true')
    } catch {}
  }, [])

  const togglePin = useCallback(() => {
    setPinned(prev => {
      const next = !prev
      try { localStorage.setItem('delta_sidebar_pinned', String(next)) } catch {}
      return next
    })
  }, [])

  // On desktop: sidebar visible when pinned OR hovered
  const sidebarVisible = pinned || hovered

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const activeTitle = navItems.find(i => isPathActive(pathname, i.href))?.name
    ?? (pathname.includes('/settings') ? 'Configuración' : pathname.includes('/suggestions') ? 'Sugerencias' : 'Portal Médico')

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        .doctor-layout * { font-family: 'Inter', sans-serif; }
        .g-logo { background: linear-gradient(135deg, #00C4CC 0%, #0891b2 100%); }
        .g-text-logo { background: linear-gradient(135deg, #00C4CC, #0891b2); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .nav-active-doc { background: linear-gradient(135deg, rgba(0,196,204,0.1) 0%, rgba(8,145,178,0.08) 100%); border-left: 3px solid #00C4CC; }
        .nav-item-doc { border-left: 3px solid transparent; }
        .sidebar-hover-zone { position: fixed; top: 0; left: 0; width: 12px; height: 100%; z-index: 45; }
      `}</style>

      <div className="doctor-layout flex min-h-screen bg-slate-50 text-slate-900">
        {mobileOpen && (
          <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setMobileOpen(false)} />
        )}

        {/* Hover zone — thin strip on left edge to trigger sidebar when unpinned */}
        {!pinned && !hovered && (
          <div className="sidebar-hover-zone hidden lg:block" onMouseEnter={() => setHovered(true)} />
        )}

        {/* Sidebar */}
        <aside
          onMouseEnter={() => { if (!pinned) setHovered(true) }}
          onMouseLeave={() => { if (!pinned) setHovered(false) }}
          className={clsx(
            'fixed inset-y-0 left-0 w-[240px] flex flex-col border-r border-slate-200 bg-white z-50 transition-transform duration-200',
            // Mobile behavior
            mobileOpen ? 'translate-x-0' : '-translate-x-full',
            // Desktop behavior: show when pinned or hovered
            sidebarVisible ? 'lg:translate-x-0' : 'lg:-translate-x-full'
          )}
          style={!pinned && hovered ? { boxShadow: '4px 0 24px rgba(0,0,0,0.08)' } : undefined}
        >
          {/* Logo + Pin button */}
          <div className="flex items-center justify-between px-5 py-5 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl g-logo flex items-center justify-center shadow-md shadow-cyan-200">
                <Activity className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-bold leading-none g-text-logo">Delta</p>
                <p className="text-[10px] text-slate-400 mt-0.5 font-medium">Portal Médico</p>
              </div>
            </div>
            <button
              onClick={togglePin}
              className={clsx(
                'hidden lg:flex items-center justify-center w-7 h-7 rounded-lg transition-all',
                pinned
                  ? 'bg-teal-50 text-teal-600 hover:bg-teal-100'
                  : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
              )}
              title={pinned ? 'Ocultar sidebar (hover para mostrar)' : 'Fijar sidebar'}
            >
              {pinned ? <PanelLeftClose className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
            </button>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
            {navItems.map(item => {
              const active = isPathActive(pathname, item.href)
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
            <div className="px-3 py-2 rounded-lg bg-teal-50 border border-teal-200">
              <div className="flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-teal-500" />
                <p className="text-xs font-bold text-teal-700">Beta Privada</p>
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">Acceso completo</p>
            </div>

            <Link
              href="/doctor/suggestions"
              onClick={() => setMobileOpen(false)}
              className={clsx(
                'nav-item-doc flex items-center gap-3 px-3 py-2.5 rounded-r-lg text-sm transition-all',
                pathname.includes('/suggestions')
                  ? 'nav-active-doc text-teal-600 font-semibold'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
              )}
            >
              <MessageSquarePlus className="w-4 h-4" />
              Sugerencias
            </Link>

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

        {/* Main content — margin adjusts based on pinned state */}
        <div className={clsx(
          'flex-1 flex flex-col min-h-screen w-full transition-[margin] duration-200',
          pinned ? 'lg:ml-[240px]' : 'lg:ml-0'
        )}>
          <header className="sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6 lg:px-8 py-4 border-b border-slate-200 bg-white/80 backdrop-blur">
            <div className="flex items-center gap-3">
              <button
                className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-slate-100"
                onClick={() => setMobileOpen(true)}
              >
                <Menu className="w-5 h-5 text-slate-600" />
              </button>
              {/* Desktop: show sidebar toggle when unpinned */}
              {!pinned && (
                <button
                  className="hidden lg:flex p-2 -ml-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700"
                  onClick={togglePin}
                  title="Fijar sidebar"
                >
                  <PanelLeft className="w-5 h-5" />
                </button>
              )}
              <h1 className="text-sm font-semibold text-slate-700">{activeTitle}</h1>
            </div>
            <span className="hidden sm:inline-flex text-xs text-slate-400 bg-slate-100 px-3 py-1 rounded-full font-medium">
              Delta
            </span>
          </header>

          <main className="flex-1 px-4 sm:px-6 lg:px-10 py-6 lg:py-8 w-full">
            <div className="max-w-6xl xl:max-w-7xl mx-auto w-full">
              {children}
            </div>
          </main>
        </div>
        <DoctorNotificationToast />
      </div>
    </>
  )
}
