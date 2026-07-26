'use server';

/**
 * app/doctor/settings/actions.ts
 *
 * Server actions for the doctor settings page.
 * ETAPA 1 — thin-proxy to the NestJS backend via api-client.server.
 *
 * Replaces all Supabase direct queries that were in the settings page.
 * Storage operations (avatar, logo, signature) are marked as PENDING_STORAGE
 * and left for the storage agent.
 *
 * Endpoints used:
 *   GET  /api/doctor/profile          → load profile data
 *   PUT  /api/doctor/profile          → update specialty, professional_title,
 *                                        payment_methods, payment_details,
 *                                        allows_online, office_address, city, phone
 *   GET  /api/doctor/schedule         → load schedule config (for integrations tab)
 *   PUT  /api/doctor/schedule         → update schedule config
 *
 * Fields NOT updatable via backend (no endpoint yet — kept read-only or local):
 *   - full_name        → read-only; not in UpdateDoctorProfileDto
 *   - share_message_template → Supabase-only column (PENDING_STORAGE / future)
 *   - whatsapp_token / whatsapp_phone_id → Supabase-only (PENDING_STORAGE)
 *   - license_number   → Supabase-only (PENDING_STORAGE)
 *   - logo_url         → Supabase Storage (PENDING_STORAGE)
 *   - signature_url    → Supabase Storage (PENDING_STORAGE)
 *   - sound_notifications → local preference; persisted in localStorage only
 *   - google_refresh_token → Supabase OAuth (PENDING_STORAGE / integrations)
 */

import { backendGet, backendPut, backendPost, backendDelete } from '@/lib/api-client.server';
import { revalidatePath } from 'next/cache';
import { log } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Shared result type (mirrors MutationResult in offices/actions.ts)
// ---------------------------------------------------------------------------

export interface ActionResult {
  ok: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Backend response shapes
// ---------------------------------------------------------------------------

/** Shape returned by GET/PUT /api/doctor/profile (camelCase, NestJS serialized). */
interface BackendDoctorProfile {
  id: string;
  fullName: string;
  email: string;
  specialty: string | null;
  professionalTitle: string | null;
  clinicId: string | null;
  clinicRole: string | null;
  paymentMethods: string[] | null;
  paymentDetails: Record<string, Record<string, string>> | null;
  allowsOnline: boolean | null;
  officeAddress: string | null;
  city: string | null;
  avatarUrl: string | null;
  logoUrl: string | null;
  signatureUrl: string | null;
  licenseNumber: string | null;
  phone: string | null;
  plan: string | null;
  subscriptionStatus: string | null;
  cedula: string | null;
  birthDate: string | null;
  gender: string | null;
}

/** Shape returned by GET/PUT /api/doctor/schedule (camelCase). */
interface BackendSchedule {
  workDays: number[];
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
  breakStart: string | null;
  breakEnd: string | null;
}

// ---------------------------------------------------------------------------
// View models (snake_case to match existing JSX field references)
// ---------------------------------------------------------------------------

/** Profile view consumed by the UI state. */
export interface SettingsProfileView {
  id: string;
  full_name: string;
  email: string;
  specialty: string;
  professional_title: string;
  allows_online: boolean;
  office_address: string;
  city: string;
  avatar_url: string | null;
  logo_url: string | null;
  signature_url: string | null;
  license_number: string | null;
  payment_methods: string[];
  payment_details: Record<string, Record<string, string>>;
  phone: string;
  cedula: string | null;
  birth_date: string | null;
  gender: string | null;
}

/** Schedule view consumed by the UI state. */
export interface SettingsScheduleView {
  work_days: number[];
  start_time: string;
  end_time: string;
  slot_duration_minutes: number;
  break_start: string | null;
  break_end: string | null;
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function profileToView(b: BackendDoctorProfile): SettingsProfileView {
  return {
    id: b.id,
    full_name: b.fullName ?? '',
    email: b.email ?? '',
    specialty: b.specialty ?? '',
    // Sin fallback a 'Dr.': el titulo lo elige el especialista (habia psicologas
    // que aparecian como "Dr." sin haberlo puesto).
    professional_title: b.professionalTitle ?? '',
    allows_online: b.allowsOnline ?? true,
    office_address: b.officeAddress ?? '',
    city: b.city ?? '',
    avatar_url: b.avatarUrl ?? null,
    logo_url: b.logoUrl ?? null,
    signature_url: b.signatureUrl ?? null,
    license_number: b.licenseNumber ?? null,
    payment_methods: b.paymentMethods ?? ['pago_movil', 'transferencia'],
    payment_details: (b.paymentDetails as Record<string, Record<string, string>>) ?? {},
    phone: b.phone ?? '',
    cedula: b.cedula ?? null,
    birth_date: b.birthDate ?? null,
    gender: b.gender ?? null,
  };
}

function scheduleToView(b: BackendSchedule): SettingsScheduleView {
  return {
    work_days: b.workDays ?? [1, 2, 3, 4, 5],
    start_time: b.startTime ?? '08:00',
    end_time: b.endTime ?? '17:00',
    slot_duration_minutes: b.slotDurationMinutes ?? 30,
    break_start: b.breakStart ?? null,
    break_end: b.breakEnd ?? null,
  };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Fetch the doctor's profile settings.
 * Replaces: supabase.from('profiles').select('*').eq('id', user.id).single()
 */
export async function loadSettingsProfile(): Promise<SettingsProfileView | null> {
  const result = await backendGet<BackendDoctorProfile>('/api/doctor/profile');

  if (!result.ok) {
    log.error('[loadSettingsProfile] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return null;
  }

  return profileToView(result.value);
}

/**
 * Persist profile fields that the backend accepts.
 * Fields not in UpdateDoctorProfileDto are silently ignored (backend schema is strict).
 *
 * Replaces: supabase.from('profiles').update({ specialty, professional_title,
 *           allows_online, share_message_template }).eq('id', user.id)
 */
export async function saveSettingsProfile(input: {
  full_name?: string;
  specialty: string;
  professional_title: string;
  allows_online: boolean;
  office_address?: string;
  city?: string;
  phone?: string;
  birth_date?: string | null;
  /** F | M | O | N. null limpia el valor. */
  gender?: string | null;
}): Promise<ActionResult> {
  const body: Record<string, unknown> = {
    specialty: input.specialty || null,
    professional_title: input.professional_title || null,
    allows_online: input.allows_online,
  };

  // full_name is optional in the backend DTO; only send it when provided and
  // non-empty (the Zod schema requires min length 1 and rejects unknown keys).
  if (input.full_name !== undefined && input.full_name.trim() !== '') {
    body.full_name = input.full_name.trim();
  }

  if (input.phone !== undefined) {
    body.phone = input.phone || null;
  }

  if (input.office_address !== undefined) {
    body.office_address = input.office_address || null;
  }
  if (input.city !== undefined) {
    body.city = input.city || null;
  }

  if (input.birth_date !== undefined) {
    body.birth_date = input.birth_date || null;
  }

  if (input.gender !== undefined) {
    body.gender = input.gender || null;
  }

  const result = await backendPut<BackendDoctorProfile>('/api/doctor/profile', body);

  if (!result.ok) {
    log.error('[saveSettingsProfile] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return { ok: false, error: result.error.message };
  }

  return { ok: true };
}

/**
 * Persist payment methods and payment details.
 *
 * Replaces: supabase.from('profiles').update({ payment_methods, payment_details })
 */
export async function savePaymentSettings(input: {
  payment_methods: string[];
  payment_details: Record<string, Record<string, string>>;
}): Promise<ActionResult> {
  const result = await backendPut<BackendDoctorProfile>('/api/doctor/profile', {
    payment_methods: input.payment_methods,
    payment_details: input.payment_details,
  });

  if (!result.ok) {
    log.error('[savePaymentSettings] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return { ok: false, error: result.error.message };
  }

  return { ok: true };
}

/**
 * Fetch the doctor's schedule configuration.
 * Replaces: no Supabase call existed for this — was previously a Next.js API route.
 */
export async function loadSettingsSchedule(): Promise<SettingsScheduleView | null> {
  const result = await backendGet<BackendSchedule>('/api/doctor/schedule');

  if (!result.ok) {
    log.error('[loadSettingsSchedule] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return null;
  }

  return scheduleToView(result.value);
}

/**
 * Persist the doctor's schedule configuration.
 */
export async function saveSettingsSchedule(input: {
  work_days: number[];
  start_time: string;
  end_time: string;
  slot_duration_minutes: number;
  break_start: string | null;
  break_end: string | null;
}): Promise<ActionResult> {
  const result = await backendPut<BackendSchedule>('/api/doctor/schedule', {
    work_days: input.work_days,
    start_time: input.start_time,
    end_time: input.end_time,
    slot_duration_minutes: input.slot_duration_minutes,
    break_start: input.break_start,
    break_end: input.break_end,
  });

  if (!result.ok) {
    log.error('[saveSettingsSchedule] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return { ok: false, error: result.error.message };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Media URL persistence — storage upload already uses /api/storage/upload;
// these actions persist the returned URL back to the backend profile.
// ---------------------------------------------------------------------------

/**
 * Persist avatar_url after the file is uploaded to MinIO via /api/storage/upload.
 * Replaces: no Supabase call (AvatarUploader had its own upload-only path).
 *
 * Backend: PUT /api/doctor/profile { avatar_url }
 */
export async function saveAvatarUrl(avatarUrl: string): Promise<ActionResult> {
  const result = await backendPut<BackendDoctorProfile>('/api/doctor/profile', {
    avatar_url: avatarUrl,
  });

  if (!result.ok) {
    log.error('[saveAvatarUrl] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return { ok: false, error: result.error.message };
  }

  revalidatePath('/doctor/settings');
  return { ok: true };
}

/**
 * Persist logo_url after the file is uploaded to MinIO via /api/storage/upload.
 * Replaces: Supabase profiles.logo_url (PENDING_STORAGE previously).
 *
 * Backend: PUT /api/doctor/profile { logo_url }
 */
export async function saveLogoUrl(logoUrl: string): Promise<ActionResult> {
  const result = await backendPut<BackendDoctorProfile>('/api/doctor/profile', {
    logo_url: logoUrl,
  });

  if (!result.ok) {
    log.error('[saveLogoUrl] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return { ok: false, error: result.error.message };
  }

  revalidatePath('/doctor/settings');
  return { ok: true };
}

/**
 * Persist signature_url after the file is uploaded to MinIO via /api/storage/upload.
 * Replaces: Supabase profiles.signature_url (PENDING_STORAGE previously).
 *
 * Backend: PUT /api/doctor/profile { signature_url }
 */
export async function saveSignatureUrl(signatureUrl: string | null): Promise<ActionResult> {
  const result = await backendPut<BackendDoctorProfile>('/api/doctor/profile', {
    signature_url: signatureUrl,
  });

  if (!result.ok) {
    log.error('[saveSignatureUrl] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return { ok: false, error: result.error.message };
  }

  revalidatePath('/doctor/settings');
  return { ok: true };
}

/**
 * Persist license_number.
 * Replaces: supabase.from('profiles').update({ license_number }).eq('id', doctorId)
 *
 * Backend: PUT /api/doctor/profile { license_number }
 */
export async function saveLicenseNumber(licenseNumber: string | null): Promise<ActionResult> {
  const result = await backendPut<BackendDoctorProfile>('/api/doctor/profile', {
    license_number: licenseNumber || null,
  });

  if (!result.ok) {
    log.error('[saveLicenseNumber] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return { ok: false, error: result.error.message };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Exchange rate settings — backend endpoints
// ---------------------------------------------------------------------------

/** Shape returned by GET /api/doctor/exchange-rate */
export interface ExchangeRateView {
  mode: 'usd_bcv' | 'eur_bcv' | 'custom';
  rate: number | null;
  label: string;
  customRate: number | null;
  customRateLabel: string | null;
}

/**
 * Load the doctor's exchange rate configuration.
 *
 * Backend: GET /api/doctor/exchange-rate
 */
export async function loadExchangeRate(): Promise<ExchangeRateView | null> {
  const result = await backendGet<ExchangeRateView>('/api/doctor/exchange-rate');

  if (!result.ok) {
    log.error('[loadExchangeRate] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return null;
  }

  return result.value;
}

/**
 * Persist the doctor's exchange rate configuration.
 *
 * Backend: PUT /api/doctor/exchange-rate
 *   body: { mode, custom_rate?, custom_rate_label? }
 */
export async function saveExchangeRate(input: {
  mode: 'usd_bcv' | 'eur_bcv' | 'custom';
  custom_rate?: number | null;
  custom_rate_label?: string | null;
}): Promise<ActionResult> {
  const body: Record<string, unknown> = { mode: input.mode };
  if (input.mode === 'custom') {
    body.custom_rate = input.custom_rate ?? null;
    body.custom_rate_label = input.custom_rate_label ?? null;
  } else {
    body.custom_rate = null;
    body.custom_rate_label = null;
  }

  const result = await backendPut<unknown>('/api/doctor/exchange-rate', body);

  if (!result.ok) {
    log.error('[saveExchangeRate] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return { ok: false, error: result.error.message };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Google Calendar integration actions
// ---------------------------------------------------------------------------

/** Shape returned by GET /api/integrations/google/status */
interface BackendGoogleStatus {
  connected: boolean;
  googleEmail?: string | null;
}

export interface GoogleStatusView {
  connected: boolean;
  googleEmail: string | null;
}

/**
 * Fetch the Google Calendar connection status for the current doctor.
 * Backend: GET /api/integrations/google/status
 */
export async function loadGoogleStatus(): Promise<GoogleStatusView> {
  const result = await backendGet<BackendGoogleStatus>('/api/integrations/google/status');

  if (!result.ok) {
    log.error('[loadGoogleStatus] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return { connected: false, googleEmail: null };
  }

  return {
    connected: result.value.connected,
    googleEmail: result.value.googleEmail ?? null,
  };
}

/**
 * Exchange an OAuth2 code for tokens and persist them in the backend.
 * Backend: POST /api/integrations/google/connect { code }
 */
export async function connectGoogle(code: string): Promise<ActionResult> {
  const result = await backendPost<unknown>('/api/integrations/google/connect', { code });

  if (!result.ok) {
    log.error('[connectGoogle] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return { ok: false, error: result.error.message };
  }

  revalidatePath('/doctor/settings');
  return { ok: true };
}

/**
 * Disconnect Google Calendar for the current doctor.
 * Backend: DELETE /api/integrations/google
 */
export async function disconnectGoogle(): Promise<ActionResult> {
  const result = await backendDelete<unknown>('/api/integrations/google');

  if (!result.ok) {
    log.error('[disconnectGoogle] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return { ok: false, error: result.error.message };
  }

  revalidatePath('/doctor/settings');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// PENDING — operations with no backend endpoint yet
// ---------------------------------------------------------------------------
// The following have no backend endpoint as of Etapa 1 and are NOT migrated:
//
//   saveIntegrations()    → whatsapp_token / whatsapp_phone_id → FASE 6 (no endpoint)
//   toggleSound()         → sound_notifications → local preference (localStorage only)
//   share_message_template → no backend column yet
//
// These are annotated in the page component. No Supabase writes remain for
// media/license fields — those are now handled by saveLogoUrl / saveSignatureUrl /
// saveLicenseNumber above.
// ---------------------------------------------------------------------------
