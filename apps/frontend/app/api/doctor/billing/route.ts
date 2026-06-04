/**
 * /api/doctor/billing — documentos de facturación del doctor (billing_documents).
 *
 * ETAPA 1 — thin-proxy al módulo NestJS `billing` (billing-documents). doctorId se
 * deriva del dev-stub en el backend (anti-IDOR). El backend genera el número de
 * documento y persiste.
 *
 * La UI manda items como { id, description, qty, unit_price }; el backend espera
 * { description, quantity, unitPrice, total } → se transforma aquí (capa de datos).
 *
 * GAP backend: el response no expone patient_id (anti-PII). DEFERRED Fase 5: PDF, email.
 */
import { NextRequest, NextResponse } from 'next/server';
import { backendGet, backendPost } from '@/lib/api-client.server';

interface UiLineItem {
  id?: string;
  description: string;
  qty: number;
  unit_price: number;
}

interface BackendBillingDoc {
  id: string;
  docNumber: string;
  docType: string;
  total: number;
  [key: string]: unknown;
}

// GET /api/doctor/billing — list billing documents for the authenticated doctor
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const qs = new URLSearchParams();
  qs.set('limit', searchParams.get('limit') || '100');
  qs.set('page', searchParams.get('page') || '1');

  const result = await backendGet<BackendBillingDoc[]>(`/api/doctor/billing?${qs.toString()}`);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }

  const data = Array.isArray(result.value) ? result.value : [];
  return NextResponse.json({ data, total: data.length });
}

// POST /api/doctor/billing — create a billing document (receipt/estimate/invoice)
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { doc_type, total } = body ?? {};

  if (!doc_type || total === undefined || total === null) {
    return NextResponse.json({ error: 'doc_type y total requeridos' }, { status: 400 });
  }

  // Transform UI items → backend item shape.
  const items = Array.isArray(body.items)
    ? (body.items as UiLineItem[]).map((i) => ({
        description: i.description,
        quantity: Math.max(1, Math.round(Number(i.qty) || 1)),
        unitPrice: Number(i.unit_price) || 0,
        total: (Number(i.qty) || 0) * (Number(i.unit_price) || 0),
      }))
    : [];

  const result = await backendPost<BackendBillingDoc>('/api/doctor/billing', {
    doc_type,
    total,
    items,
    subtotal: body.subtotal ?? null,
    iva_amount: body.iva_amount ?? 0,
    igtf_amount: body.igtf_amount ?? 0,
    bcv_rate: body.bcv_rate ?? null,
    total_bs: body.total_bs ?? null,
    notes: body.notes ?? null,
    currency: body.currency || 'USD',
    consultation_id: body.consultation_id ?? null,
    payment_id: body.payment_id ?? null,
    patient_id: body.patient_id ?? null,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }

  return NextResponse.json({
    success: true,
    document: result.value,
    docNumber: result.value.docNumber,
  });
}
