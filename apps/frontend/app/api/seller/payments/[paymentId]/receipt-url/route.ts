/**
 * GET /api/seller/payments/[paymentId]/receipt-url
 *
 * Thin-proxy → NestJS `GET /api/seller/payments/:paymentId/receipt-url`.
 *
 * POR QUÉ EXISTE
 * --------------
 * `seller_payments.receipt_url` guarda el **path** del objeto en GCS, no una URL.
 * Los comprobantes son privados: la URL se firma y vence a los 15 minutos, así que
 * enlazar el valor guardado directamente daba un 404. Se pide la firma a demanda,
 * recién cuando el vendedor va a abrir el archivo.
 *
 * SEGURIDAD: el backend saca el `sellerId` del token y devuelve el MISMO 404 si el
 * pago no existe o es de otro vendedor — distinguirlos dejaría enumerar pagos ajenos.
 *
 * Respuesta: { url: string }
 */
import { NextRequest, NextResponse } from 'next/server';
import { backendGet } from '@/lib/api-client.server';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ paymentId: string }> },
): Promise<NextResponse> {
  const { paymentId } = await params;

  if (!paymentId) {
    return NextResponse.json({ error: 'Falta el identificador del pago' }, { status: 400 });
  }

  // El backend devuelve { url } — verificado contra el controller.
  const result = await backendGet<{ url: string }>(
    `/api/seller/payments/${encodeURIComponent(paymentId)}/receipt-url`,
  );

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message, code: result.error.code },
      { status: result.error.status || 500 },
    );
  }

  return NextResponse.json({ url: result.value.url });
}
