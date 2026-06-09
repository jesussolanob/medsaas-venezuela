'use server';

/**
 * register/actions.ts
 *
 * ETAPA 1: auth-related actions (registerDoctor, registerPatient,
 * confirmUserEmail, resendConfirmation) are DEV-STUBS — real user creation
 * requires Auth0 (Etapa 2 / Fase 6).
 *
 * Non-auth helpers (getBCVRate, getActivePlans, getActivePromotions,
 * getPaymentAccounts) now source data from the NestJS backend or degrade
 * gracefully when no backend endpoint exists yet.
 *
 * ETAPA 2 (Auth0): replace stub bodies with Auth0 Management API calls
 * to provision users, then call the NestJS backend to create the profile.
 */

import 'server-only';
import { revalidatePath } from 'next/cache';
import { DEV_DOCTOR_UUID, DEV_PATIENT_UUID } from '@/lib/dev-auth.edge';
import { backendGet } from '@/lib/api-client.server';
import { reportError } from '@/lib/report-error';

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
// Tasa BCV — external API, no Supabase dependency
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
// Active plans — sourced from NestJS backend (GET /api/admin/plans)
// ---------------------------------------------------------------------------

export type PlanConfigPublic = {
  plan_key: string;
  name: string;
  price: number;
  trial_days: number;
  description: string | null;
};

export async function getActivePlans(): Promise<PlanConfigPublic[]> {
  const result = await backendGet<Array<Record<string, unknown>>>(
    '/api/admin/plans',
    // Plans endpoint requires super_admin role to read.
    { role: 'super_admin' },
  );

  if (!result.ok) {
    reportError('register/actions', 'getActivePlans', new Error(result.error.message));
    return [];
  }

  const rows = result.value;
  if (!Array.isArray(rows)) return [];

  // Filter to active plans only and normalize camelCase → snake_case shape.
  return rows
    .filter((r) => r.isActive === true)
    .map((r) => ({
      plan_key: String(r.planKey ?? ''),
      name: String(r.name ?? ''),
      price: typeof r.priceUsd === 'number' ? r.priceUsd : 0,
      trial_days: typeof r.trialDays === 'number' ? r.trialDays : 0,
      description: r.description != null ? String(r.description) : null,
    }));
}

// ---------------------------------------------------------------------------
// Active promotions — no backend endpoint yet → degrade to empty array
// ETAPA 2 TODO: wire to GET /api/admin/plan-promotions once the endpoint exists.
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
  // Stub: promotions endpoint not yet available in the backend.
  // Returns empty array so the register page renders without promotions.
  return [];
}

// ---------------------------------------------------------------------------
// Payment accounts — no backend endpoint yet → degrade to empty array
// ETAPA 2 TODO: wire to GET /api/admin/payment-accounts once the endpoint exists.
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
  // Stub: payment accounts endpoint not yet available in the backend.
  // Returns empty array; the register page renders without payment accounts.
  return [];
}
