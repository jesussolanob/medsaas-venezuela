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
