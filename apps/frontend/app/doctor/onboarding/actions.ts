'use server';

/**
 * app/doctor/onboarding/actions.ts
 *
 * Server actions for the doctor registration/onboarding form.
 * Called after Auth0/dev-stub login when the doctor hasn't yet submitted
 * their professional identity data.
 *
 * Endpoint:
 *   POST /api/doctor/registration  (role=doctor)
 *     body: { full_name, cedula, specialty?, mpps_number?, colegiado_number? }
 *   → { success:true, data: { doctorId, verificationStatus } }
 *
 * Idempotent — repeating the call updates the fields.
 */

import { backendPost } from '@/lib/api-client.server';
import { log } from '@/lib/logger';
import type { DaySchedule } from '@/lib/schedule-utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RegistrationInput {
  full_name: string;
  cedula: string;
  /** Teléfono canónico (país + número, solo dígitos). Obligatorio. */
  phone: string;
  specialty?: string;
  /** F | M | O. null/undefined = prefiere no decirlo. */
  gender?: string | null;
  mpps_number?: string | null;
  colegiado_number?: string | null;
  /** Flag de aceptación de Términos y Condiciones. El backend lo acepta opcionalmente. */
  accepted_terms?: boolean;
  /**
   * Código del vendedor que lo trajo. OPCIONAL.
   *
   * No cambia nada del alta —el plan sigue siendo el de prueba, igual que
   * cualquier registro—: solo le acredita la venta a ese vendedor. El backend
   * lo escribe UNA sola vez; reentrar al wizard con otro código no lo pisa.
   */
  seller_code?: string | null;
}

export interface RegistrationResult {
  ok: boolean;
  error?: string;
  verificationStatus?: string;
}

interface BackendRegistrationResponse {
  doctorId: string;
  verificationStatus: string;
}

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

/**
 * Complete doctor registration by submitting identity fields to the backend.
 */
export async function submitDoctorRegistration(
  input: RegistrationInput,
): Promise<RegistrationResult> {
  const body: Record<string, unknown> = {
    full_name: input.full_name.trim(),
    cedula: input.cedula.trim(),
    phone: input.phone.trim(),
  };

  if (input.specialty?.trim()) {
    body.specialty = input.specialty.trim();
  }
  if (input.gender) {
    body.gender = input.gender;
  }
  if (input.mpps_number?.trim()) {
    body.mpps_number = input.mpps_number.trim();
  }
  if (input.colegiado_number?.trim()) {
    body.colegiado_number = input.colegiado_number.trim();
  }
  if (input.accepted_terms) {
    body.accepted_terms = true;
  }
  if (input.seller_code?.trim()) {
    body.seller_code = input.seller_code.trim().toUpperCase();
  }

  const result = await backendPost<BackendRegistrationResponse>('/api/doctor/registration', body);

  if (!result.ok) {
    log.error('[submitDoctorRegistration] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return { ok: false, error: result.error.message };
  }

  return {
    ok: true,
    verificationStatus: result.value.verificationStatus,
  };
}

// ---------------------------------------------------------------------------
// Office creation during onboarding (returns the new office id)
// ---------------------------------------------------------------------------

export interface OnboardingOfficeInput {
  name: string;
  address: string;
  city: string;
  phone: string;
  map_url?: string;
  schedule: DaySchedule[];
  slot_duration: number;
  buffer_minutes: number;
  modality: 'in_person' | 'online' | 'both';
}

export interface OnboardingOfficeResult {
  ok: boolean;
  id?: string;
  error?: string;
}

interface BackendOffice {
  id: string;
}

/**
 * Creates the first office during the onboarding wizard.
 * Returns the new office id on success so the wizard can pass it to step 3.
 */
export async function createOfficeForOnboarding(
  input: OnboardingOfficeInput,
): Promise<OnboardingOfficeResult> {
  const result = await backendPost<BackendOffice>('/api/doctor/offices', input);
  if (!result.ok) {
    log.error('[createOfficeForOnboarding] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return { ok: false, error: result.error.message };
  }
  return { ok: true, id: result.value.id };
}

// ---------------------------------------------------------------------------
// Mark onboarding complete
// ---------------------------------------------------------------------------

/**
 * Calls POST /api/doctor/onboarding/complete on the backend.
 * The backend validates ≥1 active office and ≥1 active service exist,
 * sets onboardingCompleted = true on the profile, and returns 422 if not.
 */
export async function completeOnboarding(): Promise<{ ok: boolean; error?: string }> {
  const result = await backendPost<{ success: boolean }>('/api/doctor/onboarding/complete', {});
  if (!result.ok) {
    log.error('[completeOnboarding] backend error', {
      code: result.error.code,
      status: result.error.status,
    });
    return { ok: false, error: result.error.message };
  }
  return { ok: true };
}
