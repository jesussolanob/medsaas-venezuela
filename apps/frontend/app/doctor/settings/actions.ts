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
 *                                        allows_online, office_address, city
 *   GET  /api/doctor/schedule         → load schedule config (for integrations tab)
 *   PUT  /api/doctor/schedule         → update schedule config
 *
 * Fields NOT updatable via backend (no endpoint yet — kept read-only or local):
 *   - phone            → not in profiles model for this module
 *   - full_name        → read-only; not in UpdateDoctorProfileDto
 *   - share_message_template → Supabase-only column (PENDING_STORAGE / future)
 *   - whatsapp_token / whatsapp_phone_id → Supabase-only (PENDING_STORAGE)
 *   - license_number   → Supabase-only (PENDING_STORAGE)
 *   - logo_url         → Supabase Storage (PENDING_STORAGE)
 *   - signature_url    → Supabase Storage (PENDING_STORAGE)
 *   - sound_notifications → local preference; persisted in localStorage only
 *   - google_refresh_token → Supabase OAuth (PENDING_STORAGE / integrations)
 */

import { backendGet, backendPut } from '@/lib/api-client.server';
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
  plan: string | null;
  subscriptionStatus: string | null;
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
  payment_methods: string[];
  payment_details: Record<string, Record<string, string>>;
  // Phone is part of the UI but not yet in the backend profile model.
  // Displayed read-only when available; write is a no-op for now.
  phone: string;
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
    professional_title: b.professionalTitle ?? 'Dr.',
    allows_online: b.allowsOnline ?? true,
    office_address: b.officeAddress ?? '',
    city: b.city ?? '',
    avatar_url: b.avatarUrl ?? null,
    payment_methods: b.paymentMethods ?? ['pago_movil', 'transferencia'],
    payment_details: (b.paymentDetails as Record<string, Record<string, string>>) ?? {},
    phone: '',
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
  specialty: string;
  professional_title: string;
  allows_online: boolean;
  office_address?: string;
  city?: string;
}): Promise<ActionResult> {
  const body: Record<string, unknown> = {
    specialty: input.specialty || null,
    professional_title: input.professional_title || null,
    allows_online: input.allows_online,
  };

  if (input.office_address !== undefined) {
    body.office_address = input.office_address || null;
  }
  if (input.city !== undefined) {
    body.city = input.city || null;
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
// PENDING_STORAGE — operations that still use Supabase Storage / columns
// ---------------------------------------------------------------------------
// The following operations are intentionally NOT migrated here.
// They remain in the page component with Supabase until the storage agent
// implements the corresponding backend endpoints:
//
//   uploadLogo()          → supabase.storage 'avatars' bucket, logo_url column
//   uploadSignature()     → supabase.storage 'avatars' bucket, signature_url column
//   removeSignature()     → supabase profiles.signature_url = null
//   saveLicense()         → supabase profiles.license_number column
//   saveIntegrations()    → supabase profiles.whatsapp_token / whatsapp_phone_id
//   toggleSound()         → supabase profiles.sound_notifications (+ localStorage)
//   profile.share_message_template → supabase profiles.share_message_template column
//   AvatarUploader        → already uses its own Supabase-based upload
//
// When the storage/integrations agent adds these endpoints, replace each
// supabase call above with the corresponding backendPost/backendPut call.
// ---------------------------------------------------------------------------
