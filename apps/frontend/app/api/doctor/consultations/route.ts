import 'server-only';

/**
 * app/api/doctor/consultations/route.ts
 *
 * Thin-proxy → NestJS /api/consultations (GET, POST, PATCH → PUT).
 *
 * MIGRATED — Etapa 1:
 *   GET    → GET  /api/consultations?page=&limit=&payment_status=
 *   POST   → POST /api/consultations
 *   PATCH  → PUT  /api/consultations/:id  (body must include { id })
 *
 * DEFERRED — Etapa 2 (DELETE stub 501):
 *   The DELETE handler cascades into: EHR records, prescriptions, the linked
 *   appointment, package session restore, and Google Calendar event deletion.
 *   There is no single backend endpoint that handles this full cascade in Etapa 1.
 *
 * DEFERRED — Fase 5 (complex logic not in backend Etapa 1):
 *   - BCV rate fetch on POST (bcv_rate, amount_bs fields)
 *   - auto-create appointment when none provided on POST
 *   - payments table INSERT + triple-link on POST
 *   - report_data rebuild on PATCH (blocks_data snapshot)
 *   - duration_minutes auto-calc on PATCH (ended_at + started_at)
 *   - payments table sync on payment_status change (PATCH)
 *
 *   These business rules are owned by the NestJS use cases and will be completed
 *   as those use cases mature. The frontend route proxies the request; the UI
 *   receives whatever the backend returns.
 */

import { NextRequest, NextResponse } from 'next/server';
import { backendGet, backendPost, backendPut } from '@/lib/api-client.server';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const PAGE_SIZE_DEFAULT = 50;

// ---------------------------------------------------------------------------
// GET /api/doctor/consultations
//   ?patient_id=  → /api/consultations/patient/:id  (patient-specific history)
//   ?status=      → /api/consultations?payment_status=  (list with filter)
//   ?limit=&offset= supported (translated to page/limit)
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const patientId = searchParams.get('patient_id');
  const status = searchParams.get('status');
  const limit = Math.min(100, parseInt(searchParams.get('limit') ?? String(PAGE_SIZE_DEFAULT), 10));
  const offset = parseInt(searchParams.get('offset') ?? '0', 10);
  const page = Math.max(1, Math.floor(offset / limit) + 1);

  let path: string;
  if (patientId) {
    // Patient-scoped history endpoint
    path = `/api/consultations/patient/${patientId}?page=${page}&limit=${limit}`;
  } else {
    // Doctor-wide list with optional payment_status filter
    const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (status) qs.set('payment_status', status);
    path = `/api/consultations?${qs.toString()}`;
  }

  const result = await backendGet<unknown[]>(path);

  if (!result.ok) {
    log.error('[consultations GET] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }

  const data = Array.isArray(result.value) ? result.value : [];
  return NextResponse.json({ data, total: data.length });
}

// ---------------------------------------------------------------------------
// POST /api/doctor/consultations
// Maps to POST /api/consultations
// Fields forwarded: patient_id, appointment_id, consultation_date,
//   chief_complaint, notes
// Fields NOT forwarded (no backend equivalent in Etapa 1):
//   amount, currency, plan_name, payment_method, payment_receipt_url,
//   bcv_rate, amount_bs, payment_reference
//   → Backend will handle financial fields in a later use case.
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  const { patient_id, appointment_id, chief_complaint, notes, consultation_date } = body as Record<
    string,
    unknown
  >;

  if (!patient_id) {
    return NextResponse.json({ error: 'patient_id requerido' }, { status: 400 });
  }

  const backendBody: Record<string, unknown> = {
    patient_id,
    consultation_date: consultation_date ?? new Date().toISOString(),
    chief_complaint: chief_complaint ?? null,
    notes: notes ?? null,
  };
  if (appointment_id) backendBody.appointment_id = appointment_id;

  const result = await backendPost<{
    id: string;
    consultation_code: string;
    appointment_id: string | null;
  }>('/api/consultations', backendBody);

  if (!result.ok) {
    log.error('[consultations POST] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    if (result.error.status === 409) {
      return NextResponse.json(
        {
          error: 'Ya tienes otra cita activa en ese horario. Elige otra hora.',
          code: 'slot_taken',
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }

  const consultation = result.value;
  return NextResponse.json({
    success: true,
    consultation,
    code: consultation.consultation_code,
    appointmentId: consultation.appointment_id,
    paymentId: null, // Not available in Etapa 1
  });
}

// ---------------------------------------------------------------------------
// PATCH /api/doctor/consultations
// Legacy body shape: { id, ...fields }
// Maps to PUT /api/consultations/:id
// ---------------------------------------------------------------------------

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  const { id, ...fields } = body as { id?: string; [key: string]: unknown };

  if (!id) {
    return NextResponse.json({ error: 'id requerido' }, { status: 400 });
  }

  // Forward only the clinical fields the backend PUT endpoint accepts.
  // Financial fields (amount, currency, payment_method, etc.) and
  // integration fields (blocks_data, blocks_snapshot, report_data) are
  // deferred to Fase 5 when those use cases are implemented in the backend.
  const ALLOWED_PUT_FIELDS = new Set([
    'chief_complaint',
    'notes',
    'diagnosis',
    'treatment',
    'payment_status',
    'consultation_date',
  ]);

  const putBody: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (ALLOWED_PUT_FIELDS.has(k)) putBody[k] = v;
  }

  if (Object.keys(putBody).length === 0) {
    return NextResponse.json({ error: 'Ningún campo permitido en el body' }, { status: 400 });
  }

  const result = await backendPut<Record<string, unknown>>(`/api/consultations/${id}`, putBody);

  if (!result.ok) {
    log.error('[consultations PATCH] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }

  return NextResponse.json({ success: true, consultation: result.value });
}

// ---------------------------------------------------------------------------
// DELETE /api/doctor/consultations?id=xxx
//
// ETAPA 2 — NOT IMPLEMENTED. Stub returns 501 until the NestJS backend
// provides a coordinating endpoint for cascade delete:
//   - EHR records + prescriptions cascade
//   - Package session restore (restore_package_session RPC)
//   - Google Calendar event deletion
// ---------------------------------------------------------------------------

export async function DELETE(_req: NextRequest): Promise<NextResponse> {
  return NextResponse.json(
    {
      error: 'Eliminación de consultas disponible próximamente',
      code: 'NOT_IMPLEMENTED',
    },
    { status: 501 },
  );
}
