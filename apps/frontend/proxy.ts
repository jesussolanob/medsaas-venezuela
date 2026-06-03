/**
 * proxy.ts  (anteriormente middleware.ts — renombrado para Next.js 16)
 *
 * STUB Etapa 1 — reemplazar por Auth0 en Fase 4.
 *
 * Lee la identidad del usuario desde cookies de desarrollo (dev_user_id,
 * dev_user_role) en lugar de la sesión Supabase, y aplica el mismo gating de
 * rutas que antes:
 *   /admin   → solo super_admin
 *   /doctor  → doctor o super_admin
 *   /patient → patient o super_admin
 *
 * Si la cookie dev_user_id está ausente se considera "no autenticado" y se
 * redirige a /login (mismo comportamiento que antes). Para desarrollo local
 * setear las cookies manualmente o confiar en el DEFAULT_USER_ID del stub.
 *
 * En Etapa 2 (Auth0 + Fase 4): reemplazar getDevUserFromRequest() por la
 * verificación del JWT de Auth0 contenido en la httpOnly cookie de sesión.
 * El resto de la lógica de redirección queda igual.
 *
 * NOTA: el middleware corre en Edge Runtime — no puede usar next/headers ni
 * ningún módulo Node.js. Solo acepta cookies del NextRequest.
 */

import { NextRequest, NextResponse } from 'next/server';
// Import from dev-auth.edge (no Node/server-only imports) — safe for Edge Runtime.
import { getDevUserFromRequest } from '@/lib/dev-auth.edge';

export function proxy(request: NextRequest): NextResponse {
  const path = request.nextUrl.pathname;

  // Leer identidad desde cookies de dev (stub Etapa 1)
  const devUserIdCookie = request.cookies.get('dev_user_id')?.value ?? null;
  const isAuthenticated = devUserIdCookie !== null && devUserIdCookie.trim().length > 0;

  // ── 1. Autenticación obligatoria para las 3 áreas ──────────────────────────
  if (!isAuthenticated) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', path);
    return NextResponse.redirect(loginUrl);
  }

  // ── 2. RBAC — verificar rol contra la ruta ──────────────────────────────────
  const { role } = getDevUserFromRequest(request.cookies);

  // /admin — solo super_admin
  if (path.startsWith('/admin') && role !== 'super_admin') {
    const target =
      role === 'patient' ? '/patient/dashboard' : role === 'doctor' ? '/doctor' : '/login';
    return NextResponse.redirect(new URL(target, request.url));
  }

  // /doctor — doctor o super_admin
  if (path.startsWith('/doctor') && role !== 'doctor' && role !== 'super_admin') {
    const target = role === 'patient' ? '/patient/dashboard' : '/login';
    return NextResponse.redirect(new URL(target, request.url));
  }

  // /patient — patient o super_admin
  if (path.startsWith('/patient') && role !== 'patient' && role !== 'super_admin') {
    const target = role === 'doctor' ? '/doctor' : '/login';
    return NextResponse.redirect(new URL(target, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/doctor/:path*', '/patient/:path*'],
};
