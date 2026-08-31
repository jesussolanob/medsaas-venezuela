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

/**
 * Módulos cuyo acceso depende del PLAN.
 *
 * Es el universo contra el que se cuenta cuánto tiene bloqueado un especialista.
 * Sale de `PLAN_GATED_ROUTES` del layout, que es la lista que la app ya usaba
 * para decidir qué ruta mandar a `/doctor/upgrade`.
 *
 * NO incluye `dashboard` ni `settings`: esos no se gatean nunca, y contarlos
 * inflaría el número. Las claves de IA tampoco — son features sueltas dentro de
 * la consulta, no módulos del menú.
 */
export const PLAN_GATED_MODULES: readonly string[] = [
  'agenda',
  'patients',
  'consultations',
  'ehr',
  'finances',
  'billing',
  'services',
  'reports',
  'crm',
  'reminders',
  'messages',
  'invitations',
];

/**
 * Nombre comercial de cada plan.
 *
 * FUENTE ÚNICA. Había cuatro copias de esta lista —la barra lateral del
 * especialista, el alta de especialista del admin, el detalle del especialista y
 * el filtro de suscripciones— y se fueron separando: a la de la barra lateral le
 * faltaba `free_trial`, así que a un especialista en prueba el badge le decía
 * "Free Trial" solo por el `split('_')` de respaldo, por casualidad.
 */
export const PLAN_DISPLAY_NAMES: Record<string, string> = {
  free_trial: 'Free Trial',
  delta_free: 'Delta Free',
  delta_base: 'Delta Base',
  delta_plus: 'Delta Plus',
};

/**
 * Nombre legible del plan.
 *
 * Cuando la clave no está en el mapa la formatea (`delta_pro` → `Delta Pro`) en
 * vez de inventar un nombre: los planes se crean desde `/admin/plans`, así que
 * la lista puede quedarse corta en cualquier momento.
 */
export function formatPlanLabel(planKey: string | undefined | null): string {
  if (!planKey) return 'Plan activo';
  return (
    PLAN_DISPLAY_NAMES[planKey] ??
    planKey
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  );
}

/**
 * Frase que acompaña al nombre del plan en la barra lateral y en el inicio.
 *
 * Antes estaba escrita a mano como "Acceso completo" y salía igual para todos:
 * un especialista en Delta Free leía "Delta Free · Acceso completo" mientras la
 * misma barra le mostraba candados en Marketing y "Disponible en un plan
 * superior" en el asistente de IA. La pantalla se contradecía a sí misma y, de
 * paso, el mensaje trabajaba en contra de la mejora de plan.
 *
 * Ahora sale de `features`, que es el dato que gatea los módulos de verdad.
 */
export function planAccessSummary(planFeatures: PlanFeatures | null): string {
  // `EMPTY_PLAN_FEATURES` es el estado inicial mientras carga: tiene `features`
  // vacío, así que contar ahí diría "12 módulos bloqueados" por un instante.
  if (!planFeatures || !planFeatures.effective_plan_key) return '';
  if (planFeatures.is_downgraded) return 'Plan degradado temporalmente';

  // Se cuenta con `planUnlocks`, NO con los `false` del mapa: un módulo que el
  // plan no habilita puede venir como `enabled: false` O directamente no venir,
  // y `planUnlocks` ya trata la ausencia como bloqueado. Contar solo los `false`
  // daba cero siempre y el texto volvía a decir "Acceso completo".
  const bloqueados = PLAN_GATED_MODULES.filter((clave) => !planUnlocks(planFeatures, clave)).length;
  if (bloqueados === 0) return 'Acceso completo';
  return bloqueados === 1 ? '1 módulo bloqueado' : `${bloqueados} módulos bloqueados`;
}
