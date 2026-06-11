/**
 * POST /api/doctor/registration — thin-proxy al módulo NestJS DoctorRegistration.
 *
 * Forwards the request from the BFF to the NestJS backend with dev-auth headers.
 * Auth: role=doctor (the backend's RolesGuard enforces this).
 *
 * Request body:
 *   { full_name: string, cedula: string, mpps_number?: string, colegiado_number?: string }
 *
 * Success response (from backend):
 *   { success: true, data: { doctorId, verificationStatus } }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guards';
import { backendPost } from '@/lib/api-client.server';

interface RegistrationBody {
  full_name: string;
  cedula: string;
  mpps_number?: string | null;
  colegiado_number?: string | null;
}

interface BackendRegistrationResponse {
  doctorId: string;
  verificationStatus: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const guard = await requireRole(['doctor']);
  if (!guard.ok) return guard.response;

  let body: RegistrationBody;
  try {
    body = (await req.json()) as RegistrationBody;
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la solicitud inválido' }, { status: 400 });
  }

  if (!body.full_name?.trim() || !body.cedula?.trim()) {
    return NextResponse.json(
      { error: 'El nombre completo y la cédula son obligatorios' },
      { status: 400 },
    );
  }

  const result = await backendPost<BackendRegistrationResponse>('/api/doctor/registration', body);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }

  return NextResponse.json({ success: true, data: result.value });
}
