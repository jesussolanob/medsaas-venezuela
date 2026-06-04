/**
 * /api/doctor/payments — pagos de consulta (consultation_payments).
 *
 * ETAPA 1 — thin-proxy al módulo NestJS `payments`. doctorId se deriva del dev-stub
 * en el backend (anti-IDOR); el backend verifica ownership de la consulta y sincroniza
 * consultations.payment_status en transacción.
 *
 * Backend:
 *   GET    /api/doctor/payments?consultation_id=&status=&limit=&offset=
 *   POST   /api/doctor/payments
 *   PUT    /api/doctor/payments/:id/approve | :id/reject
 *
 * GAP backend (Fase 5/mejora): la lista NO joinea patients (PII) → consumidores que
 * necesiten patient_name deben resolverlo aparte. DEFERRED Fase 5: receipt_url (storage→GCS).
 */
import { NextRequest, NextResponse } from 'next/server';
import { backendGet, backendPost, backendPut } from '@/lib/api-client.server';

interface PaymentDto {
  id: string;
  consultation_id: string;
  doctor_id: string;
  patient_id: string;
  amount: number;
  currency: string;
  payment_method: string;
  reference_number: string | null;
  receipt_url: string | null;
  notes: string | null;
  status: string;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
}

// GET — list consultation payments for the authenticated doctor
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const qs = new URLSearchParams();
  const consultationId = searchParams.get('consultation_id');
  const status = searchParams.get('status');
  if (consultationId) qs.set('consultation_id', consultationId);
  if (status) qs.set('status', status);
  qs.set('limit', searchParams.get('limit') || '50');
  qs.set('offset', searchParams.get('offset') || '0');

  const result = await backendGet<PaymentDto[]>(`/api/doctor/payments?${qs.toString()}`);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }

  const data = Array.isArray(result.value) ? result.value : [];
  return NextResponse.json({ data, total: data.length });
}

// POST — register a payment for a consultation
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { consultation_id, patient_id, amount, payment_method } = body ?? {};

  if (!consultation_id || !patient_id || !amount || !payment_method) {
    return NextResponse.json(
      { error: 'Campos requeridos: consultation_id, patient_id, amount, payment_method' },
      { status: 400 },
    );
  }

  const result = await backendPost<PaymentDto>('/api/doctor/payments', {
    consultation_id,
    patient_id,
    amount,
    currency: body.currency || 'USD',
    payment_method,
    reference_number: body.reference_number || null,
    receipt_url: body.receipt_url || null,
    notes: body.notes || null,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }

  return NextResponse.json({ success: true, payment: result.value });
}

// PATCH — approve / reject a payment (action: 'approve' | 'reject')
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, action, notes } = body ?? {};

  if (!id || !action) {
    return NextResponse.json({ error: 'id y action requeridos' }, { status: 400 });
  }

  const result =
    action === 'approve'
      ? await backendPut<PaymentDto>(`/api/doctor/payments/${id}/approve`, {})
      : await backendPut<PaymentDto>(`/api/doctor/payments/${id}/reject`, { notes: notes || null });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }

  return NextResponse.json({ success: true, payment: result.value });
}
