/**
 * /api/doctor/subscription-payments
 *
 * GET  — historial de pagos del especialista.
 * POST — registrar un pago manual para revisión del super_admin.
 *
 * POST body:
 *   { planKey, period, bankCode, referenceNumber, receiptPath, notes? }
 *
 * IMPORTANT: amountBs and bcvRate are NOT sent by the client — the backend
 * derives them from the BCV rate table at submission time.
 */

import { NextRequest, NextResponse } from 'next/server';
import { backendGet, backendPost } from '@/lib/api-client.server';

// Shape returned by the backend for each payment record (toDoctorPaymentOutput).
// Note: backend sends bcvRateUsed (not bcvRate) and omits bankName.
interface BackendPayment {
  id: string;
  planKey: string;
  period: string;
  amountUsd: number;
  amountBs: number | null;
  bcvRateUsed: number | null;
  bankCode: string | null;
  referenceNumber: string | null;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
  hasReceipt: boolean;
}

function toPaymentRow(p: BackendPayment) {
  return {
    id: p.id,
    plan_key: p.planKey,
    period: p.period,
    amount_usd: p.amountUsd,
    amount_bs: p.amountBs,
    bcv_rate: p.bcvRateUsed,
    bank_code: p.bankCode,
    // backend does not return bank name in this endpoint
    bank_name: null as string | null,
    reference_number: p.referenceNumber,
    status: p.status,
    rejection_reason: p.rejectionReason,
    created_at: p.createdAt,
    reviewed_at: p.reviewedAt,
  };
}

export async function GET() {
  const result = await backendGet<BackendPayment[]>('/api/doctor/subscription-payments');
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }
  const payments = Array.isArray(result.value) ? result.value.map(toPaymentRow) : [];
  return NextResponse.json({ payments });
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  // Validate required fields
  const { planKey, period, bankCode, referenceNumber, receiptPath } = body ?? {};
  if (!planKey || !period || !bankCode || !referenceNumber || !receiptPath) {
    return NextResponse.json(
      {
        error:
          'Faltan campos obligatorios: planKey, period, bankCode, referenceNumber, receiptPath',
      },
      { status: 400 },
    );
  }

  // Build payload strictly — backend DTO is .strict() and notes is optional(string).
  // Sending notes: null (when absent) causes a Zod validation failure (422).
  const payload: Record<string, unknown> = {
    planKey,
    period,
    bankCode,
    referenceNumber,
    receiptPath,
  };
  if (typeof body.notes === 'string' && body.notes.trim().length > 0) {
    payload.notes = body.notes.trim();
  }

  const result = await backendPost<{
    id: string;
    status: string;
    amountUsd: number;
    amountBs: number;
    bcvRate: number;
  }>('/api/doctor/subscription-payments', payload);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }

  return NextResponse.json(result.value);
}
