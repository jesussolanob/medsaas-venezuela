/**
 * GET /api/admin/doctors/[id]/patients
 *
 * Lista los pacientes atendidos por un especialista con su identidad
 * (nombre completo, cédula) y resumen no médico (nº consultas, fecha
 * de la última). Sin datos médicos ni de contacto.
 *
 * ETAPA 1 — thin-proxy al backend NestJS
 *   `GET /api/admin/doctors/:doctorId/patients`
 *
 * RBAC (super_admin) lo enforce el backend.
 * Auditado por el backend en access_audit_log (fieldRevealed='admin_patient_identity').
 *
 * Response: {
 *   success: true,
 *   data: Array<{
 *     id:                string;
 *     fullName:          string;
 *     cedula:            string | null;
 *     consultationCount: number;
 *     lastAttendedAt:    string | null;  // ISO 8601
 *   }>
 * }
 *
 * Errores posibles del backend:
 *   - 404 DOCTOR_NOT_FOUND
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth-guards';
import { backendGet } from '@/lib/api-client.server';

interface DoctorPatientItem {
  id: string;
  fullName: string;
  cedula: string | null;
  consultationCount: number;
  lastAttendedAt: string | null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: 'id de especialista requerido' }, { status: 400 });
  }

  const result = await backendGet<DoctorPatientItem[]>(`/api/admin/doctors/${id}/patients`);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message, code: result.error.code },
      { status: result.error.status || 500 },
    );
  }

  return NextResponse.json({ success: true, data: result.value });
}
