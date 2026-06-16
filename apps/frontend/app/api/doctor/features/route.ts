/**
 * /api/doctor/features — proxy para obtener las features del plan activo del doctor.
 *
 * GET → `GET /api/doctor/features` (backend NestJS)
 * Devuelve: { plan_key, effective_plan_key, is_downgraded, features: { [key]: boolean } }
 */
import { NextResponse } from 'next/server';
import { backendGet } from '@/lib/api-client.server';
import { requireRole } from '@/lib/auth-guards';

interface DoctorFeaturesResponse {
  plan_key: string;
  effective_plan_key: string;
  is_downgraded: boolean;
  features: Record<string, boolean>;
}

export async function GET() {
  // super_admin incluido para que hasPlanFeature* funcione correctamente cuando
  // un super_admin invoca endpoints que llaman a este BFF (ej: transcribe/route.ts).
  const guard = await requireRole(['doctor', 'assistant', 'super_admin']);
  if (!guard.ok) return guard.response;

  const result = await backendGet<DoctorFeaturesResponse>('/api/doctor/features');
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }
  return NextResponse.json({ success: true, data: result.value });
}
