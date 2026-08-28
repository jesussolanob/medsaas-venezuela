/**
 * /api/seller/payment-details — thin-proxy a los datos de cobro del vendedor.
 *
 * GET  → devuelve el JSONB paymentDetails del perfil del vendedor.
 * PUT  → reemplaza el JSONB completo con el cuerpo enviado.
 *
 * Los datos bancarios (pago móvil, transferencia, Zelle, etc.) son información
 * financiera sensible. NUNCA se loguean, ni acá ni en el cliente que invoca esta ruta.
 *
 * El backend que resuelve la identidad del vendedor usa la sesión activa,
 * nunca un ID explícito pasado desde el cliente — anti-IDOR garantizado en el backend.
 */
import { NextRequest, NextResponse } from 'next/server';
import { backendGet, backendPut } from '@/lib/api-client.server';

export const dynamic = 'force-dynamic';

/** Shape que devuelve el backend (camelCase). */
interface PaymentDetailsResponse {
  paymentDetails: Record<string, unknown> | null;
}

export async function GET(): Promise<NextResponse> {
  const result = await backendGet<PaymentDetailsResponse>('/api/seller/payment-details');

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message, code: result.error.code },
      { status: result.error.status ?? 502 },
    );
  }

  return NextResponse.json({ success: true, data: result.value });
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Cuerpo de solicitud inválido', code: 'INVALID_JSON' },
      { status: 400 },
    );
  }

  const payload = body as { paymentDetails?: Record<string, unknown> };

  const result = await backendPut<PaymentDetailsResponse>('/api/seller/payment-details', {
    paymentDetails: payload.paymentDetails ?? {},
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message, code: result.error.code },
      { status: result.error.status ?? 502 },
    );
  }

  return NextResponse.json({ success: true, data: result.value });
}
