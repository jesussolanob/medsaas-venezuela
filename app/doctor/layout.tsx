'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, Users, Calendar, FileText, Bell,
  DollarSign, Settings, LogOut, Activity, BarChart2, Send,
  ClipboardList, Receipt, Tag, FileBarChart
} from 'lucide-react'
import { clsx } from 'clsx'
import { createClient } from '@/lib/supabase/client'

const navigation = [
  { name: 'Inicio', href: '/doctor', icon: LayoutDashboard },
  { name: 'Pacientes', href: '/doctor/patients', icon: Users },
  { name: 'Consultas', href: '/doctor/consultations', icon: ClipboardList },
  { name: 'Agenda', href: '/doctor/agenda', icon: Calendar },
  { name: 'Historial Clínico', href: '/doctor/ehr', icon: FileText },
  { name: 'Planes', href: '/doctor/plans', icon: Tag },
  { name: 'CRM Leads', href: '/doctor/crm', icon: BarChart2 },
  { name: 'Recordatorios', href: '/doctor/reminders', icon: Bell },
  { name: 'Finanzas', href: '/doctor/finances', icon: DollarSign },
  { name: 'Facturación', href: '/doctor/billing', icon: Receipt },
  { name: 'Reportería', href: '/doctor/reports', icon: FileBarChart },
  { name: 'Invitaciones', href: '/doctor/invitations', icon: Send },
]

export default function DoctorLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

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
        {/* Sidebar */}
        <aside className="fixed inset-y-0 left-0 w-[230px] flex flex-col border-r border-slate-200 bg-white z-50">
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
            {navigation.map((item) => {
              const active = pathname === item.href || (item.href !== '/doctor' && pathname.startsWith(item.href))
              return (
                <Link
                  key={item.href + item.name}
                  href={item.href}
                  className={clsx(
                    'nav-item-doc flex items-center gap-3 px-3 py-2.5 rounded-r-lg text-sm transition-all',
                    active
                      ? 'nav-active-doc text-teal-600 font-semibold'
                      : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                  )}
                >
                  <item.icon className={clsx('w-4 h-4 shrink-0', active ? 'text-teal-500' : '')} />
                  {item.name}
                </Link>
              )
            })}
          </nav>

          {/* Footer */}
          <div className="px-3 py-4 border-t border-slate-100 space-y-1">
            <Link
              href="/doctor/settings"
              className={clsx(
                'nav-item-doc flex items-center gap-3 px-3 py-2.5 rounded-r-lg text-sm transition-all',
                pathname === '/doctor/settings'
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
        <div className="flex-1 ml-[230px] flex flex-col min-h-screen">
          {/* Top bar */}
          <header className="sticky top-0 z-40 flex items-center justify-between px-8 py-4 border-b border-slate-200 bg-white/80 backdrop-blur">
            <h1 className="text-sm font-semibold text-slate-700">
              {navigation.find(n => n.href === pathname || (n.href !== '/doctor' && pathname.startsWith(n.href)))?.name ?? 'Portal Médico'}
            </h1>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400 bg-slate-100 px-3 py-1 rounded-full font-medium">
                Delta Medical CRM
              </span>
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 px-8 py-8">
            {children}
          </main>
        </div>
      </div>
    </>
  )
}
