/**
 * GET /api/admin/seller-commissions/payments/[sellerId]/receipt-url
 *
 * ⚠️ NOTA DE NOMENCLATURA: el segmento dinámico se llama `sellerId` porque
 * comparte el directorio `[sellerId]` con la ruta de historial de pagos del
 * vendedor (`route.ts` hermano). En este handler, el valor del segmento es
 * el ID de un pago específico (seller_payments.id), NO el ID del vendedor.
 * Se lo renombra `paymentId` en el código para dejar claro el significado.
 *
 * Thin-proxy → NestJS GET /api/admin/seller-commissions/payments/:paymentId/receipt-url
 * RBAC (super_admin) lo aplica el backend.
 *
 * Devuelve una URL firmada de corta vida (≈1 hora) para el comprobante del
 * pago. La URL NO se guarda ni se embebe: se pide a demanda cada vez que el
 * admin quiere ver el archivo. Seguimos el mismo patrón que
 * `app/api/admin/subscription-payments/[id]/receipt-url/route.ts`.
 *
 * Respuesta: { url: string }
 */
import { NextRequest, NextResponse } from 'next/server';
import { backendGet } from '@/lib/api-client.server';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sellerId: string }> },
): Promise<NextResponse> {
  // The segment holds the paymentId despite being named `sellerId` in the path.
  const { sellerId: paymentId } = await params;

  if (!paymentId) {
    return NextResponse.json({ error: 'ID de pago requerido' }, { status: 400 });
  }

  // El backend devuelve { url } — verificado contra el controller. NO es `signedUrl`:
  // anotar mal este genérico no da error de tipos y el botón queda mudo con undefined.
  const result = await backendGet<{ url: string }>(
    `/api/admin/seller-commissions/payments/${encodeURIComponent(paymentId)}/receipt-url`,
  );

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message, code: result.error.code },
      { status: result.error.status || 500 },
    );
  }

  return NextResponse.json({ url: result.value.url });
}
