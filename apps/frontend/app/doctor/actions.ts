'use server';

import { appErrorToString } from '@/lib/app-error';

/**
 * app/doctor/actions.ts
 *
 * Shared server actions for the doctor area.
 * ETAPA 1 — provides dev-auth identity to client components.
 *
 * These actions replace `supabase.auth.getUser()` calls throughout the
 * doctor area's client components. The Supabase auth session is removed;
 * identity comes from the dev-auth stub cookies.
 *
 * In Etapa 2 (Auth0 / Fase 4), these are replaced by the Auth0 session.
 */

import { resolveIdentity } from '@/lib/identity.server';
import { backendGet, type AppError } from '@/lib/api-client.server';
import { log } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Identity (replaces supabase.auth.getUser across the doctor area)
// ---------------------------------------------------------------------------

/** Returns the current doctor's id (resolves per AUTH_MODE: dev cookies or Auth0 session). */
export async function getDoctorId(): Promise<string | null> {
  try {
    const user = await resolveIdentity();
    return user.id;
  } catch {
    // auth0 mode with no session — fail closed rather than propagating a 500.
    return null;
  }
}

/** Returns the current doctor's full identity (resolves per AUTH_MODE). */
export async function getDevUserInfo(): Promise<{ id: string; role: string }> {
  const user = await resolveIdentity();
  return { id: user.id, role: user.role };
}

// ---------------------------------------------------------------------------
// Doctor profile (from NestJS backend)
// ---------------------------------------------------------------------------

interface BackendProfile {
  id: string;
  full_name: string;
  email: string;
  role: string;
  specialty: string | null;
  professional_title: string | null;
  phone: string | null;
  cedula: string | null;
  avatar_url: string | null;
  allows_online: boolean | null;
  office_address: string | null;
  city: string | null;
  state: string | null;
  payment_methods: string[] | null;
  payment_details: Record<string, unknown> | null;
  plan: string | null;
  subscription_status: string | null;
}

export type DoctorProfile = BackendProfile;

/** Fetch the doctor's profile from the NestJS backend. */
export async function getDoctorProfile(): Promise<DoctorProfile | null> {
  const result = await backendGet<DoctorProfile>('/api/doctor/profile');

  if (!result.ok) {
    log.error('[getDoctorProfile] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return null;
  }

  return result.value;
}

// ---------------------------------------------------------------------------
// Doctor features / plan gating (from NestJS backend)
// ---------------------------------------------------------------------------

interface BackendFeatureMap {
  [featureKey: string]: boolean;
}

/** Fetch the doctor's enabled feature flags. */
export async function getDoctorFeatures(): Promise<BackendFeatureMap> {
  const result = await backendGet<BackendFeatureMap>('/api/doctor/features');

  if (!result.ok) {
    log.error('[getDoctorFeatures] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return {};
  }

  return result.value ?? {};
}

// ---------------------------------------------------------------------------
// Doctor subscription status
// ---------------------------------------------------------------------------

interface BackendSubscription {
  status: string;
  plan: string;
  bannerLevel: 'ok' | 'warning' | 'danger' | null;
  expiresAt: string | null;
}

/** Fetch the doctor's subscription status. */
export async function getDoctorSubscription(): Promise<BackendSubscription | null> {
  const result = await backendGet<BackendSubscription>('/api/doctor/subscription');

  if (!result.ok) {
    log.error('[getDoctorSubscription] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return null;
  }

  return result.value;
}

// ---------------------------------------------------------------------------
// Doctor services / pricing plans (from NestJS backend)
// ---------------------------------------------------------------------------

// Types and mapper live in services-shared.ts (plain module, no 'use server')
// so they can be imported by both server-action modules and client components
// without hitting the "only async functions" constraint.
import type { BackendServiceRaw, DoctorService } from './services-shared';
import { mapDoctorService } from './services-shared';

// NOTE: do not re-export DoctorService from this 'use server' module. No consumer
// imports the type from here (they import the async functions), and a type re-export
// in a 'use server' file risks the Turbopack server-reference crash. Import the type
// from '@/app/doctor/services-shared' instead.

/** Fetch doctor's pricing plans / services. */
export async function getDoctorServices(): Promise<DoctorService[]> {
  const result = await backendGet<BackendServiceRaw[]>('/api/doctor/services');

  if (!result.ok) {
    log.error('[getDoctorServices] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return [];
  }

  return Array.isArray(result.value) ? result.value.map(mapDoctorService) : [];
}

// ---------------------------------------------------------------------------
// Finances summary (from NestJS backend)
// ---------------------------------------------------------------------------

interface BackendFinanceSummary {
  totalIncome: number;
  totalExpenses: number;
  netBalance: number;
  currency: string;
  month: string;
}

/** Fetch monthly financial summary. */
export async function getFinanceSummary(month?: string): Promise<BackendFinanceSummary | null> {
  const qs = month ? `?month=${month}` : '';
  const result = await backendGet<BackendFinanceSummary>(`/api/finances/summary${qs}`);

  if (!result.ok) {
    log.error('[getFinanceSummary] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return null;
  }

  return result.value;
}

export { appErrorToString };

// ---------------------------------------------------------------------------
// Onboarding gate
// ---------------------------------------------------------------------------

/**
 * Returns true when the doctor has completed onboarding (cedula is present).
 * Used by the doctor layout to gate access to the portal.
 */
export async function checkOnboardingComplete(): Promise<boolean> {
  const profile = await getDoctorProfile();
  // A newly SSO-created doctor won't have a cedula until they submit the
  // onboarding form. That's the canonical "incomplete" signal.
  return Boolean(profile?.cedula && profile.cedula.trim().length > 0);
}
