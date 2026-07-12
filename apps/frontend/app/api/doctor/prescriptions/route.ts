import 'server-only';

/**
 * app/api/doctor/prescriptions/route.ts
 *
 * Thin-proxy autenticado → NestJS backend de prescriptions.
 *
 *   GET  /api/doctor/prescriptions?patientId=<uuid> → lista del paciente
 *   POST /api/doctor/prescriptions                  → emite una receta
 *
 * Reemplaza a las Server Actions de `actions-prescriptions.ts`: los IDs de
 * Server Action se rehashean en cada build, así que una pestaña abierta con el
 * build anterior lanza "Server Action not found" tras un deploy. Un route
 * handler tiene URL estable → sobrevive a los deploys. doctor_id se deriva del
 * header de identidad en el backend (anti-IDOR).
 */

import { NextRequest, NextResponse } from 'next/server';
import { backendGet, backendPost } from '@/lib/api-client.server';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';

interface BackendPrescription {
  id: string;
  doctor_id: string;
  patient_id: string;
  consultation_id: string | null;
  medication: string;
  dosage: string | null;
  frequency: string | null;
  duration: string | null;
  notes: string | null;
  presentation: string | null;
  issued_date: string;
  created_at: string;
  updated_at: string;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const patientId = req.nextUrl.searchParams.get('patientId');
  if (!patientId) {
    return NextResponse.json({ error: 'patientId es requerido' }, { status: 400 });
  }

  const result = await backendGet<BackendPrescription[]>(`/api/prescriptions/patient/${patientId}`);

  if (!result.ok) {
    log.error('[doctor/prescriptions GET] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }

  const items = Array.isArray(result.value) ? result.value : [];
  return NextResponse.json({ success: true, data: items });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });
  }

  const patientId = typeof body.patient_id === 'string' ? body.patient_id : '';
  const medication = typeof body.medication === 'string' ? body.medication : '';
  if (!patientId || !medication.trim()) {
    return NextResponse.json({ error: 'patient_id y medication son requeridos' }, { status: 400 });
  }

  const result = await backendPost<BackendPrescription>('/api/prescriptions', {
    patient_id: patientId,
    consultation_id: (body.consultation_id as string | null | undefined) ?? null,
    medication,
    dosage: (body.dosage as string | null | undefined) ?? null,
    frequency: (body.frequency as string | null | undefined) ?? null,
    duration: (body.duration as string | null | undefined) ?? null,
    notes: (body.notes as string | null | undefined) ?? null,
    presentation: (body.presentation as string | null | undefined) ?? null,
  });

  if (!result.ok) {
    log.error('[doctor/prescriptions POST] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }

  return NextResponse.json({ success: true, data: result.value });
}
