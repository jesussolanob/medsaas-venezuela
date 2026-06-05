import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/admin/send-invoice — envía la factura por email al médico.
 *
 * ETAPA 1: DESHABILITADO. El envío de email es un bloqueante (proveedor sin
 * definir; ver Fase 6 — integraciones). Supabase fue eliminado de este handler.
 * Cuando se defina el proveedor de email, este handler hará thin-proxy al backend
 * billing (marcar factura como `sent`) + disparará el envío.
 */
export function POST(_req: NextRequest): NextResponse {
  return NextResponse.json(
    {
      error: 'El envío de facturas por email estará disponible en una próxima versión.',
      code: 'NOT_IMPLEMENTED',
    },
    { status: 501 },
  );
}
