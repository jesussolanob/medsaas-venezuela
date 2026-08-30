/**
 * /api/seller/payments — thin-proxy al módulo `seller-commissions` del backend.
 *
 * GET → historial de pagos del vendedor autenticado, con la URL del comprobante.
 *
 * El `sellerId` lo saca el backend de la sesión — nunca se manda desde acá.
 */
import { NextResponse } from 'next/server';
import { backendGet } from '@/lib/api-client.server';

export const dynamic = 'force-dynamic';

/** Shape de cada pago tal como la serializa el controller (camelCase). */
export interface SellerPaymentDto {
  id: string;
  sellerId: string;
  /** Suma de las comisiones liquidadas en este pago. Calculado en el servidor. */
  amountUsd: number;
  /**
   * Tasa BCV (Bs por USD) vigente al momento de registrar el pago.
   * null → tasa no estaba disponible cuando se hizo el pago o el pago es anterior
   * a este campo. Mostrar solo USD cuando es null.
   */
  bcvRate: number | null;
  /** Método de pago (ej. "Zelle", "Transferencia"). */
  method: string;
  /** Referencia de la transacción. */
  reference: string;
  /** URL al comprobante subido por el admin. null si no hay comprobante. */
  receiptUrl: string | null;
  notes: string | null;
  /** ISO 8601. Fecha en que se registró el pago. */
  paidAt: string;
  /** UUID del admin que registró el pago. */
  createdBy: string;
  createdAt: string;
}

export async function GET(): Promise<NextResponse> {
  const result = await backendGet<SellerPaymentDto[]>('/api/seller/payments');

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message, code: result.error.code },
      { status: result.error.status ?? 502 },
    );
  }

  return NextResponse.json({ success: true, data: result.value ?? [] });
}
