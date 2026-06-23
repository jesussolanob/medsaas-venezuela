/**
 * POST /api/admin/subscription-payments
 *
 * Thin-proxy → NestJS POST /api/admin/subscription-payments.
 *
 * El super admin registra MANUALMENTE un pago de suscripción de un doctor
 * (efectivo/transferencia directa): crea el pago como aprobado y extiende la
 * suscripción del doctor por los meses indicados. super_admin únicamente.
 */
import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import { backendPost } from '@/lib/api-client.server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<NextResponse> {
  const guard = await requireRole(['super_admin']);
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  const result = await backendPost('/api/admin/subscription-payments', body);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message, code: result.error.code },
      { status: result.error.status || 500 },
    );
  }

  return NextResponse.json({ success: true, data: result.value });
}
