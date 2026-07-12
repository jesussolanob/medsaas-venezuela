'use server';

/**
 * admin/doctors/actions.ts
 *
 * ETAPA 1: createDoctor is a DEV-STUB. Real doctor provisioning (creating
 * the auth user + profile) requires Auth0 + the NestJS backend admin endpoint
 * (Etapa 2 / Fase 6). The Supabase Auth admin calls have been removed.
 *
 * ETAPA 2 TODO: call Auth0 Management API to create the user, then call
 *   POST /api/admin/doctors (NestJS) to provision profile + subscription.
 *
 * createClinic remains a no-op stub (tabla clinics eliminada en MVP).
 */

import { revalidatePath } from 'next/cache';

export type DoctorPlan = 'free_trial' | 'delta_free' | 'delta_base' | 'delta_plus';

export type CreateDoctorInput = {
  full_name: string;
  cedula: string;
  email: string;
  password: string;
  specialty: string;
  phone: string;
  plan: DoctorPlan;
};

export type ActionResult = { success: true } | { success: false; error: string };

export async function createDoctor(input: CreateDoctorInput): Promise<ActionResult> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BFF_URL ?? ''}/api/admin/doctors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: input.full_name,
        cedula: input.cedula || null,
        email: input.email,
        password: input.password,
        specialty: input.specialty || null,
        phone: input.phone || null,
        plan: input.plan,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Error desconocido' }));
      return { success: false, error: err.error ?? 'Error al crear el médico' };
    }

    revalidatePath('/admin/doctors');
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error de conexión';
    return { success: false, error: message };
  }
}

// DEPRECATED 2026-04-22: tabla clinics eliminada en reingeniería MVP.
// Beta privada solo soporta médicos individuales.
export type CreateClinicInput = {
  name: string;
  email: string;
  password: string;
  address: string;
  city: string;
  state: string;
  phone: string;
  specialty: string;
  max_doctors: number;
  admin_name: string;
};

export async function createClinic(_input: CreateClinicInput): Promise<ActionResult> {
  return {
    success: false,
    error:
      'Función deshabilitada: clínicas eliminadas en MVP. Usa createDoctor para registrar médicos individuales.',
  };
}
