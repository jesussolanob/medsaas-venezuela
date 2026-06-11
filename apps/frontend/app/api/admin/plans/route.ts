/**
 * /api/admin/plans — configuración de planes (admin).
 *
 * ETAPA 1 — thin-proxy al módulo NestJS `admin`. RBAC (super_admin) lo enforce el backend.
 *  - GET  → `GET /api/admin/plans` — lista todos los planes con features y precios.
 *  - POST → `POST /api/admin/plans` — crea un nuevo plan.
 *  - PUT  → `PUT /api/admin/plans/:planKey` — edita name/is_active/sort_order/is_permanent.
 * Sin Supabase.
 */
import { NextRequest, NextResponse } from 'next/server';
import { backendGet, backendPost, backendPut } from '@/lib/api-client.server';
import { requireSuperAdmin } from '@/lib/auth-guards';

interface BackendPlanFeature {
  id: string;
  plan: string;
  featureKey: string;
  featureLabel: string;
  enabled: boolean;
}

interface BackendPlanPrice {
  id: string;
  planKey: string;
  period: string;
  priceUsd: number;
  isActive: boolean;
}

interface BackendPlan {
  planKey: string;
  name: string;
  priceUsd: number;
  trialDays: number;
  isActive: boolean;
  isPermanent: boolean;
  description: string | null;
  sortOrder: number;
  roleKey: string;
  features: BackendPlanFeature[];
  prices: BackendPlanPrice[];
}

function normalizePlan(p: BackendPlan) {
  return {
    plan_key: p.planKey,
    name: p.name,
    role_key: p.roleKey,
    is_active: p.isActive,
    is_permanent: p.isPermanent,
    sort_order: p.sortOrder,
    description: p.description,
    price_usd: p.priceUsd,
    trial_days: p.trialDays,
    features: (p.features ?? []).map((f) => ({
      feature_key: f.featureKey,
      feature_label: f.featureLabel,
      enabled: f.enabled,
    })),
    prices: (p.prices ?? []).map((pr) => ({
      period: pr.period,
      price_usd: pr.priceUsd,
      is_active: pr.isActive,
    })),
  };
}

export async function GET() {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const result = await backendGet<BackendPlan[]>('/api/admin/plans');
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }
  const rows = Array.isArray(result.value) ? result.value : [];
  return NextResponse.json({ success: true, data: rows.map(normalizePlan) });
}

export async function POST(req: NextRequest) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const body: unknown = await req.json();
  const obj = (typeof body === 'object' && body ? body : {}) as Record<string, unknown>;

  const required = ['plan_key', 'name', 'role_key'];
  for (const field of required) {
    if (typeof obj[field] !== 'string' || !obj[field]) {
      return NextResponse.json({ error: `${field} es requerido` }, { status: 400 });
    }
  }

  const payload = {
    plan_key: obj.plan_key,
    name: obj.name,
    role_key: obj.role_key,
    is_permanent: obj.is_permanent === true,
    is_active: obj.is_active !== false,
    sort_order: typeof obj.sort_order === 'number' ? obj.sort_order : 99,
  };

  const result = await backendPost<BackendPlan>('/api/admin/plans', payload);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }
  return NextResponse.json({ success: true, data: normalizePlan(result.value) }, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const body: unknown = await req.json();
  const obj = (typeof body === 'object' && body ? body : {}) as Record<string, unknown>;

  const planKey = typeof obj.plan_key === 'string' ? obj.plan_key : '';
  if (!planKey) {
    return NextResponse.json({ error: 'plan_key requerido' }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (typeof obj.name === 'string') update.name = obj.name;
  if (typeof obj.is_active === 'boolean') update.is_active = obj.is_active;
  if (typeof obj.is_permanent === 'boolean') update.is_permanent = obj.is_permanent;
  if (typeof obj.sort_order === 'number') update.sort_order = obj.sort_order;
  if (typeof obj.description === 'string' || obj.description === null) {
    update.description = obj.description;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Ningún campo editable provisto' }, { status: 400 });
  }

  const result = await backendPut<BackendPlan>(
    `/api/admin/plans/${encodeURIComponent(planKey)}`,
    update,
  );
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.message },
      { status: result.error.status || 500 },
    );
  }
  return NextResponse.json({ success: true, data: normalizePlan(result.value) });
}
