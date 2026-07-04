import 'server-only';

/**
 * GET /api/doctor/patients
 *
 * Thin-proxy autenticado → NestJS GET /api/patients?page=&limit=
 *
 * Retorna la lista paginada de pacientes del médico autenticado.
 * Se usa en el modal de creación de solicitudes (NewRequestModal) para el selector
 * de pacientes, cargado desde un componente cliente.
 *
 * Query params opcionales:
 *   ?page=1&limit=200   (defecto: page=1, limit=200)
 *   ?search=<term>      (filtro por nombre, si el backend lo soporta)
 */

import { NextRequest, NextResponse } from 'next/server';
import { backendGet } from '@/lib/api-client.server';
import { log } from '@/lib/logger';

export const dynamic = 'force-dynamic';

interface BackendPatientListItem {
  id: string;
  doctorId: string;
  fullName: string;
  cedula: string | null;
  phone: string | null;
  email: string | null;
  source: string | null;
  createdAt: string;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const page = req.nextUrl.searchParams.get('page') ?? '1';
  const limit = req.nextUrl.searchParams.get('limit') ?? '200';
  const search = req.nextUrl.searchParams.get('search');

  const qs = new URLSearchParams({ page, limit });
  if (search) qs.set('search', search);

  const result = await backendGet<BackendPatientListItem[]>(`/api/patients?${qs.toString()}`);

  if (!result.ok) {
    log.error('[doctor/patients GET] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }

  const patients = Array.isArray(result.value) ? result.value : [];
  return NextResponse.json({
    success: true,
    data: {
      patients: patients.map((p) => ({
        id: p.id,
        fullName: p.fullName,
        cedula: p.cedula,
        phone: p.phone,
        email: p.email,
      })),
    },
  });
}
