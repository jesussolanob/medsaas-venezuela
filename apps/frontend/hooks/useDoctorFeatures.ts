'use client';

/**
 * hooks/useDoctorFeatures.ts
 *
 * Obtiene las features del plan activo del doctor una sola vez al montar.
 * Consume GET /api/doctor/features (BFF → backend NestJS).
 *
 * FAIL-OPEN: si el fetch falla, todas las features se consideran habilitadas
 * (consistente con hasPlanFeature en plan-gate.server.ts). El tradeoff es
 * consciente: preferimos mostrar la UI al doctor en caso de downtime momentáneo.
 *
 * Uso:
 *   const { features, loading } = useDoctorFeatures();
 *   if (!features.ai_assistant) return <LockedFeatureCard ... />;
 */

import { useEffect, useState } from 'react';

interface DoctorFeaturesData {
  plan_key: string;
  effective_plan_key: string;
  is_downgraded: boolean;
  features: Record<string, boolean>;
}

interface DoctorFeaturesResult {
  features: Record<string, boolean>;
  loading: boolean;
}

// Fail-open: todas las features habilitadas en caso de error.
const FAIL_OPEN_FEATURES: Record<string, boolean> = new Proxy({} as Record<string, boolean>, {
  get: () => true,
});

export function useDoctorFeatures(): DoctorFeaturesResult {
  const [features, setFeatures] = useState<Record<string, boolean>>(FAIL_OPEN_FEATURES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/doctor/features', { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) {
          // HTTP error → fail-open, no bloquear al doctor.
          return;
        }
        const json = (await res.json()) as { success?: boolean; data?: DoctorFeaturesData };
        if (cancelled) return;
        const data = json?.data;
        if (data?.features && typeof data.features === 'object') {
          setFeatures(data.features);
        }
        // Si la respuesta no tiene la forma esperada → fail-open (features ya es FAIL_OPEN_FEATURES).
      })
      .catch(() => {
        // Error de red → fail-open.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { features, loading };
}
