'use client';

/**
 * AdminSessionWatchdog — avisa cuando la sesión del navegador dejó de ser la
 * del administrador que abrió esta pantalla.
 *
 * El problema real que resuelve (QA del 2026-08-18): la sesión de Auth0 vive en
 * una cookie del PERFIL DEL NAVEGADOR, no de la pestaña. Si en otra pestaña de
 * la misma ventana alguien entra como especialista, la pestaña de `/admin` sigue
 * mostrando la tabla que cargó antes —parece que todo está bien— pero cada
 * acción nueva viaja con la otra identidad y el backend la rechaza. En pantalla
 * se veía "Insufficient permissions. Required role: super_admin", que se lee
 * como un permiso mal configurado y no como lo que era: otra cuenta.
 *
 * Chequea al montar, al volver el foco a la ventana y cada 60s. Solo bloquea
 * ante una respuesta CONCLUYENTE del servidor: un error de red no interrumpe a
 * nadie (se reintenta en el próximo ciclo).
 */

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

const CHECK_INTERVAL_MS = 60_000;

type Estado = 'ok' | 'otra-cuenta' | 'sin-sesion';

export default function AdminSessionWatchdog() {
  const [estado, setEstado] = useState<Estado>('ok');

  const revisar = useCallback(async () => {
    try {
      const res = await fetch('/api/session', { cache: 'no-store' });
      if (!res.ok) return; // respuesta no concluyente: no molestar
      const { authenticated, role } = (await res.json()) as {
        authenticated: boolean;
        role: string | null;
      };
      if (!authenticated) {
        setEstado('sin-sesion');
        return;
      }
      setEstado(role === 'super_admin' ? 'ok' : 'otra-cuenta');
    } catch {
      // Sin red: se reintenta en el próximo ciclo.
    }
  }, []);

  useEffect(() => {
    void revisar();
    const timer = setInterval(() => void revisar(), CHECK_INTERVAL_MS);
    const onFocus = () => void revisar();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [revisar]);

  if (estado === 'ok') return null;

  const esOtraCuenta = estado === 'otra-cuenta';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="watchdog-titulo"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h2 id="watchdog-titulo" className="text-lg font-bold text-slate-900">
              {esOtraCuenta ? 'Esta ventana cambió de cuenta' : 'Tu sesión expiró'}
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              {esOtraCuenta
                ? 'La sesión de este navegador ya no es la de un administrador: alguien inició sesión con otra cuenta en esta misma ventana. Lo que ves en pantalla es de antes, y cualquier acción que hagas va a ser rechazada.'
                : 'Ya no hay una sesión activa en este navegador. Lo que ves en pantalla es de antes.'}
            </p>
            <p className="mt-2 text-sm text-slate-600">
              Volvé a iniciar sesión con tu cuenta de administrador para seguir.
            </p>
          </div>
        </div>
        <a
          // Mismo destino que el botón "Cerrar sesión" del layout: en Auth0 hay
          // que pasar por /auth/logout (limpia la cookie httpOnly y el /v2/logout
          // de Auth0); en dev-stub no existe esa ruta y se vuelve al login.
          href={process.env.NEXT_PUBLIC_AUTH_MODE === 'auth0' ? '/auth/logout' : '/login'}
          className="mt-5 flex w-full items-center justify-center rounded-lg bg-teal-500 py-2.5 text-sm font-semibold text-white hover:bg-teal-600"
        >
          Iniciar sesión de nuevo
        </a>
      </div>
    </div>
  );
}
