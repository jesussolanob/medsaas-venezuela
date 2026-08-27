'use client';

/**
 * Layout del portal del vendedor.
 *
 * Hasta ahora `/seller` era una PÁGINA SUELTA sin barra lateral — la única
 * pantalla de la app con esa forma. Eso tenía dos consecuencias: no se parecía
 * a nada (el vendedor que también es admin cambiaba de mundo al entrar) y no
 * había dónde colgar nada nuevo, así que todo se apilaba en una sola vista.
 *
 * Se replica la estructura de `/admin` y `/doctor` —mismos tokens `--dh-*`,
 * mismo ancho de 260px, mismo estilo de item activo— pero SIN el fijado ni los
 * grupos colapsables: con dos secciones, esa maquinaria solo agregaría estado
 * que mantener.
 *
 * La guarda de acceso NO está acá: vive en `proxy.ts`, que ya cubre
 * `/seller/:path*`. Un solo lugar donde se decide quién entra.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Home, Users, Menu, X } from 'lucide-react';
import { clsx } from 'clsx';
import { Toaster } from '@/components/ui/Toaster';
import { DeltaMark } from '@/components/dh';
import TermsModal from '@/components/legal/TermsModal';
import { SidebarUtilityBar } from '@/components/doctor/SidebarUtilityBar';

type NavLeaf = {
  name: string;
  href: string;
  icon: typeof Home;
};

const NAV: NavLeaf[] = [
  { name: 'Inicio', href: '/seller', icon: Home },
  { name: 'Especialistas', href: '/seller/especialistas', icon: Users },
];

/**
 * Activo por coincidencia EXACTA en la raíz.
 *
 * Con `startsWith`, "/seller" quedaría activo estando en
 * "/seller/especialistas" y se verían dos items resaltados a la vez.
 */
function esActivo(pathname: string, href: string): boolean {
  return href === '/seller' ? pathname === '/seller' : pathname.startsWith(href);
}

export default function SellerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [termsModalOpen, setTermsModalOpen] = useState(false);
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false);

  const titulo = NAV.find((n) => esActivo(pathname, n.href))?.name ?? 'Portal del vendedor';

  /**
   * Cierra la sesión. Con Auth0 hay que pasar por su `/v2/logout`: borrar las
   * cookies locales NO cierra la sesión real y el vendedor seguiría dentro —
   * en una máquina compartida, que es donde trabaja un equipo comercial, eso
   * deja la sesión abierta para el siguiente.
   */
  function cerrarSesion() {
    if (process.env.NEXT_PUBLIC_AUTH_MODE === 'auth0') {
      window.location.href = '/auth/logout';
      return;
    }
    document.cookie = 'dev_user_id=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    document.cookie = 'dev_user_role=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    window.location.href = '/login';
  }

  return (
    <>
      <Toaster />
      <style>{`
        .seller-shell { font-family: var(--dh-font-body); color: var(--dh-ink); }
        .seller-shell .nav-item-active { background: var(--dh-turquoise-50); color: var(--dh-turquoise-700); }
      `}</style>

      <div className="seller-shell flex min-h-screen" style={{ background: 'var(--dh-bone)' }}>
        {mobileOpen && (
          <div
            className="fixed inset-0 bg-black/40 z-40 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          className={clsx(
            'fixed inset-y-0 left-0 w-[260px] flex flex-col bg-white z-50 transition-transform duration-200',
            mobileOpen ? 'translate-x-0' : '-translate-x-full',
            'lg:translate-x-0',
          )}
          style={{ borderRight: '1px solid var(--dh-gray-100)' }}
        >
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
                  Vendedor
                </p>
              </div>
            </div>

            <button
              className="lg:hidden p-1.5 rounded-lg hover:bg-[var(--dh-gray-50)]"
              onClick={() => setMobileOpen(false)}
              style={{ color: 'var(--dh-gray-600)' }}
              aria-label="Cerrar menú"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
            {NAV.map((item) => {
              const active = esActivo(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  aria-current={active ? 'page' : undefined}
                  className={clsx(
                    'flex items-center gap-3 px-3.5 py-2.5 text-sm rounded-[var(--dh-r-md)] transition-all',
                    active && 'nav-item-active',
                  )}
                  style={{
                    color: active ? 'var(--dh-turquoise-700)' : 'var(--dh-gray-600)',
                    fontWeight: active ? 600 : 500,
                  }}
                >
                  <item.icon className="w-[18px] h-[18px] shrink-0" />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          {/*
            Términos, privacidad y cerrar sesión: la MISMA fila de iconos que el
            especialista (`SidebarUtilityBar`), no una copia. Los documentos
            legales aplican a todo el que usa la plataforma, y el vendedor es el
            único perfil que no los tenía a mano — quedaban solo en el pie del
            registro público.
          */}
          <div className="px-3 pb-3">
            <SidebarUtilityBar
              onOpenTerms={() => setTermsModalOpen(true)}
              onOpenPrivacy={() => setPrivacyModalOpen(true)}
              onLogout={cerrarSesion}
            />
          </div>
        </aside>

        <TermsModal open={termsModalOpen} onClose={() => setTermsModalOpen(false)} />
        <TermsModal
          docType="privacy"
          open={privacyModalOpen}
          onClose={() => setPrivacyModalOpen(false)}
        />

        {/* Main */}
        <div className="flex-1 flex flex-col min-h-screen w-full lg:ml-[260px]">
          <header
            className="sticky top-0 z-30 flex items-center gap-3 px-4 sm:px-6 lg:px-10 py-3.5 bg-white/85 backdrop-blur"
            style={{ borderBottom: '1px solid var(--dh-gray-100)' }}
          >
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
              {titulo}
            </h1>
          </header>

          <main className="flex-1 px-4 sm:px-6 lg:px-10 py-6 lg:py-8 max-w-[1440px] w-full mx-auto">
            {children}
          </main>
        </div>
      </div>
    </>
  );
}
