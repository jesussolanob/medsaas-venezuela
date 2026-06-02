'use client'

/**
 * Doctor (Especialista) layout
 * 2026-05-02: rediseño UX/UI con design system Delta Health Tech.
 * IMPORTANTE: el orden de módulos y la lógica son IDÉNTICOS al original.
 * Solo se actualizan estilos visuales (tokens, fonts, logo).
 */

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useCallback } from 'react'
import {
  LayoutDashboard, Calendar, ClipboardList, Users,
  Settings, LogOut, Menu, MessageSquarePlus,
  Building2, Package, Receipt, FileEdit, Pin, PanelLeftClose, PanelLeft,
  TrendingUp, Bell, ChevronDown, Stethoscope, DollarSign, Megaphone, Search,
  CheckCircle,
} from 'lucide-react'
import { clsx } from 'clsx'
import { createClient } from '@/lib/supabase/client'
import DoctorNotificationToast from './DoctorNotificationToast'
import SearchCommandPalette from './SearchCommandPalette'
import { Toaster } from '@/components/ui/Toaster'
import { DeltaMark } from '@/components/dh'

type NavItem = { name: string; href: string; icon: any }
type NavSection = { key: string; label: string; icon: any; items: NavItem[] }

// ⚠️ NO MODIFICAR el orden de los items — el user pidió respetarlo.
const topItems: NavItem[] = [
  { name: 'Inicio', href: '/doctor',       icon: LayoutDashboard },
  { name: 'Agenda', href: '/doctor/agenda', icon: Calendar },
]

const navSections: NavSection[] = [
  {
    key: 'consultorio',
    label: 'Consultorio',
    icon: Stethoscope,
    items: [
      { name: 'Pacientes',    href: '/doctor/patients',      icon: Users },
      { name: 'Consultas',    href: '/doctor/consultations', icon: ClipboardList },
      { name: 'Cita 360°',    href: '/doctor/cita-360',      icon: Search },
      { name: 'Consultorios', href: '/doctor/offices',       icon: Building2 },
      { name: 'Plantillas',   href: '/doctor/templates',     icon: FileEdit },
    ],
  },
  {
    key: 'finanzas',
    label: 'Finanzas',
    icon: DollarSign,
    items: [
      { name: 'Finanzas',  href: '/doctor/finances', icon: TrendingUp },
      { name: 'Cobros',    href: '/doctor/cobros',   icon: Receipt },
      { name: 'Servicios', href: '/doctor/services', icon: Package },
    ],
  },
  {
    key: 'marketing',
    label: 'Marketing',
    icon: Megaphone,
    items: [
      { name: 'Recordatorios', href: '/doctor/reminders', icon: Bell },
    ],
  },
]

const allNavItems: NavItem[] = [
  ...topItems,
  ...navSections.flatMap(s => s.items),
]

function isPathActive(pathname: string, href: string) {
  if (href === '/doctor') return pathname === '/doctor'
  return pathname === href || pathname.startsWith(href + '/')
}

export default function DoctorLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)

  const [pinned, setPinned] = useState(true)
  const [hovered, setHovered] = useState(false)

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

  const sidebarVisible = pinned || hovered

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const initial: Record<string, boolean> = {}
    navSections.forEach(section => {
      const hasActive = section.items.some(item => isPathActive(pathname, item.href))
      initial[section.key] = hasActive
    })
    setOpenSections(prev => {
      const merged = { ...prev }
      Object.entries(initial).forEach(([key, active]) => {
        if (active) merged[key] = true
      })
      return merged
    })
  }, [pathname])

  const toggleSection = (key: string) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }))
  }

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const activeTitle = allNavItems.find(i => isPathActive(pathname, i.href))?.name
    ?? (pathname.includes('/settings') ? 'Configuración' : pathname.includes('/suggestions') ? 'Sugerencias' : 'Portal Médico')

  return (
    <>
      <Toaster />
      <style>{`
        .doctor-shell { font-family: var(--dh-font-body); color: var(--dh-ink); }
        .sidebar-hover-zone { position: fixed; top: 0; left: 0; width: 12px; height: 100%; z-index: 45; }
      `}</style>

      <div className="doctor-shell flex min-h-screen" style={{ background: 'var(--dh-bone)' }}>
        {mobileOpen && (
          <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setMobileOpen(false)} />
        )}

        {!pinned && !hovered && (
          <div className="sidebar-hover-zone hidden lg:block" onMouseEnter={() => setHovered(true)} />
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
            borderRight: '1px solid var(--dh-gray-100)',
            ...((!pinned && hovered) ? { boxShadow: 'var(--dh-shadow-md)' } : {}),
          }}
        >
          {/* Logo + Pin */}
          <div
            className="flex items-center justify-between px-5 py-5"
            style={{ borderBottom: '1px solid var(--dh-gray-100)' }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <DeltaMark size={36} bold />
              <div className="min-w-0">
                <p
                  className="text-sm font-extrabold leading-none"
                  style={{ color: 'var(--dh-ink)', letterSpacing: '-0.035em' }}
                >
                  Delta<span style={{ color: 'var(--dh-turquoise)' }}>.</span>
                </p>
                <p
                  className="mt-1"
                  style={{
                    fontSize: 10, fontWeight: 600,
                    color: 'var(--dh-coral-600)',
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    fontFamily: 'var(--dh-font-mono)',
                  }}
                >
                  Especialista
                </p>
              </div>
            </div>
            <button
              onClick={togglePin}
              className={clsx('hidden lg:flex items-center justify-center w-7 h-7 rounded-lg transition-all')}
              style={{
                color: pinned ? 'var(--dh-turquoise-700)' : 'var(--dh-gray-400)',
                background: pinned ? 'var(--dh-turquoise-50)' : 'transparent',
              }}
              title={pinned ? 'Ocultar sidebar' : 'Fijar sidebar'}
              aria-label={pinned ? 'Ocultar sidebar' : 'Fijar sidebar'}
            >
              {pinned ? <PanelLeftClose className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
            </button>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-3 py-4 overflow-y-auto">
            {/* Top items (Inicio, Agenda) */}
            <div className="space-y-0.5">
              {topItems.map(item => {
                const active = isPathActive(pathname, item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-3 px-3.5 py-2.5 text-sm transition-all"
                    style={{
                      borderRadius: 'var(--dh-r-md)',
                      background: active ? 'var(--dh-turquoise-50)' : 'transparent',
                      color: active ? 'var(--dh-turquoise-700)' : 'var(--dh-gray-600)',
                      fontWeight: active ? 600 : 500,
                    }}
                  >
                    <item.icon className="w-[18px] h-[18px] shrink-0" />
                    {item.name}
                  </Link>
                )
              })}
            </div>

            {/* Collapsible sections */}
            {navSections.map(section => {
              const isOpen = openSections[section.key] ?? false
              const sectionHasActive = section.items.some(item => isPathActive(pathname, item.href))
              return (
                <div key={section.key} className="mt-3">
                  <button
                    onClick={() => toggleSection(section.key)}
                    className="w-full flex items-center justify-between px-3.5 py-2 text-sm transition-all"
                    style={{
                      borderRadius: 'var(--dh-r-md)',
                      color: sectionHasActive ? 'var(--dh-turquoise-700)' : 'var(--dh-gray-600)',
                      fontWeight: sectionHasActive ? 600 : 500,
                    }}
                  >
                    <span className="flex items-center gap-2.5">
                      <section.icon
                        className="w-[18px] h-[18px] shrink-0"
                        style={{ color: sectionHasActive ? 'var(--dh-turquoise-700)' : 'var(--dh-gray-400)' }}
                      />
                      {section.label}
                    </span>
                    <ChevronDown
                      className="w-3.5 h-3.5 transition-transform duration-200"
                      style={{
                        transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                        color: sectionHasActive ? 'var(--dh-turquoise)' : 'var(--dh-gray-200)',
                      }}
                    />
                  </button>
                  <div
                    className="overflow-hidden transition-all duration-200"
                    style={{
                      maxHeight: isOpen ? `${section.items.length * 40}px` : '0px',
                      opacity: isOpen ? 1 : 0,
                    }}
                  >
                    <div className="pl-3 mt-0.5 space-y-0.5">
                      {section.items.map(item => {
                        const active = isPathActive(pathname, item.href)
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setMobileOpen(false)}
                            className="flex items-center gap-3 px-3.5 py-2 text-[13px] transition-all"
                            style={{
                              borderRadius: 'var(--dh-r-md)',
                              background: active ? 'var(--dh-turquoise-50)' : 'transparent',
                              color: active ? 'var(--dh-turquoise-700)' : 'var(--dh-gray-400)',
                              fontWeight: active ? 600 : 500,
                            }}
                          >
                            <item.icon
                              className="w-3.5 h-3.5 shrink-0"
                              style={{ color: active ? 'var(--dh-turquoise-700)' : 'var(--dh-gray-200)' }}
                            />
                            {item.name}
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )
            })}
          </nav>

          {/* Footer */}
          <div className="px-3 py-4 space-y-2" style={{ borderTop: '1px solid var(--dh-gray-100)' }}>
            <div
              className="px-3.5 py-2"
              style={{
                background: 'var(--dh-turquoise-50)',
                border: '1px solid var(--dh-turquoise-100)',
                borderRadius: 'var(--dh-r-md)',
              }}
            >
              <div className="flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5" style={{ color: 'var(--dh-turquoise-700)' }} />
                <p className="text-xs font-bold" style={{ color: 'var(--dh-turquoise-700)' }}>Plan activo</p>
              </div>
              <p className="mt-0.5" style={{ fontSize: 10, color: 'var(--dh-gray-400)' }}>Acceso completo</p>
            </div>

            <Link
              href="/doctor/suggestions"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-3 px-3.5 py-2.5 text-sm transition-all"
              style={{
                borderRadius: 'var(--dh-r-md)',
                background: pathname.includes('/suggestions') ? 'var(--dh-turquoise-50)' : 'transparent',
                color: pathname.includes('/suggestions') ? 'var(--dh-turquoise-700)' : 'var(--dh-gray-600)',
                fontWeight: pathname.includes('/suggestions') ? 600 : 500,
              }}
            >
              <MessageSquarePlus className="w-[18px] h-[18px]" />
              Sugerencias
            </Link>

            <Link
              href="/doctor/settings"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-3 px-3.5 py-2.5 text-sm transition-all"
              style={{
                borderRadius: 'var(--dh-r-md)',
                background: pathname.includes('/settings') ? 'var(--dh-turquoise-50)' : 'transparent',
                color: pathname.includes('/settings') ? 'var(--dh-turquoise-700)' : 'var(--dh-gray-600)',
                fontWeight: pathname.includes('/settings') ? 600 : 500,
              }}
            >
              <Settings className="w-[18px] h-[18px]" />
              Configuración
            </Link>

            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm w-full transition-all"
              style={{ color: 'var(--dh-gray-400)' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--dh-error)'; e.currentTarget.style.background = '#FEF2F2' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--dh-gray-400)'; e.currentTarget.style.background = 'transparent' }}
            >
              <LogOut className="w-4 h-4" />
              Cerrar sesión
            </button>
          </div>
        </aside>

        {/* Main content */}
        <div
          className={clsx(
            'flex-1 flex flex-col min-h-screen w-full transition-[margin] duration-200',
            pinned ? 'lg:ml-[260px]' : 'lg:ml-0'
          )}
        >
          {/* Topbar */}
          <header
            className="sticky top-0 z-30 flex items-center justify-between gap-4 px-4 sm:px-6 lg:px-8 py-3.5 bg-white/85 backdrop-blur"
            style={{ borderBottom: '1px solid var(--dh-gray-100)' }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <button
                className="lg:hidden p-2 -ml-2 rounded-lg"
                style={{ color: 'var(--dh-gray-600)' }}
                onClick={() => setMobileOpen(true)}
                aria-label="Abrir menú"
              >
                <Menu className="w-5 h-5" />
              </button>
              {!pinned && (
                <button
                  className="hidden lg:flex p-2 -ml-2 rounded-lg transition-all"
                  style={{ color: 'var(--dh-gray-400)' }}
                  onClick={togglePin}
                  title="Fijar sidebar"
                  aria-label="Fijar sidebar"
                >
                  <PanelLeft className="w-5 h-5" />
                </button>
              )}
              <h1
                className="font-semibold truncate"
                style={{ fontFamily: 'var(--dh-font-display)', fontSize: 17, color: 'var(--dh-ink)' }}
              >
                {activeTitle}
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <SearchCommandPalette />
              <div
                className="relative p-2 rounded-full cursor-pointer transition-colors"
                style={{ color: 'var(--dh-gray-600)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--dh-gray-50)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
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
        <DoctorNotificationToast />
      </div>
    </>
  )
}
