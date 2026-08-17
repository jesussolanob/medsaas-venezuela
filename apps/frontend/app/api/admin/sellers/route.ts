/**
 * /api/admin/sellers — gestión de vendedores (SOLO super_admin).
 *
 * Thin-proxy al módulo NestJS `sellers`:
 *   GET  → lista de vendedores con su código y cuántos especialistas dio de alta
 *   POST → alta de un vendedor; el backend genera el `sellerCode` (el cliente
 *          NUNCA lo manda) y crea el perfil con rol `seller`
 *
 * El RBAC lo aplica el backend con `@Roles('super_admin')` — acá no se duplica
 * esa decisión. Solo el super administrador gestiona vendedores (decisión del
 * dueño, 2026-08-17); el rol `admin` ni siquiera existe en la sesión.
 *
 * Ambas respuestas van con envelope `{ success, data }`, que es lo que espera
 * la pantalla `/admin/sellers`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { backendGet, backendPost } from '@/lib/api-client.server';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';

interface SellerCreated {
  id: string;
  sellerCode: string;
  createdAt: string;
}

/** Fila del listado — el backend serializa en camelCase. */
export interface SellerAdminRow {
  id: string;
  fullName: string;
  email: string;
  sellerCode: string;
  specialistsCount: number;
  createdAt: string;
  lastSignInAt: string | null;
}

export async function GET(): Promise<NextResponse> {
  const result = await backendGet<SellerAdminRow[]>('/api/admin/sellers');

  if (!result.ok) {
    // No se loguea el cuerpo: trae nombre y correo de los vendedores.
    log.error('[admin/sellers GET] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return NextResponse.json(
      { success: false, error: result.error.message },
      { status: result.error.status ?? 502 },
    );
  }

  return NextResponse.json({
    success: true,
    data: Array.isArray(result.value) ? result.value : [],
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json()) as { fullName?: string; email?: string };

  if (!body.fullName?.trim() || !body.email?.trim()) {
    return NextResponse.json(
      { error: 'El nombre y el correo son obligatorios', code: 'BAD_REQUEST' },
      { status: 400 },
    );
  }

  const result = await backendPost<SellerCreated>('/api/admin/sellers', {
    full_name: body.fullName.trim(),
    email: body.email.trim(),
  });

  if (!result.ok) {
    if (result.error.status === 409) {
      return NextResponse.json(
        { error: 'Ya existe una cuenta con ese correo.', code: 'email_conflict' },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: result.error.message, code: result.error.code },
      { status: result.error.status ?? 502 },
    );
  }

  return NextResponse.json({ success: true, data: result.value });
}
