/**
 * GET /api/session — quién está autenticado AHORA, según el backend.
 *
 * Devuelve solo `{ authenticated, role }` del propio solicitante: sin PII, sin
 * datos de terceros. Existe para que las pantallas puedan darse cuenta de que
 * la sesión del navegador cambió debajo de ellas.
 *
 * Por qué hace falta: la sesión de Auth0 es una cookie del PERFIL DEL NAVEGADOR,
 * no de la pestaña. Si alguien abre `/doctor` en otra pestaña de la misma
 * ventana y entra con otra cuenta, la pestaña de `/admin` sigue mostrando lo
 * que cargó antes, pero cada acción nueva ya viaja con la OTRA identidad y el
 * backend la rechaza. Pasó el 2026-08-18 y se leyó como un bug de permisos.
 */
import { NextResponse } from 'next/server';
import { resolveIdentity } from '@/lib/identity.server';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    const identity = await resolveIdentity();
    return NextResponse.json({ authenticated: true, role: identity.role });
  } catch {
    return NextResponse.json({ authenticated: false, role: null });
  }
}
