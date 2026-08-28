/**
 * /admin/plans — Editor completo de planes de suscripción (super_admin).
 *
 * ETAPA 1 — server component que precarga la lista de planes desde el backend NestJS
 * (GET /api/admin/plans) y los pasa al client component PlansAdminClient.
 */
import { backendGet } from '@/lib/api-client.server';
import PlansAdminClient from './PlansAdminClient';

// The backend `GET /api/admin/plans` returns camelCase. The client component
// consumes snake_case, so we normalize here (same mapping as the BFF route handler).
interface BackendPlanFeature {
  featureKey: string;
  featureLabel: string;
  enabled: boolean;
}

interface BackendPlanPrice {
  period: string;
  priceUsd: number;
  isActive: boolean;
  /** Precio tachado. ⚠️ Acá viene en camelCase; el catálogo público lo manda como snake_case. */
  compareAtPrice: number | null;
}

interface BackendPlan {
  planKey: string;
  name: string;
  roleKey: string;
  isActive: boolean;
  isPermanent: boolean;
  sortOrder: number;
  description: string | null;
  priceUsd: number;
  trialDays: number;
  features: BackendPlanFeature[];
  prices: BackendPlanPrice[];
}

export default async function PlansPage() {
  // Fetch using super_admin identity override for the server component context.
  const result = await backendGet<BackendPlan[]>('/api/admin/plans', {
    role: 'super_admin',
  });

  const plans = result.ok && Array.isArray(result.value) ? result.value : [];

  // Sort by sortOrder then name, then normalize camelCase -> snake_case.
  const typedPlans = [...plans]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((p) => ({
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
        period: pr.period as 'monthly' | 'quarterly' | 'semiannual' | 'annual',
        price_usd: pr.priceUsd,
        compare_at_price: pr.compareAtPrice ?? null,
        is_active: pr.isActive,
      })),
    }));

  return <PlansAdminClient initialPlans={typedPlans} />;
}
