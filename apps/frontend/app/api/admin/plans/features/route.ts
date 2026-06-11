/**
 * /api/admin/plans/[planKey]/features — proxy para editar features de un plan.
 *
 * PUT body: { planKey: string, features: [{ feature_key: string, enabled: boolean }] }
 * → PUT /api/admin/plans/:planKey/features (backend NestJS)
 */
import { NextRequest, NextResponse } from 'next/server';
import { backendPut } from '@/lib/api-client.server';
import { requireSuperAdmin } from '@/lib/auth-guards';

export async function PUT(req: NextRequest) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const body: unknown = await req.json();
  const obj = (typeof body === 'object' && body ? body : {}) as Record<string, unknown>;

  const planKey = typeof obj.planKey === 'string' ? obj.planKey : '';
  if (!planKey) {
    return NextResponse.json({ error: 'planKey requerido' }, { status: 400 });
  }

  if (!Array.isArray(obj.features)) {
    return NextResponse.json({ error: 'features debe ser un arreglo' }, { status: 400 });
  }

  type FeatureInput = { feature_key: string; feature_label?: string; enabled: boolean };

  const features = (obj.features as unknown[])
    .filter((f): f is FeatureInput => {
      const item = f as Record<string, unknown>;
      return typeof item.feature_key === 'string' && typeof item.enabled === 'boolean';
    })
    .map((f) => ({
      feature_key: f.feature_key,
      // Backend requires feature_label — default to capitalised feature_key if absent
      feature_label:
        f.feature_label ??
        f.feature_key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      enabled: f.enabled,
    }));

  if (features.length === 0) {
    return NextResponse.json({ error: 'No hay features válidas para actualizar' }, { status: 400 });
  }

  const result = await backendPut<unknown>(
    `/api/admin/plans/${encodeURIComponent(planKey)}/features`,
    { features },
  );

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }

  return NextResponse.json({ success: true, data: result.value });
}
