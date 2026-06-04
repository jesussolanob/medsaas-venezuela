'use server';

/**
 * app/capabilities-actions.ts
 *
 * Server action para consumir las capacidades del rol autenticado (RBAC por BD).
 * ETAPA 1 — thin-proxy al backend NestJS (`GET /api/me/capabilities`). El rol viene
 * del dev-stub hoy y de Auth0 mañana — este action no cambia.
 *
 * Gating de vistas: los layouts/sidebars llaman a getMyCapabilities() y muestran un
 * módulo si `can(caps, 'modulo', 'view')` (helper en lib/capabilities). Cambiar
 * capacidades en BD (admin) aplica al instante (cache Redis + invalidación), sin re-login.
 *
 * Combinación con plan_features: un módulo se muestra si el ROL puede verlo (capacidades)
 * Y el PLAN lo habilita (getDoctorFeatures). Ambas puertas aplican.
 */

import { backendGet } from '@/lib/api-client.server';
import { EMPTY_CAPABILITIES, type Capabilities } from '@/lib/capabilities';

/** Capacidades del rol autenticado. Devuelve mapa vacío (deny-all) ante error. */
export async function getMyCapabilities(): Promise<Capabilities> {
  const result = await backendGet<Capabilities>('/api/me/capabilities');
  if (!result.ok) return EMPTY_CAPABILITIES;
  return result.value ?? EMPTY_CAPABILITIES;
}
