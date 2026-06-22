'use client';

/**
 * hooks/useAccountBlockedGuard.ts
 *
 * Intercepta llamadas fetch() del portal del médico y detecta respuestas
 * 403 con code "ACCOUNT_BLOCKED" emitidas por el backend.
 *
 * Cuando se detecta el bloqueo:
 *  1. Guarda el estado en una variable de módulo para que el portal lo lea.
 *  2. Llama al callback onBlocked (normalmente: mostrar aviso + cerrar sesión).
 *
 * El hook parchea globalThis.fetch UNA SOLA VEZ al montarse el portal y
 * restaura el fetch original al desmontarse, evitando acumulación de wrappers.
 *
 * Solo aplica a rutas BFF internas (/api/*) para no interferir con fetches
 * a terceros (fonts, CDN, Google, etc.).
 */

import { useEffect, useRef } from 'react';

/** Llama al callback pasado cuando cualquier fetch a /api/* devuelve ACCOUNT_BLOCKED. */
export function useAccountBlockedGuard(onBlocked: () => void): void {
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
            if (json.code === 'ACCOUNT_BLOCKED') {
              onBlockedRef.current();
            }
          } catch {
            // Non-JSON 403 — not our ACCOUNT_BLOCKED, ignore.
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
