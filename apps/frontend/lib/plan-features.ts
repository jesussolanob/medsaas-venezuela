/**
 * lib/plan-features.ts
 *
 * Tipos + helper puro para gating por plan de suscripción.
 * Client-safe (sin server-only): los layouts/sidebars (client components) importan
 * planUnlocks() directamente. El fetch del servidor vive en
 * app/doctor/plan-features-actions.ts.
 *
 * Segunda puerta de acceso (complementa RBAC de capabilities.ts):
 *   Un módulo se muestra/accede si:
 *     1. can(caps, moduleKey, 'view')  — el ROL tiene permiso
 *     AND
 *     2. planUnlocks(planFeatures, moduleKey) — el PLAN lo habilita
 */

export interface PlanFeatures {
  plan_key: string;
  effective_plan_key: string;
  is_downgraded: boolean;
  features: Record<string, boolean>;
}

export const EMPTY_PLAN_FEATURES: PlanFeatures = {
  plan_key: '',
  effective_plan_key: '',
  is_downgraded: false,
  features: {},
};

/**
 * Verifica si el plan activo del doctor habilita una feature (moduleKey).
 * Items sin moduleKey son siempre accesibles (retorna true).
 * Si planFeatures es null (aún cargando), retorna true para evitar flash-of-locked.
 */
export function planUnlocks(
  planFeatures: PlanFeatures | null,
  moduleKey: string | undefined,
): boolean {
  if (!moduleKey) return true; // sin clave: siempre accesible
  if (planFeatures === null) return true; // cargando: mostrar todo provisoriamente
  return planFeatures.features[moduleKey] ?? false;
}
