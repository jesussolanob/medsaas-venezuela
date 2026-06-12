/**
 * /api/admin/settings/rates — resumen de tasas del sistema (admin).
 *
 * ETAPA 1 — thin-proxy al módulo NestJS `finances` (`GET /api/admin/settings/rates`,
 * super_admin). Devuelve `{ source, manual, binance, bcv, effective }`. Sin Supabase.
 */
import { NextResponse } from 'next/server';
import { backendGet } from '@/lib/api-client.server';

export async function GET() {
  const result = await backendGet<unknown>('/api/admin/settings/rates');
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }
  return NextResponse.json(result.value);
}
