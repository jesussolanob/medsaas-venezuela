/**
 * /api/doctor/consultation-blocks — configuración de bloques de consulta del doctor.
 *
 * ETAPA 1 — thin-proxy al módulo NestJS `consultation-blocks`. doctorId se deriva del
 * dev-stub en el backend (anti-IDOR). El GET devuelve { catalog, doctor_config, resolved,
 * specialty_defaults, doctor_specialty }; el PUT reemplaza toda la config (transaccional).
 *
 * NOTA Etapa 1: el legacy permitía a super_admin operar sobre otro doctor_id; el backend
 * lo restringe al propio doctor (user.sub). El super_admin pathway es Etapa 2.
 */
import { NextRequest, NextResponse } from 'next/server';
import { backendGet, backendPut } from '@/lib/api-client.server';

interface BlocksResponse {
  catalog: unknown[];
  doctor_config: unknown[];
  resolved: unknown[];
  specialty_defaults: unknown[];
  doctor_specialty: string | null;
  /** WP-E: preferred block layout. Backend may not have this field yet — defaults to 'tabs'. */
  layout?: 'tabs' | 'vertical';
}

export async function GET() {
  const result = await backendGet<BlocksResponse>('/api/doctor/consultation-blocks');
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }
  return NextResponse.json(result.value);
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  // WP-E: forward optional `layout` field alongside blocks
  const payload: Record<string, unknown> = { blocks: body?.blocks };
  if (body?.layout === 'tabs' || body?.layout === 'vertical') {
    payload.layout = body.layout;
  }
  const result = await backendPut<{ success: true; blocks_saved: number }>(
    '/api/doctor/consultation-blocks',
    payload,
  );
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }
  return NextResponse.json(result.value);
}
