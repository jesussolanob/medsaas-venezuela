import type { DoctorPlan } from './actions';
import { PLAN_DISPLAY_NAMES, formatPlanLabel } from '@/lib/plan-features';

/**
 * Nombres de plan para el panel de admin.
 *
 * Delegan en `lib/plan-features.ts`, que es la fuente única: la lista estaba
 * copiada en cuatro lugares y se fue separando. No se redefine acá.
 *
 * Este archivo existe —y no vive en `actions.ts`, que sería el lugar natural
 * junto a `DoctorPlan`— porque ese archivo es `'use server'` y solo puede
 * exportar funciones asincrónicas. El tipo viaja igual porque se borra al
 * compilar; un objeto no.
 */
export const PLAN_LABELS = PLAN_DISPLAY_NAMES as Record<DoctorPlan, string>;

/** Nombre del estado de la suscripcion, en español. */
export const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  active: 'Activo',
  trial: 'En prueba',
  trialing: 'En prueba',
  past_due: 'Vencido',
  suspended: 'Suspendido',
  cancelled: 'Cancelado',
};

/** Nombre legible del plan; 'Sin plan' cuando la columna viene vacía. */
export function planLabel(plan: string | null | undefined): string {
  if (!plan) return 'Sin plan';
  return formatPlanLabel(plan);
}

/**
 * Traduce el estado de la suscripción.
 *
 * Devuelve la clave cruda si no la conoce: es preferible que el admin lea
 * `expired` a que la pantalla invente un estado.
 */
export function subscriptionStatusLabel(status: string | null | undefined): string {
  if (!status) return 'Sin estado';
  return SUBSCRIPTION_STATUS_LABELS[status] ?? status;
}
