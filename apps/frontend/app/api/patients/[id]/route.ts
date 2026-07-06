import 'server-only';

/**
 * app/api/patients/[id]/route.ts
 *
 * Thin-proxy → NestJS patients module.
 *
 * GET /api/patients/:id — detalle completo del paciente (PII en claro,
 * ownership del doctor validado en el backend; inserta access_audit_log).
 *
 * Faltaba este handler: los flujos client-side que cargan un paciente por id
 * (p.ej. NewAppointmentFlow con initialContext.patientId al abrir "Crear
 * consulta" desde la ficha o el pop-up post-alta) hacían fetch a esta ruta y
 * recibían el 404 de Next.js, dejando el wizard atascado en el paso 1.
 */

import { NextRequest, NextResponse } from 'next/server';
import { backendFetch } from '@/lib/api-client.server';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  const result = await backendFetch(`/api/patients/${encodeURIComponent(id)}`, { method: 'GET' });
  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: result.error },
      { status: result.error.status || 500 },
    );
  }
  return NextResponse.json({ success: true, data: result.value });
}
