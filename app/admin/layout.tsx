'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useCallback } from 'react'
import {
  LayoutDashboard, Users, CheckSquare,
  Settings, LogOut, Menu, MessageSquarePlus, DollarSign,
  Pin, PanelLeftClose, PanelLeft, Bell, Sparkles
} from 'lucide-react'
import { clsx } from 'clsx'
import { createClient } from '@/lib/supabase/client'
import AdminNotifications from './AdminNotifications'

const navItems = [
  { name: 'Dashboard',      href: '/admin',               icon: LayoutDashboard },
  { name: 'Médicos',        href: '/admin/doctors',       icon: Users },
  { name: 'Aprobaciones',   href: '/admin/approvals',     icon: CheckSquare },
  { name: 'Finanzas',       href: '/admin/finances',      icon: DollarSign },
  { name: 'Sugerencias',    href: '/admin/suggestions',   icon: MessageSquarePlus },
  { name: 'Configuración',  href: '/admin/settings',      icon: Settings },
]

function isPathActive(pathname: string, href: string) {
  if (href === '/admin') return pathname === '/admin'
  return pathname === href || pathname.startsWith(href + '/')
}

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

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)

  const [pinned, setPinned] = useState(true)
  const [hovered, setHovered] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem('delta_admin_sidebar_pinned')
      if (saved !== null) setPinned(saved === 'true')
    } catch {}
  }, [])

  const togglePin = useCallback(() => {
    setPinned(prev => {
      const next = !prev
      try { localStorage.setItem('delta_admin_sidebar_pinned', String(next)) } catch {}
      return next
    })
  }, [])

  const sidebarVisible = pinned || hovered

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const activeTitle = navItems.find(n => isPathActive(pathname, n.href))?.name ?? 'Admin'

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');
        .admin-layout * { font-family: 'Plus Jakarta Sans', system-ui, sans-serif; }
        .sidebar-hover-zone-admin { position: fixed; top: 0; left: 0; width: 12px; height: 100%; z-index: 45; }
      `}</style>

      <div className="admin-layout flex min-h-screen text-[#0F1A2A]" style={{ background: '#FAFBFC' }}>
        {mobileOpen && (
          <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setMobileOpen(false)} />
        )}

        {!pinned && !hovered && (
          <div className="sidebar-hover-zone-admin hidden lg:block" onMouseEnter={() => setHovered(true)} />
        )}

        {/* Sidebar */}
        <aside
          onMouseEnter={() => { if (!pinned) setHovered(true) }}
          onMouseLeave={() => { if (!pinned) setHovered(false) }}
          className={clsx(
            'fixed inset-y-0 left-0 w-[260px] flex flex-col bg-white z-50 transition-transform duration-200',
            mobileOpen ? 'translate-x-0' : '-translate-x-full',
            sidebarVisible ? 'lg:translate-x-0' : 'lg:-translate-x-full'
          )}
          style={{
            borderRight: '1px solid #E8ECF0',
            ...((!pinned && hovered) ? { boxShadow: '4px 0 24px rgba(0,0,0,0.08)' } : {}),
          }}
        >
          {/* Logo + Pin */}
          <div className="flex items-center justify-between px-5 py-5" style={{ borderBottom: '1px solid #E8ECF0' }}>
            <div className="flex items-center gap-3">
              <DeltaIsotipo size={36} />
              <div>
                <p className="text-sm font-extrabold leading-none" style={{ color: '#0F1A2A', letterSpacing: '-0.035em' }}>
                  Delta<span style={{ color: '#06B6D4' }}>.</span>
                </p>
                <p className="mt-1" style={{ fontSize: 10, fontWeight: 600, color: '#0891B2', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace" }}>
                  Super Admin
                </p>
              </div>
            </div>
            <button
              onClick={togglePin}
              className={clsx(
                'hidden lg:flex items-center justify-center w-7 h-7 rounded-lg transition-all',
                pinned
                  ? 'text-[#0891B2] hover:bg-[#ECFEFF]'
                  : 'text-[#97A3AF] hover:bg-[#F4F6F8] hover:text-[#5A6773]'
              )}
              style={pinned ? { background: '#ECFEFF' } : {}}
              title={pinned ? 'Ocultar sidebar' : 'Fijar sidebar'}
            >
              {pinned ? <PanelLeftClose className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
            </button>
          </div>

          <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
            {navItems.map(item => {
              const active = isPathActive(pathname, item.href)
              return (
                <Link
                  key={item.name}
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
            })}
          </nav>

          <div className="px-3 py-4 space-y-1" style={{ borderTop: '1px solid #E8ECF0' }}>
            <div className="px-3.5 py-2">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#10B981' }} />
                <span style={{ fontSize: 10, color: '#97A3AF', fontWeight: 500 }}>Sistema operativo</span>
              </div>
            </div>
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
        </aside>

        {/* Main content */}
        <div className={clsx(
          'flex-1 flex flex-col min-h-screen w-full transition-[margin] duration-200',
          pinned ? 'lg:ml-[260px]' : 'lg:ml-0'
        )}>
          <header className="sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6 lg:px-8 py-4 bg-white/80 backdrop-blur" style={{ borderBottom: '1px solid #E8ECF0' }}>
            <div className="flex items-center gap-3">
              <button
                className="lg:hidden p-2 -ml-2 rounded-lg"
                style={{ color: '#5A6773' }}
                onClick={() => setMobileOpen(true)}
              >
                <Menu className="w-5 h-5" />
              </button>
              {!pinned && (
                <button
                  className="hidden lg:flex p-2 -ml-2 rounded-lg transition-all"
                  style={{ color: '#97A3AF' }}
                  onClick={togglePin}
                  title="Fijar sidebar"
                >
                  <PanelLeft className="w-5 h-5" />
                </button>
              )}
              <h1 className="text-sm font-semibold" style={{ color: '#2A3340' }}>{activeTitle}</h1>
            </div>
            <div className="flex items-center gap-3 sm:gap-4">
              {/* Search pill */}
              <div className="hidden md:flex items-center gap-2 px-4 py-2 rounded-full" style={{ background: '#F4F6F8', minWidth: 220 }}>
                <Sparkles className="w-4 h-4" style={{ color: '#97A3AF' }} />
                <span className="text-sm" style={{ color: '#97A3AF' }}>Buscar...</span>
              </div>
              <AdminNotifications />
            </div>
          </header>

          <main className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 w-full">
            <div className="max-w-6xl xl:max-w-7xl mx-auto w-full">
              {children}
            </div>
          </main>
        </div>
      </div>
    </>
  )
}
