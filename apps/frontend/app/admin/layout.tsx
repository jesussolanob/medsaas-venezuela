'use client';

/**
 * Admin layout — Delta Health Tech design system
 * 2026-05-02: rediseño completo según handoff bundle (claude.ai/design).
 * Uso de tokens --dh-* + componentes <DeltaMark> de @/components/dh.
 */

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard,
  Users,
  UsersRound,
  ClipboardCheck,
  CreditCard,
  TrendingUp,
  Settings,
  LogOut,
  Menu,
  MessageSquarePlus,
  PanelLeftClose,
  Pin,
  X,
  Shield,
  Package,
  BadgeCheck,
  Stethoscope,
  Mail,
  Wallet,
  Plus,
  ChevronDown,
} from 'lucide-react';
import { clsx } from 'clsx';
import AdminNotifications from './AdminNotifications';
import SearchCommandPalette from './SearchCommandPalette';
import { HelpButton } from '@/components/help/HelpButton';
import { Toaster } from '@/components/ui/Toaster';
import { DeltaMark } from '@/components/dh';
import { getMyCapabilities } from '@/app/capabilities-actions';
import { can, EMPTY_CAPABILITIES, type Capabilities } from '@/lib/capabilities';

type NavLeaf = { name: string; href: string; icon: React.ElementType; moduleKey?: string };
type NavGroup = { name: string; icon: React.ElementType; children: NavLeaf[] };
type NavEntry = NavLeaf | NavGroup;

function isNavGroup(entry: NavEntry): entry is NavGroup {
  return (entry as NavGroup).children !== undefined;
}

// "Pagos" agrupa todo lo relativo a cobros de suscripción de doctores:
//   - Aprobaciones: revisar/aprobar comprobantes que suben los doctores.
//   - Registrar pago: el admin registra un pago manual (efectivo/transferencia directa).
const navItems: NavEntry[] = [
  { name: 'Dashboard', href: '/admin', icon: LayoutDashboard, moduleKey: 'dashboard' },
  { name: 'Especialistas', href: '/admin/doctors', icon: Users, moduleKey: 'doctors' },
  {
    name: 'Pagos',
    icon: Wallet,
    children: [
      {
        name: 'Aprobaciones',
        href: '/admin/aprobaciones',
        icon: ClipboardCheck,
        moduleKey: 'approvals',
      },
      { name: 'Registrar pago', href: '/admin/pagos/registrar', icon: Plus },
    ],
  },
  { name: 'Pacientes', href: '/admin/patients', icon: UsersRound, moduleKey: 'patients' },
  { name: 'Finanzas', href: '/admin/finanzas', icon: TrendingUp }, // sin gating: no hay módulo 'finances' para admin en el seed (beta)
  {
    name: 'Suscripciones',
    href: '/admin/subscriptions',
    icon: CreditCard,
    moduleKey: 'subscriptions',
  },
  { name: 'Planes', href: '/admin/plans', icon: Package },
  { name: 'Verificaciones', href: '/admin/verifications', icon: BadgeCheck },
  { name: 'Especialidades', href: '/admin/specialties', icon: Stethoscope },
  { name: 'Plantillas de email', href: '/admin/email-templates', icon: Mail },
  { name: 'Roles', href: '/admin/roles', icon: Shield, moduleKey: 'roles' },
  {
    name: 'Sugerencias',
    href: '/admin/suggestions',
    icon: MessageSquarePlus,
    moduleKey: 'suggestions',
  },
  { name: 'Configuración', href: '/admin/settings', icon: Settings, moduleKey: 'settings' },
];

function isPathActive(pathname: string, href: string) {
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(href + '/');
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [caps, setCaps] = useState<Capabilities | null>(null);

  const [pinned, setPinned] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (name: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const isLeafVisible = (leaf: NavLeaf) =>
    caps === null || !leaf.moduleKey || can(caps, leaf.moduleKey, 'view');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('delta_admin_sidebar_pinned');
      if (saved !== null) setPinned(saved === 'true');
    } catch {}
  }, []);

  useEffect(() => {
    getMyCapabilities()
      .then(setCaps)
      .catch(() => setCaps(EMPTY_CAPABILITIES));
  }, []);

  const togglePin = useCallback(() => {
    setPinned((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('delta_admin_sidebar_pinned', String(next));
      } catch {}
      return next;
    });
  }, []);

  const sidebarVisible = pinned || hovered;

  function handleLogout() {
    // En Auth0, delegar al SDK logout: limpia la sesión httpOnly y pasa por
    // el /v2/logout de Auth0. Sin esto, borrar las cookies dev-stub no cierra
    // la sesión real y el usuario seguía autenticado.
    if (process.env.NEXT_PUBLIC_AUTH_MODE === 'auth0') {
      window.location.href = '/auth/logout';
      return;
    }
    // Dev-stub: limpiar cookies y volver al login.
    document.cookie = 'dev_user_id=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    document.cookie = 'dev_user_role=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    router.push('/login');
  }

  const allLeaves: NavLeaf[] = navItems.flatMap((e) => (isNavGroup(e) ? e.children : [e]));
  const activeTitle = allLeaves.find((n) => isPathActive(pathname, n.href))?.name ?? 'Admin';

  return (
    <>
      <Toaster />
      <style>{`
        .admin-shell { font-family: var(--dh-font-body); color: var(--dh-ink); }
        .admin-shell .nav-item-active { background: var(--dh-turquoise-50); color: var(--dh-turquoise-700); }
        .sidebar-hover-zone-admin { position: fixed; top: 0; left: 0; width: 12px; height: 100%; z-index: 45; }
      `}</style>

      <div className="admin-shell flex min-h-screen" style={{ background: 'var(--dh-bone)' }}>
        {mobileOpen && (
          <div
            className="fixed inset-0 bg-black/40 z-40 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {!pinned && !hovered && (
          <div
            className="sidebar-hover-zone-admin hidden lg:block"
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
          {/* Header logo + pin/close */}
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
                  Delta <span style={{ color: 'var(--dh-turquoise)' }}>Salud</span>
                </p>
                <p
                  className="mt-1"
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: 'var(--dh-turquoise-700)',
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    fontFamily: 'var(--dh-font-mono)',
                  }}
                >
                  Super Admin
                </p>
              </div>
            </div>

            {/* Mobile close */}
            <button
              className="lg:hidden p-1.5 rounded-lg hover:bg-[var(--dh-gray-50)]"
              onClick={() => setMobileOpen(false)}
              style={{ color: 'var(--dh-gray-600)' }}
              aria-label="Cerrar menú"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Desktop pin toggle */}
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
          <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
            {navItems.map((entry) => {
              // Leaf item
              if (!isNavGroup(entry)) {
                if (!isLeafVisible(entry)) return null;
                const active = isPathActive(pathname, entry.href);
                return (
                  <Link
                    key={entry.name}
                    href={entry.href}
                    onClick={() => setMobileOpen(false)}
                    className={clsx(
                      'flex items-center gap-3 px-3.5 py-2.5 text-sm rounded-[var(--dh-r-md)] transition-all',
                      active && 'nav-item-active',
                    )}
                    style={{
                      color: active ? 'var(--dh-turquoise-700)' : 'var(--dh-gray-600)',
                      fontWeight: active ? 600 : 500,
                    }}
                  >
                    <entry.icon className="w-[18px] h-[18px] shrink-0" />
                    {entry.name}
                  </Link>
                );
              }

              // Group with collapsible children
              const visibleChildren = entry.children.filter(isLeafVisible);
              if (visibleChildren.length === 0) return null;
              const anyChildActive = visibleChildren.some((c) => isPathActive(pathname, c.href));
              const expanded = openGroups.has(entry.name) || anyChildActive;

              return (
                <div key={entry.name}>
                  <button
                    type="button"
                    onClick={() => toggleGroup(entry.name)}
                    aria-expanded={expanded}
                    className="flex items-center gap-3 px-3.5 py-2.5 w-full text-sm rounded-[var(--dh-r-md)] transition-all"
                    style={{
                      color: anyChildActive ? 'var(--dh-turquoise-700)' : 'var(--dh-gray-600)',
                      fontWeight: anyChildActive ? 600 : 500,
                    }}
                  >
                    <entry.icon className="w-[18px] h-[18px] shrink-0" />
                    <span className="flex-1 text-left">{entry.name}</span>
                    <ChevronDown
                      className={clsx(
                        'w-4 h-4 shrink-0 transition-transform',
                        expanded && 'rotate-180',
                      )}
                    />
                  </button>
                  {expanded && (
                    <div
                      className="mt-0.5 ml-[18px] pl-3 space-y-0.5"
                      style={{ borderLeft: '1px solid var(--dh-gray-100)' }}
                    >
                      {visibleChildren.map((child) => {
                        const active = isPathActive(pathname, child.href);
                        return (
                          <Link
                            key={child.name}
                            href={child.href}
                            onClick={() => setMobileOpen(false)}
                            className={clsx(
                              'flex items-center gap-3 px-3.5 py-2 text-[13px] rounded-[var(--dh-r-md)] transition-all',
                              active && 'nav-item-active',
                            )}
                            style={{
                              color: active ? 'var(--dh-turquoise-700)' : 'var(--dh-gray-600)',
                              fontWeight: active ? 600 : 500,
                            }}
                          >
                            <child.icon className="w-4 h-4 shrink-0" />
                            {child.name}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* Footer: status + logout */}
          <div
            className="px-3 py-4 space-y-1"
            style={{ borderTop: '1px solid var(--dh-gray-100)' }}
          >
            <div className="px-3.5 py-2">
              <div className="flex items-center gap-1.5">
                <div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: 'var(--dh-success)' }}
                />
                <span
                  style={{
                    fontSize: 10,
                    color: 'var(--dh-gray-400)',
                    fontWeight: 500,
                    fontFamily: 'var(--dh-font-mono)',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                  }}
                >
                  Sistema operativo
                </span>
              </div>
            </div>
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

        {/* Main */}
        <div
          className={clsx(
            'flex-1 flex flex-col min-h-screen w-full transition-[margin] duration-200',
            pinned ? 'lg:ml-[260px]' : 'lg:ml-0',
          )}
        >
          {/* Topbar */}
          <header
            className="sticky top-0 z-30 flex items-center justify-between gap-4 px-4 sm:px-6 lg:px-10 py-3.5 bg-white/85 backdrop-blur"
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
              <h1
                className="font-semibold tracking-tight truncate"
                style={{
                  fontFamily: 'var(--dh-font-display)',
                  fontSize: 17,
                  color: 'var(--dh-ink)',
                }}
              >
                {activeTitle}
              </h1>
            </div>

            <div className="flex items-center gap-2">
              <SearchCommandPalette />
              <HelpButton />
              <AdminNotifications />
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 px-4 sm:px-6 lg:px-10 py-6 lg:py-8 max-w-[1440px] w-full mx-auto">
            {children}
          </main>
        </div>
      </div>
    </>
  );
}
