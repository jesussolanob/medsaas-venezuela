/**
 * Block keys that cannot be renamed by the doctor.
 *
 * These are core system blocks whose labels must remain consistent
 * across all consultations and templates. The pencil icon in
 * DynamicBlocks (frontend) is hidden for these keys, and the
 * PATCH /label endpoint rejects rename attempts with LockedBlockKeyError.
 *
 * Mirrors the LOCKED_BLOCK_KEYS constant in
 * apps/frontend/app/doctor/consultations/ConsultationsClient.tsx.
 */
export const LOCKED_BLOCK_KEYS: ReadonlySet<string> = new Set([
  'chief_complaint',
  'history',
  'diagnosis',
  'prescription',
  'indications',
  'paraclinical',
  'rest',
]);
