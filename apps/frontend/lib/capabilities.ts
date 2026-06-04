/**
 * lib/capabilities.ts
 *
 * Tipos + helper puro para RBAC por capacidades (definidas en BD, ver backend
 * módulo `capabilities`). Client-safe (sin server-only): los layouts/sidebars
 * (client components) importan `can` y los tipos. El fetch vive en el server
 * action `app/capabilities-actions.ts`.
 */

export type CapabilityAction = 'view' | 'create' | 'edit' | 'delete';

export type ModuleCapabilities = Record<CapabilityAction, boolean>;

export interface Capabilities {
  role: string;
  modules: Record<string, ModuleCapabilities>;
}

export const EMPTY_CAPABILITIES: Capabilities = { role: '', modules: {} };

/** Helper puro: ¿el rol puede hacer `action` sobre `moduleKey`? (default-deny). */
export function can(
  caps: Capabilities | null | undefined,
  moduleKey: string,
  action: CapabilityAction = 'view',
): boolean {
  return caps?.modules?.[moduleKey]?.[action] ?? false;
}
