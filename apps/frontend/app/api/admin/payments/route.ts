/**
 * GET /api/admin/payments
 * Lista de comprobantes de pago de suscripción.
 * Query: ?status=pending|approved|rejected (default: pending)
 *
 * ETAPA 1 — thin-proxy al módulo NestJS `billing` (subscription-payments).
 * RBAC (super_admin) lo enforce el backend vía el rol reenviado por el BFF.
 *
 * GAP backend (Fase 5/mejora): el backend no devuelve amount_bs/bcv_rate_used/
 * receipt_url/notes/rejection_reason ni el join de `profiles` → se rellenan null.
 */
import { NextRequest, NextResponse } from 'next/server';
import { backendGet } from '@/lib/api-client.server';

interface BackendPayment {
  id: string;
  doctorId: string;
  amountUsd: number;
  method: string;
  referenceNumber: string | null;
  durationMonths: number;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

function toPaymentRow(p: BackendPayment) {
  return {
    id: p.id,
    doctor_id: p.doctorId,
    amount_usd: p.amountUsd,
    amount_bs: null,
    bcv_rate_used: null,
    duration_months: p.durationMonths,
    method: p.method,
    reference_number: p.referenceNumber,
    receipt_url: null,
    status: p.status,
    notes: null,
    rejection_reason: null,
    created_at: p.createdAt,
    reviewed_at: p.reviewedAt,
    profiles: null,
  };
}

export async function GET(req: NextRequest) {
  const status = new URL(req.url).searchParams.get('status') || 'pending';

  const result = await backendGet<BackendPayment[]>(
    `/api/admin/subscription-payments?status=${encodeURIComponent(status)}&limit=100`,
  );

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }

  const payments = Array.isArray(result.value) ? result.value.map(toPaymentRow) : [];
  return NextResponse.json({ payments });
}
