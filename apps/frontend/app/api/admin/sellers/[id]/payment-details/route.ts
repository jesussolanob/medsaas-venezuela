/**
 * GET /api/admin/sellers/[id]/payment-details
 *
 * Devuelve la configuración de cobro de un vendedor (SOLO super_admin).
 * El admin necesita estos datos para saber cómo transferirle la comisión.
 *
 * Thin-proxy a GET /api/admin/sellers/:id/payment-details del backend NestJS.
 *
 * Respuesta del backend: { success: true, data: { paymentDetails: Record<string, unknown> } }
 * OJO: la clave es `paymentDetails` en camelCase — verificado en sellers.controller.ts
 * (toPaymentDetailsDto). NO es `payment_details` en snake_case.
 *
 * SEGURIDAD: son datos bancarios. NUNCA loguear el body de la respuesta.
 *
 * Molde: app/api/admin/doctors/[id]/access/route.ts
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth-guards';
import { backendGet } from '@/lib/api-client.server';
import type { PaymentDetails } from '@/lib/payment-details';

interface SellerPaymentDetailsData {
  paymentDetails: PaymentDetails;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;

  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'ID de vendedor inválido' }, { status: 400 });
  }

  const result = await backendGet<SellerPaymentDetailsData>(
    `/api/admin/sellers/${id}/payment-details`,
  );

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message, code: result.error.code },
      { status: result.error.status || 500 },
    );
  }

  return NextResponse.json({ success: true, data: result.value });
}
