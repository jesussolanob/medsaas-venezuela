/**
 * /admin/plans — Editor completo de planes de suscripción (super_admin).
 *
 * ETAPA 1 — server component que precarga la lista de planes desde el backend NestJS
 * (GET /api/admin/plans) y los pasa al client component PlansAdminClient.
 */
import { backendGet } from '@/lib/api-client.server';
import PlansAdminClient from './PlansAdminClient';

interface BackendPlanFeature {
  feature_key: string;
  feature_label: string;
  enabled: boolean;
}

interface BackendPlanPrice {
  period: string;
  price_usd: number;
  is_active: boolean;
}

interface BackendPlan {
  plan_key: string;
  name: string;
  role_key: string;
  is_active: boolean;
  is_permanent: boolean;
  sort_order: number;
  description: string | null;
  price_usd: number;
  trial_days: number;
  features: BackendPlanFeature[];
  prices: BackendPlanPrice[];
}

export default async function PlansPage() {
  // Fetch using super_admin identity override for the server component context.
  const result = await backendGet<BackendPlan[]>('/api/admin/plans', {
    role: 'super_admin',
  });

  const plans = result.ok && Array.isArray(result.value) ? result.value : [];

  // Sort by sort_order then name.
  const sorted = [...plans].sort(
    (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
  );

  // Cast periods to the union type the client expects
  const typedPlans = sorted.map((p) => ({
    ...p,
    prices: p.prices.map((pr) => ({
      ...pr,
      period: pr.period as 'monthly' | 'quarterly' | 'semiannual' | 'annual',
    })),
  }));

  return <PlansAdminClient initialPlans={typedPlans} />;
}
