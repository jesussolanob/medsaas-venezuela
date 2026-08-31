import type { DoctorPlan } from './actions';

/**
 * Nombre comercial de cada plan, tal como el admin lo ve en el resto del panel.
 *
 * Vive acá y no en `actions.ts` porque ese archivo es `'use server'` y solo puede
 * exportar funciones asincronicas — el tipo `DoctorPlan` viaja igual porque los
 * tipos se borran al compilar, pero un objeto no.
 */
export const PLAN_LABELS: Record<DoctorPlan, string> = {
  free_trial: 'Free Trial',
  delta_free: 'Delta Free',
  delta_base: 'Delta Base',
  delta_plus: 'Delta Plus',
};

/** Nombre del estado de la suscripcion, en español. */
export const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  active: 'Activo',
  trial: 'En prueba',
  trialing: 'En prueba',
  past_due: 'Vencido',
  suspended: 'Suspendido',
  cancelled: 'Cancelado',
};

/**
 * Traduce la clave del plan que llega de la BD.
 *
 * Devuelve la clave cruda cuando no la conoce: es preferible que el admin lea
 * `delta_enterprise` a que la pantalla invente un nombre. La lista de planes es
 * parametrizable desde `/admin/plans`, asi que este mapa puede quedarse corto.
 */
export function planLabel(plan: string | null | undefined): string {
  if (!plan) return 'Sin plan';
  return PLAN_LABELS[plan as DoctorPlan] ?? plan;
}

/** Traduce el estado de la suscripcion; ver `planLabel` para el criterio. */
export function subscriptionStatusLabel(status: string | null | undefined): string {
  if (!status) return 'Sin estado';
  return SUBSCRIPTION_STATUS_LABELS[status] ?? status;
}
