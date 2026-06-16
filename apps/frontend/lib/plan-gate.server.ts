/**
 * lib/plan-gate.server.ts  (server-only)
 *
 * Helper server-side para proteger páginas del portal médico que requieren
 * una feature de plan específica.
 *
 * Uso en un Server Component:
 *
 *   import { requirePlanFeature } from '@/lib/plan-gate.server'
 *   import { redirect } from 'next/navigation'
 *
 *   export default async function FinancesPage() {
 *     const blocked = await requirePlanFeature('finances')
 *     if (blocked) redirect(blocked)
 *     // ...
 *   }
 *
 * Retorna null si la feature está habilitada (no bloquear),
 * o la ruta de redirección ('/doctor/upgrade') si está bloqueada.
 *
 * En caso de error al obtener las features se asume acceso permitido
 * (fail-open): evita bloquear doctores cuando el backend tiene downtime.
 */

import 'server-only';
import { backendGet } from './api-client.server';

interface DoctorFeaturesResponse {
  plan_key: string;
  effective_plan_key: string;
  is_downgraded: boolean;
  features: Record<string, boolean>;
}

const UPGRADE_PATH = '/doctor/upgrade';

/**
 * Verifica si el doctor autenticado tiene la feature habilitada en su plan.
 *
 * @param featureKey - La clave de la feature a verificar (ej: 'finances', 'ai_assistant')
 * @returns null si acceso permitido; '/doctor/upgrade' si debe ser redirigido.
 */
export async function requirePlanFeature(featureKey: string): Promise<string | null> {
  try {
    const result = await backendGet<DoctorFeaturesResponse>('/api/doctor/features');
    if (!result.ok) return null; // fail-open ante error de red
    const features = result.value?.features ?? {};
    const enabled = features[featureKey] ?? false;
    return enabled ? null : UPGRADE_PATH;
  } catch {
    return null; // fail-open
  }
}

/**
 * Versión booleana de la verificación de plan con comportamiento FAIL-OPEN.
 * Útil en route handlers donde la feature no involucra datos sensibles de
 * pacientes transmitidos a servicios externos.
 *
 * FAIL-OPEN: ante error de red o downtime del backend retorna `true` (acceso
 * permitido). Tradeoff consciente: preferimos no bloquear doctores legítimos
 * durante un downtime momentáneo sobre bloquear acceso a una feature de pago.
 * Usar solo para features que NO transmiten PHI a servicios externos.
 *
 * @param featureKey - La clave de la feature a verificar (ej: 'ai_assistant')
 * @returns true si la feature está habilitada (o si hubo error — fail-open).
 */
export async function hasPlanFeature(featureKey: string): Promise<boolean> {
  try {
    const result = await backendGet<DoctorFeaturesResponse>('/api/doctor/features');
    if (!result.ok) return true; // fail-open ante error de red
    const features = result.value?.features ?? {};
    return features[featureKey] ?? false;
  } catch {
    return true; // fail-open
  }
}

/**
 * Versión booleana de la verificación de plan con comportamiento FAIL-CLOSED.
 * Usar en endpoints que transmiten datos sensibles de pacientes (PHI) a servicios
 * externos (ej: audio de consulta a Gemini). Si el backend de features está caído,
 * denegamos el acceso para evitar un bypass inadvertido de una feature de pago
 * que involucra datos sensibles.
 *
 * FAIL-CLOSED: ante error de red o downtime del backend retorna `false` (acceso
 * denegado). El doctor recibe un 403 hasta que el backend se recupere.
 *
 * @param featureKey - La clave de la feature a verificar (ej: 'ai_transcription')
 * @returns true solo si la feature está explícitamente habilitada; false en cualquier error.
 */
export async function hasPlanFeatureStrict(featureKey: string): Promise<boolean> {
  try {
    const result = await backendGet<DoctorFeaturesResponse>('/api/doctor/features');
    if (!result.ok) return false; // fail-closed: sin confirmación del backend, sin acceso
    const features = result.value?.features ?? {};
    return features[featureKey] ?? false;
  } catch {
    return false; // fail-closed: error de red → denegar
  }
}
