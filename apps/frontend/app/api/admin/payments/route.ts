/**
 * GET /api/admin/payments
 * Lista de comprobantes de pago de suscripción.
 * Query: ?status=pending|approved|rejected (default: pending)
 *
 * ETAPA 1 — thin-proxy al módulo NestJS `billing` (subscription-payments).
 * RBAC (super_admin) enforced both here and in the backend.
 *
 * Known backend gaps (report to lead — do NOT fix here):
 *   - `profiles` join (doctor name/email) not returned — always null.
 *   - `notes` field not returned by toOutput() — always null.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import { backendGet } from '@/lib/api-client.server';

interface BackendPayment {
  id: string;
  doctorId: string;
  amountUsd: number;
  amountBs: number | null;
  bcvRateUsed: number | null;
  bankCode: string | null;
  planKey: string | null;
  period: string | null;
  method: string;
  referenceNumber: string | null;
  durationMonths: number;
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason: string | null;
  hasReceipt: boolean;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

function toPaymentRow(p: BackendPayment) {
  return {
    id: p.id,
    doctor_id: p.doctorId,
    amount_usd: p.amountUsd,
    amount_bs: p.amountBs ?? null,
    bcv_rate_used: p.bcvRateUsed ?? null,
    // bcv_rate alias for UI compatibility
    bcv_rate: p.bcvRateUsed ?? null,
    duration_months: p.durationMonths,
    period: p.period ?? null,
    method: p.method,
    bank_code: p.bankCode ?? null,
    // backend does not return bank name — UI falls back to method display
    bank_name: null as string | null,
    reference_number: p.referenceNumber,
    // Use hasReceipt flag to drive button visibility; actual URL fetched on-demand.
    receipt_path: p.hasReceipt ? 'pending_receipt' : null,
    receipt_url: null as string | null,
    status: p.status,
    // notes not returned by backend toOutput() — backend gap
    notes: null as string | null,
    rejection_reason: p.rejectionReason ?? null,
    created_at: p.createdAt,
    reviewed_at: p.reviewedAt,
    // profiles join not returned by backend — backend gap
    profiles: null as { full_name: string; email: string; specialty: string | null } | null,
  };
}

export async function GET(req: NextRequest) {
  const guard = await requireRole(['super_admin']);
  if (!guard.ok) return guard.response;

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
