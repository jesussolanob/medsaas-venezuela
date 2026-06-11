/**
 * /doctor/upgrade — Página de upsell para médicos cuyo plan no desbloquea un módulo.
 *
 * ETAPA 1 — carga los planes activos del backend para mostrar la tabla comparativa.
 * El pago es manual + aprobación admin; el CTA lleva a WhatsApp/email de contacto.
 */
import { backendGet } from '@/lib/api-client.server';
import UpgradeClient from './UpgradeClient';

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
  is_active: boolean;
  is_permanent: boolean;
  sort_order: number;
  features: BackendPlanFeature[];
  prices: BackendPlanPrice[];
}

export default async function UpgradePage() {
  const result = await backendGet<BackendPlan[]>('/api/admin/plans');
  const allPlans = result.ok && Array.isArray(result.value) ? result.value : [];

  // Only show active, non-permanent plans (i.e. paid plans the doctor can upgrade to)
  const upgradePlans = allPlans
    .filter((p) => p.is_active)
    .sort((a, b) => a.sort_order - b.sort_order);

  return <UpgradeClient plans={upgradePlans} />;
}
