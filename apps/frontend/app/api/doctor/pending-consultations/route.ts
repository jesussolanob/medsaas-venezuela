import 'server-only';

/**
 * app/api/doctor/pending-consultations/route.ts
 *
 * GET  — thin-proxy to GET /api/doctor/pending-consultations
 *        Optional ?status=pending_scheduling|scheduled|completed|expired|cancelled
 *        Enriches the response with patient full_name (masked, from /api/patients/:id).
 *
 * POST — thin-proxy to POST /api/doctor/pending-consultations (bulk-create)
 *        Body: { patient_id, plan_id, session_numbers[], payment_id?, office_id?, appointment_mode? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { backendGet, backendPost } from '@/lib/api-client.server';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BackendPendingConsultation {
  id: string;
  doctor_id: string;
  patient_id: string;
  package_id: string | null;
  plan_name: string;
  office_id: string | null;
  appointment_mode: string | null;
  session_number: number;
  status: string;
  expires_at: string | null;
  scheduled_appointment_id: string | null;
  consultation_id: string | null;
  reminder_stage: number;
  created_at: string;
  updated_at: string;
}

interface BackendPatientBasic {
  id: string;
  fullName: string;
}

// ---------------------------------------------------------------------------
// GET — list pending consultations (enriched with patient name)
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest): Promise<NextResponse> {
  const status = req.nextUrl.searchParams.get('status');
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';

  const result = await backendGet<BackendPendingConsultation[]>(
    `/api/doctor/pending-consultations${qs}`,
  );

  if (!result.ok) {
    log.error('[pending-consultations GET] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return NextResponse.json(
      { error: result.error.message, code: result.error.code },
      { status: result.error.status ?? 502 },
    );
  }

  const items = Array.isArray(result.value) ? result.value : [];

  // Enrich with patient full_name: deduplicate patient_ids then batch-fetch.
  // We use the /api/patients list with a high limit; masked names come from the backend.
  const patientIds = [...new Set(items.map((i) => i.patient_id))];
  const patientNames: Record<string, string> = {};

  if (patientIds.length > 0) {
    try {
      const patientsResult = await backendGet<BackendPatientBasic[]>(
        `/api/patients?page=1&limit=200`,
      );
      if (patientsResult.ok && Array.isArray(patientsResult.value)) {
        for (const p of patientsResult.value) {
          patientNames[p.id] = p.fullName ?? 'Paciente';
        }
      }
    } catch {
      // Non-blocking: display will fall back to 'Paciente'
    }
  }

  const enriched = items.map((item) => ({
    ...item,
    patient_name: patientNames[item.patient_id] ?? 'Paciente',
  }));

  return NextResponse.json({ success: true, data: enriched });
}

// ---------------------------------------------------------------------------
// POST — bulk-create pending consultations (deferred sessions)
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo de solicitud inválido' }, { status: 400 });
  }

  const result = await backendPost<BackendPendingConsultation[]>(
    '/api/doctor/pending-consultations',
    body,
  );

  if (!result.ok) {
    log.error('[pending-consultations POST] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return NextResponse.json(
      { error: result.error.message, code: result.error.code },
      { status: result.error.status ?? 502 },
    );
  }

  return NextResponse.json({ success: true, data: result.value }, { status: 201 });
}
