/**
 * /doctor/upgrade — Página de upsell para médicos cuyo plan no desbloquea un módulo.
 *
 * ETAPA 1 — carga los planes activos del backend para mostrar la tabla comparativa.
 * El pago es manual + aprobación admin; el CTA lleva a WhatsApp/email de contacto.
 */
import { backendGet } from '@/lib/api-client.server';
import UpgradeClient from './UpgradeClient';

// Public plan catalog (GET /api/plans) — doctor-accessible, snake_case, only
// active plans, no internal fields. Active prices only.
interface CatalogPlanFeature {
  feature_key: string;
  feature_label: string;
  enabled: boolean;
}

interface CatalogPlanPrice {
  period: string;
  price_usd: number;
}

interface CatalogPlan {
  plan_key: string;
  name: string;
  is_permanent: boolean;
  sort_order: number;
  features: CatalogPlanFeature[];
  prices: CatalogPlanPrice[];
}

interface DoctorFeaturesResponse {
  plan_key: string;
  effective_plan_key: string;
  is_downgraded: boolean;
  features: Record<string, boolean>;
}

export default async function UpgradePage() {
  // Catálogo de planes + plan EFECTIVO del doctor (para resaltar el plan actual).
  const [result, featuresResult] = await Promise.all([
    backendGet<CatalogPlan[]>('/api/plans?role=doctor'),
    backendGet<DoctorFeaturesResponse>('/api/doctor/features'),
  ]);
  const allPlans = result.ok && Array.isArray(result.value) ? result.value : [];
  const currentPlanKey = featuresResult.ok
    ? (featuresResult.value.effective_plan_key ?? featuresResult.value.plan_key ?? null)
    : null;

  // The catalog already returns only active plans; map to the client shape.
  const upgradePlans = [...allPlans]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((p) => ({
      plan_key: p.plan_key,
      name: p.name,
      is_active: true,
      is_permanent: p.is_permanent,
      sort_order: p.sort_order,
      features: p.features ?? [],
      prices: (p.prices ?? []).map((pr) => ({
        period: pr.period as 'monthly' | 'quarterly' | 'semiannual' | 'annual',
        price_usd: pr.price_usd,
        is_active: true,
      })),
    }));

  return <UpgradeClient plans={upgradePlans} currentPlanKey={currentPlanKey} />;
}
