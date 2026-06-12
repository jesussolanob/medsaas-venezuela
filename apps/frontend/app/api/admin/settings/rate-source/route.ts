/**
 * /api/admin/settings/rate-source — elige la fuente activa de la tasa del sistema (admin).
 *
 * ETAPA 1 — thin-proxy al módulo NestJS `finances` (`POST /api/admin/settings/rate-source`,
 * super_admin). Body `{ source: 'binance'|'bcv'|'manual', value?: number }`. Sin Supabase.
 */
import { NextRequest, NextResponse } from 'next/server';
import { backendPost } from '@/lib/api-client.server';

export async function POST(req: NextRequest) {
  const body: unknown = await req.json();
  const result = await backendPost<unknown>('/api/admin/settings/rate-source', body);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }
  return NextResponse.json(result.value);
}
