/**
 * POST /api/admin/sellers — alta de un vendedor.
 *
 * Thin-proxy a `POST /api/admin/sellers` del backend, que genera el
 * `sellerCode` (el cliente NUNCA lo manda) y crea el perfil con rol `seller`.
 *
 * Lo puede llamar cualquier administrador (`super_admin` o `admin`): el
 * backend aplica los roles, acá no se duplica esa decisión.
 *
 * Sin esta ruta el módulo de ventas era inalcanzable desde la aplicación: el
 * endpoint del backend existía y nada podía invocarlo.
 */
import { NextRequest, NextResponse } from 'next/server';
import { backendPost } from '@/lib/api-client.server';

export const dynamic = 'force-dynamic';

interface SellerCreated {
  id: string;
  sellerCode: string;
  createdAt: string;
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
