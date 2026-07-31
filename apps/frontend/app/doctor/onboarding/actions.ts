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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RegistrationInput {
  full_name: string;
  cedula: string;
  specialty?: string;
  /** F | M | O. null/undefined = prefiere no decirlo. */
  gender?: string | null;
  mpps_number?: string | null;
  colegiado_number?: string | null;
  /** Flag de aceptación de Términos y Condiciones. El backend lo acepta opcionalmente. */
  accepted_terms?: boolean;
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
