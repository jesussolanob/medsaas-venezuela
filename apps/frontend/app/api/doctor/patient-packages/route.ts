import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import { backendGet, backendPost } from '@/lib/api-client.server';
import type { AppError } from '@/lib/api-client.server';

// GET /api/doctor/patient-packages?patient_id=<uuid>
// Proxied to NestJS GET /api/packages/patient/:patientId (doctor-scoped)
// NOTE: super_admin and patient flows are FASE 5/6: pendiente backend — the
// NestJS PackagesController currently only implements doctor-scoped package access.
export async function GET(req: NextRequest) {
  const guard = await requireRole(['super_admin', 'doctor', 'patient']);
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(req.url);
  const patientId = searchParams.get('patient_id');

  if (guard.profile.role === 'doctor') {
    if (!patientId) {
      return NextResponse.json({ error: 'patient_id requerido para médicos' }, { status: 400 });
    }
    const result = await backendGet<unknown[]>(`/api/packages/patient/${patientId}`);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error.message },
        { status: result.error.status || 500 },
      );
    }
    return NextResponse.json({ data: result.value });
  }

  // FASE 5/6: el listado de paquetes para super_admin/patient está pendiente de
  // backend (NestJS PackagesController solo soporta acceso doctor-scoped). Sin
  // Supabase: se devuelve vacío hasta que exista el endpoint.
  return NextResponse.json({ data: [] });
}

// POST /api/doctor/patient-packages — asigna paquete a un paciente
// Proxied to NestJS POST /api/packages
export async function POST(req: NextRequest) {
  const guard = await requireRole(['super_admin', 'doctor']);
  if (!guard.ok) return guard.response;

  const body = await req.json();
  const { patient_id, package_template_id, payment_method, payment_reference } = body;

  if (!patient_id || !package_template_id) {
    return NextResponse.json(
      { error: 'patient_id y package_template_id son requeridos' },
      { status: 400 },
    );
  }

  const result = await backendPost<unknown>('/api/packages', {
    patientId: patient_id,
    packageTemplateId: package_template_id,
    paymentMethod: payment_method ?? null,
    paymentReference: payment_reference ?? null,
  });

  if (!result.ok) {
    const err = result.error as AppError;
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }

  return NextResponse.json({ success: true, data: result.value });
}
