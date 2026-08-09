'use client';

/**
 * hooks/useAccountBlockedGuard.ts
 *
 * Intercepta llamadas fetch() del portal del médico y detecta respuestas 403
 * que apagan la cuenta. Son DOS códigos distintos sobre el mismo flag
 * `profiles.is_active`:
 *
 *   ACCOUNT_BLOCKED     — lo bloqueó un administrador.
 *   ACCOUNT_DEACTIVATED — el propio especialista dio de baja su cuenta.
 *
 * El callback recibe cuál de los dos fue, porque el texto que ve la persona
 * cambia por completo: a quien se dio de baja solo no hay que decirle que "fue
 * bloqueado", eso se lee como una sanción.
 *
 * El hook parchea globalThis.fetch UNA SOLA VEZ al montarse el portal y
 * restaura el fetch original al desmontarse, evitando acumulación de wrappers.
 *
 * Solo aplica a rutas BFF internas (/api/*) para no interferir con fetches
 * a terceros (fonts, CDN, Google, etc.).
 */

import { useEffect, useRef } from 'react';

/** Códigos 403 que dejan la cuenta apagada. */
export type AccountOffCode = 'ACCOUNT_BLOCKED' | 'ACCOUNT_DEACTIVATED';

const ACCOUNT_OFF_CODES = new Set<string>(['ACCOUNT_BLOCKED', 'ACCOUNT_DEACTIVATED']);

/** Llama al callback cuando cualquier fetch a /api/* apaga la cuenta. */
export function useAccountBlockedGuard(onBlocked: (code: AccountOffCode) => void): void {
  // Keep a stable ref to the callback to avoid re-patching fetch on every render.
  const onBlockedRef = useRef(onBlocked);
  useEffect(() => {
    onBlockedRef.current = onBlocked;
  });

  useEffect(() => {
    const originalFetch = globalThis.fetch;

    const patchedFetch: typeof fetch = async (input, init) => {
      const response = await originalFetch(input, init);

      // Only inspect internal BFF routes.
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : (input as Request).url;

      if (url.startsWith('/api/') || url.includes('/api/')) {
        if (response.status === 403) {
          // Clone so the original response body stays consumable by the caller.
          const clone = response.clone();
          try {
            const json = (await clone.json()) as { code?: string };
            if (json.code && ACCOUNT_OFF_CODES.has(json.code)) {
              onBlockedRef.current(json.code as AccountOffCode);
            }
          } catch {
            // 403 sin JSON — no es ninguno de los dos códigos, se ignora.
          }
        }
      }

      return response;
    };

    globalThis.fetch = patchedFetch;

    return () => {
      globalThis.fetch = originalFetch;
    };
  }, []); // Empty array: patch once on mount, restore on unmount.
}
