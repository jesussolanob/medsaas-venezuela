'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import {
  LayoutDashboard, Users, Calendar, FileText, Bell,
  DollarSign, Settings, LogOut, Activity, BarChart2, Send,
  ClipboardList, Receipt, FileBarChart, ChevronDown, Menu, X,
  Stethoscope, Briefcase, MessageSquare, ListTodo, Plus, Trash2, Check,
  Lock, Building2
} from 'lucide-react'
import { clsx } from 'clsx'
import { createClient } from '@/lib/supabase/client'

type Task = {
  id: string
  text: string
  completed: boolean
}

type NavItem = { name: string; href: string; icon: any; featureKey?: string }
type NavGroup = { name: string; icon: any; items: NavItem[] }

// Feature key mapping
const FEATURE_KEY_MAP: Record<string, string> = {
  'Inicio': 'dashboard',
  'Agenda': 'agenda',
  'Pacientes': 'patients',
  'Consultas': 'consultations',
  'Historial Clínico': 'ehr',
  'Finanzas': 'finances',
  'Facturación': 'billing',
  'Reportería': 'reports',
  'CRM Leads': 'crm',
  'Recordatorios': 'reminders',
  'Mensajes': 'messages',
  'Invitaciones': 'invitations',
  'Configuración': 'settings',
}

const groups: NavGroup[] = [
  {
    name: 'Consultorio',
    icon: Stethoscope,
    items: [
      { name: 'Pacientes', href: '/doctor/patients', icon: Users, featureKey: 'patients' },
      { name: 'Consultas', href: '/doctor/consultations', icon: ClipboardList, featureKey: 'consultations' },
      { name: 'Historial Clínico', href: '/doctor/ehr', icon: FileText, featureKey: 'ehr' },
    ],
  },
  {
    name: 'Finanzas',
    icon: Briefcase,
    items: [
      { name: 'Finanzas', href: '/doctor/finances', icon: DollarSign, featureKey: 'finances' },
      { name: 'Facturación', href: '/doctor/billing', icon: Receipt, featureKey: 'billing' },
      { name: 'Reportería', href: '/doctor/reports', icon: FileBarChart, featureKey: 'reports' },
    ],
  },
  {
    name: 'CRM',
    icon: MessageSquare,
    items: [
      { name: 'CRM Leads', href: '/doctor/crm', icon: BarChart2, featureKey: 'crm' },
      { name: 'Recordatorios', href: '/doctor/reminders', icon: Bell, featureKey: 'reminders' },
      { name: 'Mensajes', href: '/doctor/messages', icon: Send, featureKey: 'messages' },
    ],
  },
]

const topItems: NavItem[] = [
  { name: 'Inicio', href: '/doctor', icon: LayoutDashboard, featureKey: 'dashboard' },
  { name: 'Agenda', href: '/doctor/agenda', icon: Calendar, featureKey: 'agenda' },
]

const bottomItems: NavItem[] = [
  { name: 'Invitaciones', href: '/doctor/invitations', icon: Send, featureKey: 'invitations' },
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
  const [tasksOpen, setTasksOpen] = useState(false)
  const [tasks, setTasks] = useState<Task[]>([])
  const [newTaskText, setNewTaskText] = useState('')
  const [enabledFeatures, setEnabledFeatures] = useState<Set<string>>(new Set(['dashboard', 'agenda', 'settings']))
  const [isClinicAdmin, setIsClinicAdmin] = useState(false)
  const tasksDropdownRef = useRef<HTMLDivElement>(null)
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

  // Load sound preference and tasks
  useEffect(() => {
    const v = localStorage.getItem('appt_sound_enabled')
    if (v !== null) setSoundEnabled(v === 'true')

    const savedTasks = localStorage.getItem('doctor_tasks')
    if (savedTasks) {
      try {
        setTasks(JSON.parse(savedTasks))
      } catch (e) {
        setTasks([])
      }
    }
  }, [])

  // Fetch subscription and enabled features
  useEffect(() => {
    const supabase = createClient()

    async function fetchEnabledFeatures() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        // Check if user is clinic admin
        const { data: profile } = await supabase
          .from('profiles')
          .select('clinic_id, clinic_role')
          .eq('id', user.id)
          .single()
        if (profile?.clinic_id && profile?.clinic_role === 'admin') {
          setIsClinicAdmin(true)
        }

        // Fetch doctor's subscription
        const { data: subscription } = await supabase
          .from('subscriptions')
          .select('plan, status')
          .eq('doctor_id', user.id)
          .single()

        if (!subscription || subscription.status !== 'active') {
          // No active subscription: only dashboard, agenda, and settings
          setEnabledFeatures(new Set(['dashboard', 'agenda', 'settings']))
          return
        }

        // Fetch enabled features for this plan
        const { data: features } = await supabase
          .from('plan_features')
          .select('feature_key')
          .eq('plan', subscription.plan)
          .eq('enabled', true)

        if (features) {
          const enabledSet = new Set<string>(features.map(f => f.feature_key))
          // Always ensure dashboard, agenda, and settings are enabled
          enabledSet.add('dashboard')
          enabledSet.add('agenda')
          enabledSet.add('settings')
          setEnabledFeatures(enabledSet)
        }
      } catch (error) {
        console.error('Error fetching subscription features:', error)
        // Default to basic features if there's an error
        setEnabledFeatures(new Set(['dashboard', 'agenda', 'settings']))
      }
    }

    fetchEnabledFeatures()
  }, [])

  // Save tasks to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('doctor_tasks', JSON.stringify(tasks))
  }, [tasks])

  // Close tasks dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (tasksDropdownRef.current && !tasksDropdownRef.current.contains(event.target as Node)) {
        setTasksOpen(false)
      }
    }

    if (tasksOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [tasksOpen])

  const addTask = () => {
    if (newTaskText.trim()) {
      const newTask: Task = {
        id: Date.now().toString(),
        text: newTaskText.trim(),
        completed: false,
      }
      setTasks([...tasks, newTask])
      setNewTaskText('')
    }
  }

  const toggleTaskComplete = (id: string) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t))
  }

  const deleteTask = (id: string) => {
    setTasks(tasks.filter(t => t.id !== id))
  }

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

  const isFeatureEnabled = (featureKey?: string): boolean => {
    if (!featureKey) return true
    return enabledFeatures.has(featureKey)
  }

  const NavLink = ({ item, indent = false }: { item: NavItem; indent?: boolean }) => {
    const active = isPathActive(pathname, item.href)
    const isEnabled = isFeatureEnabled(item.featureKey)

    const handleLockedClick = (e: React.MouseEvent) => {
      if (!isEnabled) {
        e.preventDefault()
      }
    }

    const content = (
      <>
        <item.icon className={clsx('w-4 h-4 shrink-0', active ? 'text-teal-500' : '')} />
        <span className="flex-1">{item.name}</span>
        {!isEnabled && <Lock className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
      </>
    )

    if (!isEnabled) {
      return (
        <div
          title="Disponible en Plan Professional"
          className={clsx(
            'nav-item-doc flex items-center gap-3 px-3 py-2.5 rounded-r-lg text-sm transition-all opacity-50 cursor-not-allowed',
            indent && 'pl-9',
            'text-slate-400'
          )}
          onClick={handleLockedClick}
        >
          {content}
        </div>
      )
    }

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
        {content}
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

        {/* Clinic admin link */}
        {isClinicAdmin && (
          <div className="pt-2 border-t border-slate-100 mt-2">
            <Link
              href="/clinic/admin"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-violet-600 hover:bg-violet-50 transition-all"
            >
              <Building2 className="w-4 h-4" />
              Mi Clínica
            </Link>
          </div>
        )}
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 border-t border-slate-100 space-y-1">
        <NavLink item={{ name: 'Configuración', href: '/doctor/settings', icon: Settings, featureKey: 'settings' }} />
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

              {/* Tasks Dropdown */}
              <div className="relative" ref={tasksDropdownRef}>
                <button
                  onClick={() => setTasksOpen(!tasksOpen)}
                  className="p-2 rounded-lg hover:bg-slate-100 transition-colors relative text-slate-600"
                  aria-label="Tareas"
                  title="Tareas"
                >
                  <ListTodo className="w-5 h-5" />
                  {tasks.filter(t => !t.completed).length > 0 && (
                    <span className="absolute top-1 right-1 w-2 h-2 bg-teal-500 rounded-full" />
                  )}
                </button>

                {/* Dropdown Panel */}
                {tasksOpen && (
                  <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-xl shadow-lg z-50">
                    <div className="p-4 border-b border-slate-100">
                      <h3 className="text-sm font-semibold text-slate-900">Mis Tareas</h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {tasks.filter(t => !t.completed).length} pendientes
                      </p>
                    </div>

                    <div className="max-h-80 overflow-y-auto">
                      {tasks.length === 0 ? (
                        <div className="p-6 text-center">
                          <ListTodo className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                          <p className="text-sm text-slate-400">No hay tareas</p>
                          <p className="text-xs text-slate-400 mt-1">Agrega una tarea para comenzar</p>
                        </div>
                      ) : (
                        <div className="p-3 space-y-2">
                          {tasks.map((task) => (
                            <div
                              key={task.id}
                              className={clsx(
                                'flex items-start gap-2 p-3 rounded-lg border transition-colors',
                                task.completed
                                  ? 'bg-slate-50 border-slate-100'
                                  : 'bg-white border-slate-200 hover:border-teal-200'
                              )}
                            >
                              <button
                                onClick={() => toggleTaskComplete(task.id)}
                                className={clsx(
                                  'mt-0.5 p-1 rounded transition-colors shrink-0',
                                  task.completed
                                    ? 'text-teal-500'
                                    : 'text-slate-300 hover:text-slate-400'
                                )}
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <span
                                className={clsx(
                                  'text-sm flex-1 break-words',
                                  task.completed
                                    ? 'text-slate-400 line-through'
                                    : 'text-slate-700'
                                )}
                              >
                                {task.text}
                              </span>
                              <button
                                onClick={() => deleteTask(task.id)}
                                className="text-slate-300 hover:text-red-500 transition-colors shrink-0 p-1"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="p-3 border-t border-slate-100 flex gap-2">
                      <input
                        type="text"
                        placeholder="Nueva tarea..."
                        value={newTaskText}
                        onChange={(e) => setNewTaskText(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && addTask()}
                        className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                      />
                      <button
                        onClick={addTask}
                        className="p-2 rounded-lg bg-teal-500 text-white hover:bg-teal-600 transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* Page content — responsive centered container */}
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
