'use client';

/**
 * Doctor (Especialista) layout
 * 2026-05-02: rediseño UX/UI con design system Delta Health Tech.
 * IMPORTANTE: el orden de módulos y la lógica son IDÉNTICOS al original.
 * Solo se actualizan estilos visuales (tokens, fonts, logo).
 */

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard,
  Calendar,
  ClipboardList,
  Users,
  Settings,
  LogOut,
  Menu,
  MessageSquarePlus,
  Building2,
  Package,
  Receipt,
  FileEdit,
  Pin,
  PanelLeftClose,
  PanelLeft,
  TrendingUp,
  Bell,
  ChevronDown,
  Stethoscope,
  DollarSign,
  Megaphone,
  CheckCircle,
  Lock,
} from 'lucide-react';
import { clsx } from 'clsx';
import { logoutAction } from './logout-action';
import DoctorNotificationToast from './DoctorNotificationToast';
import SearchCommandPalette from './SearchCommandPalette';
import { Toaster } from '@/components/ui/Toaster';
import { DeltaMark } from '@/components/dh';
import { getMyCapabilities } from '@/app/capabilities-actions';
import { can, EMPTY_CAPABILITIES, type Capabilities } from '@/lib/capabilities';
import { getDoctorPlanFeatures } from '@/app/doctor/plan-features-actions';
import { planUnlocks, EMPTY_PLAN_FEATURES, type PlanFeatures } from '@/lib/plan-features';
import { checkOnboardingComplete } from './actions';

type NavItem = { name: string; href: string; icon: React.ElementType; moduleKey?: string };
type NavSection = { key: string; label: string; icon: React.ElementType; items: NavItem[] };

// ⚠️ NO MODIFICAR el orden de los items — el user pidió respetarlo.
const topItems: NavItem[] = [
  { name: 'Inicio', href: '/doctor', icon: LayoutDashboard, moduleKey: 'dashboard' },
  { name: 'Agenda', href: '/doctor/agenda', icon: Calendar, moduleKey: 'agenda' },
];

const navSections: NavSection[] = [
  {
    key: 'consultorio',
    label: 'Consultorio',
    icon: Stethoscope,
    items: [
      { name: 'Pacientes', href: '/doctor/patients', icon: Users, moduleKey: 'patients' },
      {
        name: 'Consultas',
        href: '/doctor/consultations',
        icon: ClipboardList,
        moduleKey: 'consultations',
      },
      { name: 'Consultorios', href: '/doctor/offices', icon: Building2 },
      { name: 'Plantillas', href: '/doctor/templates', icon: FileEdit },
    ],
  },
  {
    key: 'finanzas',
    label: 'Finanzas',
    icon: DollarSign,
    items: [
      { name: 'Finanzas', href: '/doctor/finances', icon: TrendingUp, moduleKey: 'finances' },
      { name: 'Cobros', href: '/doctor/cobros', icon: Receipt, moduleKey: 'finances' },
      { name: 'Servicios', href: '/doctor/services', icon: Package, moduleKey: 'services' },
    ],
  },
  {
    key: 'marketing',
    label: 'Marketing',
    icon: Megaphone,
    items: [
      { name: 'Recordatorios', href: '/doctor/reminders', icon: Bell, moduleKey: 'reminders' },
    ],
  },
];

const allNavItems: NavItem[] = [...topItems, ...navSections.flatMap((s) => s.items)];

function isPathActive(pathname: string, href: string) {
  if (href === '/doctor') return pathname === '/doctor';
  return pathname === href || pathname.startsWith(href + '/');
}

/** Returns true if the item should be visible given current capabilities (RBAC). */
function isItemVisible(item: NavItem, caps: Capabilities | null): boolean {
  if (caps === null) return true; // still loading — show all to avoid flash-of-empty
  if (!item.moduleKey) return true; // ungated items always visible
  return can(caps, item.moduleKey, 'view');
}

/**
 * Returns true if the item's feature is unlocked by the current plan.
 * Items without moduleKey are always accessible.
 * While plan features are loading (null), treat as accessible to avoid flash-of-locked.
 */
function isPlanUnlocked(item: NavItem, planFeatures: PlanFeatures | null): boolean {
  return planUnlocks(planFeatures, item.moduleKey);
}

export default function DoctorLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [planFeatures, setPlanFeatures] = useState<PlanFeatures | null>(null);

  // Onboarding gate: 'checking' → 'ok' | 'redirect'
  // While 'checking', render nothing to avoid flash of portal content.
  const [onboardingState, setOnboardingState] = useState<'checking' | 'ok' | 'redirect'>(
    'checking',
  );

  const [pinned, setPinned] = useState(true);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('delta_sidebar_pinned');
      if (saved !== null) setPinned(saved === 'true');
    } catch {}
  }, []);

  // Onboarding gate: on every navigation within /doctor, check if the doctor
  // has completed their profile. If not (no cedula) and they are NOT already
  // on /doctor/onboarding, force-redirect there.
  useEffect(() => {
    // Skip the check when already on the onboarding route — avoids an
    // infinite redirect loop when the gate fires on the onboarding page itself.
    // (The onboarding page has its own standalone layout and will render fine.)
    if (pathname === '/doctor/onboarding' || pathname.startsWith('/doctor/onboarding/')) {
      setOnboardingState('ok');
      return;
    }

    let cancelled = false;
    setOnboardingState('checking');

    checkOnboardingComplete()
      .then((complete) => {
        if (cancelled) return;
        if (!complete) {
          router.replace('/doctor/onboarding');
          setOnboardingState('redirect');
        } else {
          setOnboardingState('ok');
        }
      })
      .catch(() => {
        // On error, allow access rather than blocking indefinitely.
        if (!cancelled) setOnboardingState('ok');
      });

    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  useEffect(() => {
    getMyCapabilities()
      .then(setCaps)
      .catch(() => setCaps(EMPTY_CAPABILITIES));
    getDoctorPlanFeatures()
      .then(setPlanFeatures)
      .catch(() => setPlanFeatures(EMPTY_PLAN_FEATURES));
  }, []);

  const togglePin = useCallback(() => {
    setPinned((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('delta_sidebar_pinned', String(next));
      } catch {}
      return next;
    });
  }, []);

  const sidebarVisible = pinned || hovered;

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const initial: Record<string, boolean> = {};
    navSections.forEach((section) => {
      const hasActive = section.items.some((item) => isPathActive(pathname, item.href));
      initial[section.key] = hasActive;
    });
    setOpenSections((prev) => {
      const merged = { ...prev };
      Object.entries(initial).forEach(([key, active]) => {
        if (active) merged[key] = true;
      });
      return merged;
    });
  }, [pathname]);

  const toggleSection = (key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  async function handleLogout() {
    // ETAPA 1 dev-stub: logoutAction clears dev-auth cookies server-side.
    // ETAPA 2: will call Auth0 /v2/logout instead.
    await logoutAction();
  }

  const activeTitle =
    allNavItems.find((i) => isPathActive(pathname, i.href))?.name ??
    (pathname.includes('/settings')
      ? 'Configuración'
      : pathname.includes('/suggestions')
        ? 'Sugerencias'
        : 'Portal Médico');

  // Block render until we know whether to show the portal or redirect.
  // This prevents a flash of the full portal UI before the gate fires.
  if (onboardingState === 'checking' || onboardingState === 'redirect') {
    return null;
  }

  // The mandatory onboarding renders full-screen (no portal sidebar). Layouts
  // nest in the App Router, so we skip the portal chrome for that route here.
  if (pathname === '/doctor/onboarding' || pathname.startsWith('/doctor/onboarding/')) {
    return <>{children}</>;
  }

  return (
    <>
      <Toaster />
      <style>{`
        .doctor-shell { font-family: var(--dh-font-body); color: var(--dh-ink); }
        .sidebar-hover-zone { position: fixed; top: 0; left: 0; width: 12px; height: 100%; z-index: 45; }
      `}</style>

      <div className="doctor-shell flex min-h-screen" style={{ background: 'var(--dh-bone)' }}>
        {mobileOpen && (
          <div
            className="fixed inset-0 bg-black/40 z-40 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {!pinned && !hovered && (
          <div
            className="sidebar-hover-zone hidden lg:block"
            onMouseEnter={() => setHovered(true)}
          />
        )}

        {/* Sidebar */}
        <aside
          onMouseEnter={() => {
            if (!pinned) setHovered(true);
          }}
          onMouseLeave={() => {
            if (!pinned) setHovered(false);
          }}
          className={clsx(
            'fixed inset-y-0 left-0 w-[260px] flex flex-col bg-white z-50 transition-transform duration-200',
            mobileOpen ? 'translate-x-0' : '-translate-x-full',
            sidebarVisible ? 'lg:translate-x-0' : 'lg:-translate-x-full',
          )}
          style={{
            borderRight: '1px solid var(--dh-gray-100)',
            ...(!pinned && hovered ? { boxShadow: 'var(--dh-shadow-md)' } : {}),
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
                    fontSize: 10,
                    fontWeight: 600,
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
              className={clsx(
                'hidden lg:flex items-center justify-center w-7 h-7 rounded-lg transition-all',
              )}
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
              {topItems
                .filter((item) => isItemVisible(item, caps))
                .map((item) => {
                  const active = isPathActive(pathname, item.href);
                  const locked = !isPlanUnlocked(item, planFeatures);
                  if (locked) {
                    return (
                      <button
                        key={item.href}
                        type="button"
                        onClick={() => {
                          setMobileOpen(false);
                          router.push('/doctor/upgrade');
                        }}
                        title="Mejora tu plan para acceder"
                        className="w-full flex items-center gap-3 px-3.5 py-2.5 text-sm transition-all"
                        style={{
                          borderRadius: 'var(--dh-r-md)',
                          color: 'var(--dh-gray-300)',
                          fontWeight: 500,
                        }}
                      >
                        <item.icon className="w-[18px] h-[18px] shrink-0 opacity-40" />
                        <span className="flex-1 text-left opacity-60">{item.name}</span>
                        <Lock className="w-3 h-3 opacity-40 shrink-0" />
                      </button>
                    );
                  }
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
                  );
                })}
            </div>

            {/* Collapsible sections */}
            {navSections.map((section) => {
              const visibleItems = section.items.filter((item) => isItemVisible(item, caps));
              if (visibleItems.length === 0) return null;
              const isOpen = openSections[section.key] ?? false;
              const sectionHasActive = visibleItems.some((item) =>
                isPathActive(pathname, item.href),
              );
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
                        style={{
                          color: sectionHasActive
                            ? 'var(--dh-turquoise-700)'
                            : 'var(--dh-gray-400)',
                        }}
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
                      maxHeight: isOpen ? `${visibleItems.length * 40}px` : '0px',
                      opacity: isOpen ? 1 : 0,
                    }}
                  >
                    <div className="pl-3 mt-0.5 space-y-0.5">
                      {visibleItems.map((item) => {
                        const active = isPathActive(pathname, item.href);
                        const locked = !isPlanUnlocked(item, planFeatures);
                        if (locked) {
                          return (
                            <button
                              key={item.href}
                              type="button"
                              onClick={() => {
                                setMobileOpen(false);
                                router.push('/doctor/upgrade');
                              }}
                              title="Mejora tu plan para acceder"
                              className="w-full flex items-center gap-3 px-3.5 py-2 text-[13px] transition-all"
                              style={{
                                borderRadius: 'var(--dh-r-md)',
                                color: 'var(--dh-gray-200)',
                                fontWeight: 500,
                              }}
                            >
                              <item.icon
                                className="w-3.5 h-3.5 shrink-0 opacity-30"
                                style={{ color: 'var(--dh-gray-200)' }}
                              />
                              <span className="flex-1 text-left opacity-50">{item.name}</span>
                              <Lock className="w-3 h-3 opacity-30 shrink-0" />
                            </button>
                          );
                        }
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
                              style={{
                                color: active ? 'var(--dh-turquoise-700)' : 'var(--dh-gray-200)',
                              }}
                            />
                            {item.name}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </nav>

          {/* Footer */}
          <div
            className="px-3 py-4 space-y-2"
            style={{ borderTop: '1px solid var(--dh-gray-100)' }}
          >
            <div
              className="px-3.5 py-2"
              style={{
                background: 'var(--dh-turquoise-50)',
                border: '1px solid var(--dh-turquoise-100)',
                borderRadius: 'var(--dh-r-md)',
              }}
            >
              <div className="flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5">
                  <CheckCircle
                    className="w-3.5 h-3.5 shrink-0"
                    style={{ color: 'var(--dh-turquoise-700)' }}
                  />
                  <p className="text-xs font-bold" style={{ color: 'var(--dh-turquoise-700)' }}>
                    {planFeatures?.effective_plan_key ?? 'Plan activo'}
                  </p>
                </div>
                {planFeatures && planFeatures.effective_plan_key !== 'delta_plus' && (
                  <Link
                    href="/doctor/upgrade"
                    onClick={() => setMobileOpen(false)}
                    className="text-[10px] font-semibold underline"
                    style={{ color: 'var(--dh-turquoise-700)' }}
                  >
                    Mejorar
                  </Link>
                )}
              </div>
              <p className="mt-0.5" style={{ fontSize: 10, color: 'var(--dh-gray-400)' }}>
                {planFeatures?.is_downgraded ? 'Plan degradado temporalmente' : 'Acceso completo'}
              </p>
            </div>

            {(caps === null || can(caps, 'suggestions', 'view')) && (
              <Link
                href="/doctor/suggestions"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 px-3.5 py-2.5 text-sm transition-all"
                style={{
                  borderRadius: 'var(--dh-r-md)',
                  background: pathname.includes('/suggestions')
                    ? 'var(--dh-turquoise-50)'
                    : 'transparent',
                  color: pathname.includes('/suggestions')
                    ? 'var(--dh-turquoise-700)'
                    : 'var(--dh-gray-600)',
                  fontWeight: pathname.includes('/suggestions') ? 600 : 500,
                }}
              >
                <MessageSquarePlus className="w-[18px] h-[18px]" />
                Sugerencias
              </Link>
            )}

            {(caps === null || can(caps, 'settings', 'view')) && (
              <Link
                href="/doctor/settings"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 px-3.5 py-2.5 text-sm transition-all"
                style={{
                  borderRadius: 'var(--dh-r-md)',
                  background: pathname.includes('/settings')
                    ? 'var(--dh-turquoise-50)'
                    : 'transparent',
                  color: pathname.includes('/settings')
                    ? 'var(--dh-turquoise-700)'
                    : 'var(--dh-gray-600)',
                  fontWeight: pathname.includes('/settings') ? 600 : 500,
                }}
              >
                <Settings className="w-[18px] h-[18px]" />
                Configuración
              </Link>
            )}

            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm w-full transition-all"
              style={{ color: 'var(--dh-gray-400)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--dh-error)';
                e.currentTarget.style.background = '#FEF2F2';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--dh-gray-400)';
                e.currentTarget.style.background = 'transparent';
              }}
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
            pinned ? 'lg:ml-[260px]' : 'lg:ml-0',
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
                style={{
                  fontFamily: 'var(--dh-font-display)',
                  fontSize: 17,
                  color: 'var(--dh-ink)',
                }}
              >
                {activeTitle}
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <SearchCommandPalette />
              <div
                className="relative p-2 rounded-full cursor-pointer transition-colors"
                style={{ color: 'var(--dh-gray-600)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--dh-gray-50)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <Bell className="w-[18px] h-[18px]" />
              </div>
            </div>
          </header>

          <main className="flex-1 px-4 sm:px-6 lg:px-10 py-6 lg:py-8 w-full">
            <div className="max-w-6xl xl:max-w-7xl mx-auto w-full">{children}</div>
          </main>
        </div>
        <DoctorNotificationToast />
      </div>
    </>
  );
}
