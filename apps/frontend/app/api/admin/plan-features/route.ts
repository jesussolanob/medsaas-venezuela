/**
 * /api/admin/plan-features — features por plan (admin).
 *
 * ETAPA 1 — thin-proxy al módulo NestJS `admin`. RBAC (super_admin) lo enforce el backend.
 *  - GET  → `GET /api/admin/plan-features` (mapea camelCase→snake_case).
 *  - PUT  → `PUT /api/admin/plan-features/:planKey/:featureKey` (upsert enabled + label).
 * Sin Supabase.
 */
import { NextRequest, NextResponse } from 'next/server';
import { backendGet, backendPut } from '@/lib/api-client.server';

interface BackendPlanFeature {
  id: string;
  plan: string;
  featureKey: string;
  featureLabel: string;
  enabled: boolean;
}

export async function GET() {
  const result = await backendGet<BackendPlanFeature[]>('/api/admin/plan-features');
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }
  const rows = Array.isArray(result.value) ? result.value : [];
  const data = rows.map((f) => ({
    id: f.id,
    plan: f.plan,
    feature_key: f.featureKey,
    feature_label: f.featureLabel,
    enabled: f.enabled,
  }));
  return NextResponse.json({ data });
}

export async function PUT(req: NextRequest) {
  const body: unknown = await req.json();
  const obj = (typeof body === 'object' && body ? body : {}) as Record<string, unknown>;
  const plan = typeof obj.plan === 'string' ? obj.plan : '';
  const featureKey = typeof obj.feature_key === 'string' ? obj.feature_key : '';
  const featureLabel =
    typeof obj.feature_label === 'string' && obj.feature_label ? obj.feature_label : featureKey;
  const enabled = obj.enabled;

  if (!plan || !featureKey || typeof enabled !== 'boolean') {
    return NextResponse.json(
      { error: 'Faltan parámetros o son inválidos: plan, feature_key, enabled' },
      { status: 400 },
    );
  }

  const result = await backendPut<unknown>(
    `/api/admin/plan-features/${encodeURIComponent(plan)}/${encodeURIComponent(featureKey)}`,
    { feature_label: featureLabel, enabled },
  );
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }
  return NextResponse.json({ message: 'Plan feature updated successfully', data: result.value });
}
