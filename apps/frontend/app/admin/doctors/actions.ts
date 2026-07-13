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
import { requireSuperAdmin } from '@/lib/auth-guards';
import { backendPost } from '@/lib/api-client.server';

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
  // Guard: solo super_admin puede provisionar médicos.
  const guard = await requireSuperAdmin();
  if (!guard.ok) {
    return { success: false, error: 'No autorizado. Inicia sesión como administrador.' };
  }

  // Llama al backend NestJS directamente vía el helper server (URL absoluta + auth
  // reenviada). Antes se hacía `fetch('/api/admin/doctors')` con URL relativa desde
  // este Server Action, lo que rompía en el servidor con "Failed to parse URL".
  // NOTA: NO enviar `password`. El backend admin (Etapa 1) provisiona el perfil sin
  // contraseña (el login del médico es por Auth0), y su DTO es `.strict()` → mandar
  // `password` provoca "Unrecognized key: password" y rompe la creación.
  const result = await backendPost<unknown>('/api/admin/doctors', {
    full_name: input.full_name,
    cedula: input.cedula || null,
    email: input.email,
    specialty: input.specialty || null,
    phone: input.phone || null,
    plan: input.plan,
  });

  if (!result.ok) {
    return { success: false, error: result.error.message || 'Error al crear el médico' };
  }

  revalidatePath('/admin/doctors');
  return { success: true };
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
