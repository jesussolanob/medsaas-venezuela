/**
 * /admin/plan-features — configuración de features por plan (server component).
 *
 * ETAPA 1 — lee del módulo NestJS `admin` (`GET /api/admin/plan-features`) vía el BFF
 * server-only. El RBAC (super_admin) de /admin lo aplica `proxy.ts`. Sin Supabase.
 * Mapea el shape camelCase del backend al `PlanFeature` (snake_case) que usa el cliente.
 */
import { backendGet } from '@/lib/api-client.server';
import PlanFeaturesClient from './PlanFeaturesClient';

interface BackendPlanFeature {
  id: string;
  plan: string;
  featureKey: string;
  featureLabel: string;
  enabled: boolean;
}

export default async function PlanFeaturesPage() {
  const result = await backendGet<BackendPlanFeature[]>('/api/admin/plan-features');
  const rows = result.ok && Array.isArray(result.value) ? result.value : [];

  const initialData = rows.map((f) => ({
    id: f.id,
    plan: f.plan,
    feature_key: f.featureKey,
    feature_label: f.featureLabel,
    enabled: f.enabled,
    created_at: '',
    updated_at: '',
  }));

  return <PlanFeaturesClient initialData={initialData} />;
}
