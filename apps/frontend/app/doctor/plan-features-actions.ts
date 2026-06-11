'use server';

/**
 * app/doctor/plan-features-actions.ts
 *
 * Server action para obtener las features del plan activo del doctor autenticado.
 * Complementa a getMyCapabilities() (RBAC por rol) — este server action resuelve
 * la segunda puerta: el plan de suscripción.
 *
 * Uso en layout/server components:
 *   const planFeatures = await getDoctorPlanFeatures();
 *   const hasFinances = planFeatures.features.finances ?? false;
 */

import { backendGet } from '@/lib/api-client.server';

export interface DoctorPlanFeatures {
  plan_key: string;
  effective_plan_key: string;
  is_downgraded: boolean;
  features: Record<string, boolean>;
}

const FALLBACK: DoctorPlanFeatures = {
  plan_key: 'delta_free',
  effective_plan_key: 'delta_free',
  is_downgraded: false,
  features: {},
};

/**
 * Obtiene el mapa de features del plan activo del doctor.
 * Ante cualquier error retorna un fallback vacío (features: {}) — el caller
 * debe tratar una feature ausente como false (deny-safe).
 */
export async function getDoctorPlanFeatures(): Promise<DoctorPlanFeatures> {
  const result = await backendGet<DoctorPlanFeatures>('/api/doctor/features');
  if (!result.ok) return FALLBACK;
  return result.value ?? FALLBACK;
}
