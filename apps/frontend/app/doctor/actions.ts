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

import { getDevUser } from '@/lib/dev-auth';
import { backendGet, type AppError } from '@/lib/api-client.server';
import { log } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Identity (replaces supabase.auth.getUser across the doctor area)
// ---------------------------------------------------------------------------

/** Returns the current doctor's id from the dev-auth stub. */
export async function getDoctorId(): Promise<string | null> {
  const user = await getDevUser();
  return user.id;
}

/** Returns the current doctor's full identity from the dev-auth stub. */
export async function getDevUserInfo(): Promise<{ id: string; role: string }> {
  const user = await getDevUser();
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

interface BackendService {
  id: string;
  name: string;
  price_usd: number;
  duration_minutes: number;
  sessions_count: number | null;
  is_active: boolean;
}

export type DoctorService = BackendService;

/** Fetch doctor's pricing plans / services. */
export async function getDoctorServices(): Promise<DoctorService[]> {
  const result = await backendGet<DoctorService[]>('/api/doctor/services');

  if (!result.ok) {
    log.error('[getDoctorServices] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return [];
  }

  return Array.isArray(result.value) ? result.value : [];
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
