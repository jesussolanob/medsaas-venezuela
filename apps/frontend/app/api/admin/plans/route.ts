/**
 * /api/admin/plans — configuración de planes (admin).
 *
 * ETAPA 1 — thin-proxy al módulo NestJS `admin`. RBAC (super_admin) lo enforce el backend.
 *  - GET → `GET /api/admin/plans` (mapea camelCase→snake_case al shape PlanConfig de la UI).
 *  - PUT → `PUT /api/admin/plans/:planKey/config` (edita name/price/trial_days/description/sort_order).
 * Sin Supabase.
 */
import { NextRequest, NextResponse } from 'next/server';
import { backendGet, backendPut } from '@/lib/api-client.server';

interface BackendPlan {
  planKey: string;
  name: string;
  priceUsd: number;
  trialDays: number;
  isActive: boolean;
  description: string | null;
  sortOrder: number;
}

export async function GET() {
  const result = await backendGet<BackendPlan[]>('/api/admin/plans');
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }
  const rows = Array.isArray(result.value) ? result.value : [];
  const data = rows.map((p) => ({
    id: p.planKey, // the UI uses an identifier per plan; planKey is the stable key
    plan_key: p.planKey,
    name: p.name,
    price: p.priceUsd,
    currency: 'USD',
    trial_days: p.trialDays,
    description: p.description,
    is_active: p.isActive,
    sort_order: p.sortOrder,
  }));
  return NextResponse.json({ data });
}

export async function PUT(req: NextRequest) {
  const body: unknown = await req.json();
  const obj = (typeof body === 'object' && body ? body : {}) as Record<string, unknown>;
  const planKey = typeof obj.planKey === 'string' ? obj.planKey : '';
  if (!planKey) {
    return NextResponse.json({ error: 'planKey requerido' }, { status: 400 });
  }

  // Only forward the editable fields the backend config endpoint accepts.
  const update: Record<string, unknown> = {};
  if (typeof obj.name === 'string') update.name = obj.name;
  if (typeof obj.price === 'number') update.price = obj.price;
  if (typeof obj.trial_days === 'number') update.trial_days = obj.trial_days;
  if (typeof obj.sort_order === 'number') update.sort_order = obj.sort_order;
  if (typeof obj.description === 'string' || obj.description === null)
    update.description = obj.description;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Ningún campo editable provisto' }, { status: 400 });
  }

  const result = await backendPut<unknown>(
    `/api/admin/plans/${encodeURIComponent(planKey)}/config`,
    update,
  );
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }
  return NextResponse.json({ data: result.value });
}
