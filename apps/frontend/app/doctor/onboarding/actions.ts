'use server';

/**
 * app/doctor/onboarding/actions.ts
 *
 * Server actions for the doctor registration/onboarding form (Fase 2).
 * Called after Auth0 login when the doctor hasn't yet submitted their
 * professional identity data.
 *
 * Endpoint:
 *   POST /api/doctor/registration  (role=doctor)
 *     body: { full_name, cedula, mpps_number?, colegiado_number? }
 *   → { success:true, data: { doctorId, verificationStatus } }
 */

import { backendPost } from '@/lib/api-client.server';
import { log } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RegistrationInput {
  full_name: string;
  cedula: string;
  mpps_number?: string | null;
  colegiado_number?: string | null;
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
 * Idempotent: calling it again updates the fields and resets status to 'pending'.
 */
export async function submitDoctorRegistration(
  input: RegistrationInput,
): Promise<RegistrationResult> {
  const body: Record<string, unknown> = {
    full_name: input.full_name.trim(),
    cedula: input.cedula.trim(),
  };

  if (input.mpps_number?.trim()) {
    body.mpps_number = input.mpps_number.trim();
  }
  if (input.colegiado_number?.trim()) {
    body.colegiado_number = input.colegiado_number.trim();
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
