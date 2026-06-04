/**
 * /api/admin/subscription-stats — datos del gráfico de crecimiento de médicos (admin).
 *
 * ETAPA 1 — thin-proxy al módulo NestJS `admin` (`GET /api/admin/subscriptions/growth`,
 * super_admin). Devuelve `{ chartData:[{month,count}], momGrowth, newThisMonth }`, el shape
 * que consume `AdminSubscriptionChart`. Sin Supabase.
 */
import { NextResponse } from 'next/server';
import { backendGet } from '@/lib/api-client.server';

export async function GET() {
  const result = await backendGet<unknown>('/api/admin/subscriptions/growth');
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }
  return NextResponse.json(result.value);
}
