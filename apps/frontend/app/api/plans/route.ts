import { NextResponse } from 'next/server';
import { backendGet } from '@/lib/api-client.server';

/**
 * GET /api/plans — lista los planes SaaS activos (plan_configs).
 *
 * ETAPA 1 — thin-proxy al módulo NestJS `admin` (`GET /api/admin/plans`) vía el BFF.
 * Sin Supabase. Único consumidor: `/admin/promotions` (super_admin), por lo que el
 * RBAC del backend aplica. Se mapea camelCase→snake_case para conservar el contrato
 * que espera la UI ({ plan_key, name, price, trial_days }).
 */
interface BackendPlan {
  planKey: string;
  name: string;
  priceUsd: number;
  trialDays: number;
  isActive: boolean;
}

export async function GET(): Promise<NextResponse> {
  const result = await backendGet<BackendPlan[]>('/api/admin/plans');

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }

  const plans = result.value
    .filter((p) => p.isActive)
    .map((p) => ({
      plan_key: p.planKey,
      name: p.name,
      price: p.priceUsd,
      trial_days: p.trialDays,
    }));

  return NextResponse.json(plans);
}
