/**
 * POST /api/admin/seller-commissions/payments
 *
 * Thin-proxy al backend NestJS `POST /api/admin/seller-commissions/payments`.
 * RBAC (super_admin) lo aplica el backend.
 *
 * Registra un pago de comisiones. El monto lo calcula el servidor releyendo las
 * comisiones dentro de una transacción con lock — NUNCA se envía desde el cliente.
 * Si el cliente mandara un monto, el backend lo ignoraría; no hay campo para eso.
 *
 * Body esperado:
 *   { seller_id, commission_ids[], method, reference, receipt_url?, notes? }
 *
 * Respuesta:
 *   { success: true, data: { id, sellerId, amountUsd, method, reference,
 *                             receiptUrl, notes, paidAt, createdBy, createdAt } }
 */
import { NextRequest, NextResponse } from 'next/server';
import { backendPost } from '@/lib/api-client.server';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';

interface PaymentRequestBody {
  seller_id: string;
  commission_ids: string[];
  method: string;
  reference: string;
  receipt_url?: string | null;
  notes?: string | null;
}

export interface SellerPaymentResult {
  id: string;
  sellerId: string;
  amountUsd: number;
  method: string;
  reference: string;
  receiptUrl: string | null;
  notes: string | null;
  paidAt: string;
  createdBy: string;
  createdAt: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: PaymentRequestBody;
  try {
    body = (await req.json()) as PaymentRequestBody;
  } catch {
    return NextResponse.json(
      { error: 'Cuerpo de la solicitud inválido', code: 'BAD_REQUEST' },
      { status: 400 },
    );
  }

  if (!body.seller_id?.trim()) {
    return NextResponse.json(
      { error: 'seller_id es requerido', code: 'BAD_REQUEST' },
      { status: 400 },
    );
  }
  if (!Array.isArray(body.commission_ids) || body.commission_ids.length === 0) {
    return NextResponse.json(
      { error: 'Seleccioná al menos una comisión para pagar.', code: 'BAD_REQUEST' },
      { status: 400 },
    );
  }
  if (!body.method?.trim()) {
    return NextResponse.json(
      { error: 'El método de pago es requerido', code: 'BAD_REQUEST' },
      { status: 400 },
    );
  }
  if (!body.reference?.trim()) {
    return NextResponse.json(
      { error: 'La referencia es requerida', code: 'BAD_REQUEST' },
      { status: 400 },
    );
  }

  // ⚠️ El monto NO va al backend — lo calcula el servidor.
  const backendBody: Record<string, unknown> = {
    seller_id: body.seller_id,
    commission_ids: body.commission_ids,
    method: body.method.trim(),
    reference: body.reference.trim(),
  };
  if (body.receipt_url != null) backendBody.receipt_url = body.receipt_url;
  if (body.notes != null) backendBody.notes = body.notes;

  const result = await backendPost<SellerPaymentResult>(
    '/api/admin/seller-commissions/payments',
    backendBody,
  );

  if (!result.ok) {
    log.error('[admin/seller-commissions/payments POST] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return NextResponse.json(
      { error: result.error.message, code: result.error.code },
      { status: result.error.status ?? 502 },
    );
  }

  return NextResponse.json({ success: true, data: result.value });
}
