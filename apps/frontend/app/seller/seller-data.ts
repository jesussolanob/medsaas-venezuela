'use client';

/**
 * Datos y vocabulario compartidos del portal del vendedor.
 *
 * Vivían dentro de `SellerPortalClient` cuando el portal era UNA sola página.
 * Al partirlo en Inicio + Especialistas, las dos pantallas necesitan la misma
 * lista y los mismos criterios: si cada una se armara los suyos, el embudo del
 * inicio y la columna "Seguimiento" de la tabla podrían decir cosas distintas
 * del mismo especialista. Un solo lugar donde se decide qué significa cada
 * estado.
 */

import { useCallback, useEffect, useState } from 'react';

export type SpecialistRow = {
  id: string;
  fullName: string;
  specialty: string | null;
  plan: string | null;
  subscriptionStatus: string | null;
  createdAt: string;
  lastSignInAt?: string | null;
  /** Terminó el alta (consultorio + servicio). El vendedor necesita ver a quién
   *  llamar porque quedó a mitad de camino. */
  onboardingCompleted?: boolean;
};

export type SpecialistDetail = SpecialistRow & {
  email: string;
  phone: string | null;
  cedula: string | null;
  /** Notas del vendedor sobre este especialista. Editables desde la ficha. */
  sellerNotes: string | null;
  isActive: boolean;
};

export const PLAN_LABELS: Record<string, string> = {
  free_trial: 'Prueba',
  delta_free: 'Delta Free',
  delta_base: 'Delta Base',
  delta_plus: 'Delta Plus',
};

/**
 * Normaliza para buscar: sin acentos y en minúsculas.
 *
 * Un vendedor tipea "solano" y el especialista está cargado como "Solanó"; que
 * la tilde decida si aparece o no es una trampa.
 */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-VE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** Clave del embudo. El orden del tipo ES el orden de urgencia comercial. */
export type EtapaKey = 'nunca_entro' | 'incompleto' | 'enfriando' | 'activo';

/**
 * Estado de seguimiento: a quién hay que llamar y por qué.
 *
 * El vendedor no necesita "cuántos días hace que no entra" como dato suelto:
 * necesita saber a quién perseguir. Por eso el orden es por urgencia comercial
 * y no cronológico —quien nunca entró y quien quedó a mitad del alta son dos
 * llamadas DISTINTAS— y por eso cada estado dice qué hacer.
 *
 * ⚠️ Los cortes (7 y 30 días) son los de esta pantalla; el panel de admin usa
 * 7 y 14 en `UsersPanel.tsx`. Ya divergían antes de este cambio. Unificarlos es
 * una decisión de producto pendiente, no algo que corresponda decidir acá.
 */
export function estadoSeguimiento(row: {
  lastSignInAt?: string | null;
  onboardingCompleted?: boolean;
}): {
  key: EtapaKey;
  label: string;
  className: string;
  detalle?: string;
} {
  if (!row.lastSignInAt) {
    return {
      key: 'nunca_entro',
      label: 'Nunca entró',
      className: 'bg-red-50 text-red-600',
      detalle: 'Se registró y nunca inició sesión',
    };
  }

  // `undefined` = el backend todavía no manda el campo. No se acusa a nadie de
  // tener el registro incompleto por un dato que no llegó.
  if (row.onboardingCompleted === false) {
    return {
      key: 'incompleto',
      label: 'Registro incompleto',
      className: 'bg-amber-50 text-amber-700',
      detalle: 'Entró pero no terminó de configurar consultorio y servicios',
    };
  }

  const dias = Math.floor((Date.now() - new Date(row.lastSignInAt).getTime()) / 86_400_000);
  if (dias <= 7)
    return { key: 'activo', label: 'Activo', className: 'bg-emerald-50 text-emerald-700' };
  if (dias <= 30)
    return {
      key: 'enfriando',
      label: `Hace ${dias} días`,
      className: 'bg-amber-50 text-amber-700',
      detalle: 'Se está enfriando',
    };
  return {
    key: 'enfriando',
    label: `Hace ${dias} días`,
    className: 'bg-slate-100 text-slate-500',
    detalle: 'Sin actividad — conviene reactivarlo',
  };
}

export type SellerData = {
  code: string | null;
  nombre: string | null;
  rows: SpecialistRow[];
  loading: boolean;
  recargar: () => Promise<void>;
};

/**
 * Carga el perfil del vendedor y su cartera.
 *
 * La lista viene COMPLETA en un solo fetch: no está paginada del lado del
 * servidor. Por eso las métricas del inicio y el filtro de la tabla se
 * calculan en el cliente y son exactos. Si algún día se pagina, ambos tienen
 * que mudarse al servidor o van a mentir sobre el total.
 */
export function useSellerData(): SellerData {
  const [code, setCode] = useState<string | null>(null);
  const [nombre, setNombre] = useState<string | null>(null);
  const [rows, setRows] = useState<SpecialistRow[]>([]);
  const [loading, setLoading] = useState(true);

  const recargar = useCallback(async () => {
    setLoading(true);
    try {
      const [meRes, listRes] = await Promise.all([
        fetch('/api/seller/me', { cache: 'no-store' }),
        fetch('/api/seller/specialists', { cache: 'no-store' }),
      ]);
      if (meRes.ok) {
        const j = (await meRes.json()) as {
          data?: { sellerCode: string | null; fullName?: string | null };
        };
        setCode(j.data?.sellerCode ?? null);
        setNombre(j.data?.fullName ?? null);
      }
      if (listRes.ok) {
        const j = (await listRes.json()) as { data?: SpecialistRow[] };
        setRows(Array.isArray(j.data) ? j.data : []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // En un tick aparte: arrancar la carga desde el cuerpo del efecto encadena
    // renders (el primer setState del fetch cae dentro del mismo commit).
    const t = setTimeout(() => void recargar(), 0);
    return () => clearTimeout(t);
  }, [recargar]);

  return { code, nombre, rows, loading, recargar };
}
