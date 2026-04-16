'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import {
  LayoutDashboard, Users, Calendar, FileText, Bell,
  DollarSign, Settings, LogOut, Activity, BarChart2, Send,
  ClipboardList, Receipt, FileBarChart, ChevronDown, Menu, X,
  Stethoscope, Briefcase, MessageSquare
} from 'lucide-react'
import { clsx } from 'clsx'
import { createClient } from '@/lib/supabase/client'

type NavItem = { name: string; href: string; icon: any }
type NavGroup = { name: string; icon: any; items: NavItem[] }

const groups: NavGroup[] = [
  {
    name: 'Consultorio',
    icon: Stethoscope,
    items: [
      { name: 'Pacientes', href: '/doctor/patients', icon: Users },
      { name: 'Consultas', href: '/doctor/consultations', icon: ClipboardList },
      { name: 'Historial Clínico', href: '/doctor/ehr', icon: FileText },
    ],
  },
  {
    name: 'Finanzas',
    icon: Briefcase,
    items: [
      { name: 'Finanzas', href: '/doctor/finances', icon: DollarSign },
      { name: 'Facturación', href: '/doctor/billing', icon: Receipt },
      { name: 'Reportería', href: '/doctor/reports', icon: FileBarChart },
    ],
  },
  {
    name: 'CRM',
    icon: MessageSquare,
    items: [
      { name: 'CRM Leads', href: '/doctor/crm', icon: BarChart2 },
      { name: 'Recordatorios', href: '/doctor/reminders', icon: Bell },
    ],
  },
]

const topItems: NavItem[] = [
  { name: 'Inicio', href: '/doctor', icon: LayoutDashboard },
  { name: 'Agenda', href: '/doctor/agenda', icon: Calendar },
]

const bottomItems: NavItem[] = [
  { name: 'Invitaciones', href: '/doctor/invitations', icon: Send },
]

function isPathActive(pathname: string, href: string) {
  if (href === '/doctor') return pathname === '/doctor'
  return pathname === href || pathname.startsWith(href + '/')
}

function findAllItems(): NavItem[] {
  return [
    ...topItems,
    ...groups.flatMap(g => g.items),
    ...bottomItems,
    { name: 'Configuración', href: '/doctor/settings', icon: Settings },
  ]
}

export default function DoctorLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const lastCheckRef = useRef<number>(Date.now())
  const audioCtxRef = useRef<AudioContext | null>(null)

  // Initialize expanded state: group is open if any child is active
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const o: Record<string, boolean> = {}
    groups.forEach(g => {
      o[g.name] = g.items.some(i => isPathActive(pathname, i.href))
    })
    // Default: if no active child, open "Consultorio" only
    const anyOpen = Object.values(o).some(Boolean)
    if (!anyOpen) o['Consultorio'] = true
    return o
  })

  // Load sound preference
  useEffect(() => {
    const v = localStorage.getItem('appt_sound_enabled')
    if (v !== null) setSoundEnabled(v === 'true')
  }, [])

  // Poll for new appointments every 30s
  useEffect(() => {
    const supabase = createClient()
    async function getDoctorId() {
      const { data: { user } } = await supabase.auth.getUser()
      return user?.id ?? null
    }
    let cancelled = false
    let timer: NodeJS.Timeout | null = null

    async function check() {
      if (cancelled) return
      try {
        const doctorId = await getDoctorId()
        if (!doctorId) return
        const since = new Date(lastCheckRef.current).toISOString()
        const { data } = await supabase
          .from('appointments')
          .select('id, patient_name, created_at')
          .eq('doctor_id', doctorId)
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(5)
        if (data && data.length > 0) {
          lastCheckRef.current = Date.now()
          if (soundEnabled) playBeep()
          // Show browser notification if allowed
          if ('Notification' in window && Notification.permission === 'granted') {
            data.forEach(a => {
              new Notification('Nueva cita recibida', {
                body: `Paciente: ${a.patient_name ?? 'sin nombre'}`,
              })
            })
          }
        }
      } catch {
        // ignore
      }
    }

    // First call skipped to avoid spamming on load — just set baseline
    lastCheckRef.current = Date.now()
    timer = setInterval(check, 30000)
    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
    }
  }, [soundEnabled])

  function playBeep() {
    try {
      const ctx = audioCtxRef.current ?? new (window.AudioContext || (window as any).webkitAudioContext)()
      audioCtxRef.current = ctx
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.connect(g); g.connect(ctx.destination)
      o.type = 'sine'
      o.frequency.setValueAtTime(880, ctx.currentTime)
      o.frequency.setValueAtTime(1320, ctx.currentTime + 0.12)
      g.gain.setValueAtTime(0.0001, ctx.currentTime)
      g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4)
      o.start(); o.stop(ctx.currentTime + 0.4)
    } catch {
      // audio unavailable
    }
  }

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const allItems = findAllItems()
  const activeTitle = allItems.find(i => isPathActive(pathname, i.href))?.name ?? 'Portal Médico'

  function toggleGroup(name: string) {
    setOpenGroups(o => ({ ...o, [name]: !o[name] }))
  }

  const NavLink = ({ item, indent = false }: { item: NavItem; indent?: boolean }) => {
    const active = isPathActive(pathname, item.href)
    return (
      <Link
        href={item.href}
        onClick={() => setMobileOpen(false)}
        className={clsx(
          'nav-item-doc flex items-center gap-3 px-3 py-2.5 rounded-r-lg text-sm transition-all',
          indent && 'pl-9',
          active
            ? 'nav-active-doc text-teal-600 font-semibold'
            : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
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
          <p className="text-sm font-bold leading-none g-text-logo">Delta Medical CRM</p>
          <p className="text-[10px] text-slate-400 mt-0.5 font-medium">Portal Médico</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {topItems.map(i => <NavLink key={i.href} item={i} />)}

        {groups.map(g => {
          const anyActive = g.items.some(i => isPathActive(pathname, i.href))
          const open = openGroups[g.name] || anyActive
          return (
            <div key={g.name} className="pt-1">
              <button
                type="button"
                onClick={() => toggleGroup(g.name)}
                className={clsx(
                  'flex items-center justify-between w-full px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors',
                  anyActive ? 'text-teal-600' : 'text-slate-400 hover:text-slate-600'
                )}
              >
                <span className="flex items-center gap-2">
                  <g.icon className="w-3.5 h-3.5" />
                  {g.name}
                </span>
                <ChevronDown className={clsx('w-3.5 h-3.5 transition-transform', open && 'rotate-180')} />
              </button>
              {open && (
                <div className="mt-0.5 space-y-0.5">
                  {g.items.map(i => <NavLink key={i.href} item={i} indent />)}
                </div>
              )}
            </div>
          )
        })}

        <div className="pt-2">
          {bottomItems.map(i => <NavLink key={i.href} item={i} />)}
        </div>
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 border-t border-slate-100 space-y-1">
        <NavLink item={{ name: 'Configuración', href: '/doctor/settings', icon: Settings }} />
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
                Delta Medical CRM
              </span>
            </div>
          </header>

          {/* Page content — responsive container */}
          <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 lg:py-8 w-full">
            <div className="max-w-[1600px] mx-auto w-full">
              {children}
            </div>
          </main>
        </div>
      </div>
    </>
  )
}
