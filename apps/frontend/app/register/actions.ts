'use server';

/**
 * register/actions.ts
 *
 * ETAPA 1: auth-related actions (registerDoctor, registerPatient,
 * confirmUserEmail, resendConfirmation) are DEV-STUBS — real user creation
 * requires Auth0 (Etapa 2 / Fase 6).
 *
 * Non-auth helpers (getBCVRate, getActivePlans, getActivePromotions,
 * getPaymentAccounts) still query the DB via createAdminClient and are
 * unaffected by the auth migration.
 *
 * ETAPA 2 (Auth0): replace stub bodies with Auth0 Management API calls
 * to provision users, then call the NestJS backend to create the profile.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { DEV_DOCTOR_UUID, DEV_PATIENT_UUID } from '@/lib/dev-auth.edge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RegisterInput = {
  full_name: string;
  cedula: string;
  email: string;
  password: string;
  specialty: string;
  phone: string;
  plan: 'trial' | 'basic' | 'professional' | 'clinic';
  sex?: string;
  professional_title?: string;
  clinic_name?: string;
  clinic_city?: string;
};

export type RegisterResult =
  | { success: true; doctorId: string }
  | { success: false; error: string };

// ---------------------------------------------------------------------------
// STUB: Register Doctor
// ETAPA 2 TODO: Call Auth0 Management API to create the user, then call
//   POST /api/admin/doctors (backend) to provision the profile + subscription.
// ---------------------------------------------------------------------------
export async function registerDoctor(_input: RegisterInput): Promise<RegisterResult> {
  // Etapa 1: Real user creation with password requires Auth0 (Etapa 2).
  // Return dev-stub success so the UI flow completes locally.
  // In production this stub MUST be replaced before launch.
  console.warn('[register] registerDoctor is a dev-stub (Etapa 2: Auth0)');
  revalidatePath('/admin/doctors');
  return { success: true, doctorId: DEV_DOCTOR_UUID };
}

// ---------------------------------------------------------------------------
// STUB: Register Patient
// ETAPA 2 TODO: Call Auth0 Management API to create the patient user, then
//   call the NestJS backend to create the patient profile.
// ---------------------------------------------------------------------------

export type RegisterPatientInput = {
  full_name: string;
  email: string;
  password: string;
  phone?: string;
};

export async function registerPatient(_input: RegisterPatientInput): Promise<RegisterResult> {
  // Etapa 1: Real user creation with password requires Auth0 (Etapa 2).
  console.warn('[register] registerPatient is a dev-stub (Etapa 2: Auth0)');
  return { success: true, doctorId: DEV_PATIENT_UUID };
}

// ---------------------------------------------------------------------------
// STUB: Email confirmation helpers
// ETAPA 2 TODO: Auth0 handles email confirmation automatically; remove these.
// ---------------------------------------------------------------------------

export async function confirmUserEmail(
  _email: string,
): Promise<{ success: boolean; error?: string }> {
  // Etapa 1: no-op stub. Auth0 handles confirmation in Etapa 2.
  return { success: true };
}

export async function resendConfirmation(
  email: string,
): Promise<{ success: boolean; error?: string }> {
  return confirmUserEmail(email);
}

// ---------------------------------------------------------------------------
// Tasa BCV — no auth dependency, unaffected
// ---------------------------------------------------------------------------

export type BCVRateResult = { rate: number; updated: string } | null;

export async function getBCVRate(): Promise<BCVRateResult> {
  // Source 1: fawazahmed0/currency-api CDN (fastest, no rate limits)
  try {
    const res = await fetch(
      'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json',
      { cache: 'no-store' },
    );
    if (res.ok) {
      const data = await res.json();
      const vesRate = data?.usd?.ves ?? data?.ves;
      if (vesRate && vesRate > 0) {
        return {
          rate: parseFloat(Number(vesRate).toFixed(2)),
          updated: data.date ?? new Date().toLocaleDateString('es-VE'),
        };
      }
    }
  } catch {
    /* try next source */
  }

  // Source 1b: currency-api fallback CDN
  try {
    const res = await fetch(
      'https://latest.currency-api.pages.dev/v1/currencies/usd.min.json',
      { cache: 'no-store' },
    );
    if (res.ok) {
      const data = await res.json();
      const vesRate = data?.usd?.ves ?? data?.ves;
      if (vesRate && vesRate > 0) {
        return {
          rate: parseFloat(Number(vesRate).toFixed(2)),
          updated: data.date ?? new Date().toLocaleDateString('es-VE'),
        };
      }
    }
  } catch {
    /* try next source */
  }

  // Source 2: dolarapi.com
  try {
    const res = await fetch('https://ve.dolarapi.com/v1/dolares/oficial', {
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error('fetch failed');
    const data = await res.json();
    const rate = data.promedio ?? data.precio ?? data.price ?? null;
    if (!rate) throw new Error('no rate');
    return {
      rate: parseFloat(rate),
      updated: data.fechaActualizacion ?? new Date().toLocaleDateString('es-VE'),
    };
  } catch {
    /* try next source */
  }

  // Source 3: pydolarve.org
  try {
    const res2 = await fetch('https://pydolarve.org/api/v2/dollar?page=bcv', {
      next: { revalidate: 3600 },
    });
    if (!res2.ok) throw new Error('fetch2 failed');
    const d2 = await res2.json();
    const rate2 = d2.monitors?.usd?.price ?? d2.price ?? null;
    if (!rate2) throw new Error('no rate2');
    return { rate: parseFloat(rate2), updated: new Date().toLocaleDateString('es-VE') };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Active plans — DB query only, no auth dependency
// ---------------------------------------------------------------------------

export type PlanConfigPublic = {
  plan_key: string;
  name: string;
  price: number;
  trial_days: number;
  description: string | null;
};

export async function getActivePlans(): Promise<PlanConfigPublic[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('plan_configs')
    .select('plan_key, name, price, trial_days, description')
    .eq('is_active', true)
    .order('sort_order');
  if (error) {
    console.error('Error fetching plans:', error.message);
    return [];
  }
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Active promotions — DB query only, no auth dependency
// ---------------------------------------------------------------------------

export type PromotionPublic = {
  id: string;
  plan_key: string;
  duration_months: number;
  original_price_usd: number;
  promo_price_usd: number;
  label: string;
};

export async function getActivePromotions(): Promise<PromotionPublic[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('plan_promotions')
    .select('id, plan_key, duration_months, original_price_usd, promo_price_usd, label')
    .eq('is_active', true)
    .or('ends_at.is.null,ends_at.gt.' + new Date().toISOString())
    .order('duration_months');
  if (error) {
    console.error('Error fetching promotions:', error.message);
    return [];
  }
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Payment accounts — DB query only, no auth dependency
// ---------------------------------------------------------------------------

export type PaymentAccount = {
  id: string;
  type: string;
  bank_name: string | null;
  account_holder: string | null;
  phone: string | null;
  rif: string | null;
  notes: string | null;
};

export async function getPaymentAccounts(): Promise<PaymentAccount[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('payment_accounts')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error obteniendo cuentas:', error.message);
    return [];
  }
  return data ?? [];
}
