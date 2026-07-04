import { Inject, Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  PATIENT_REQUEST_REPOSITORY,
  type IPatientRequestRepository,
} from '../../domain/repositories/patient-request.repository';
import {
  PATIENT_REQUEST_ACCESS_CODE_REPOSITORY,
  type IPatientRequestAccessCodeRepository,
} from '../../domain/repositories/patient-request-access-code.repository';
import { PatientRequestNotPendingError } from '../../domain/errors/patient-request-not-pending.error';
import { InvalidAccessCodeError } from '../../domain/errors/invalid-access-code.error';
import {
  PATIENT_REPOSITORY,
  type IPatientRepository,
} from '../../../patients/domain/repositories/patient.repository';
import { PatientRequestSessionService } from '../services/patient-request-session.service';

export interface VerifyPatientRequestCodeInput {
  token: string;
  code: string;
  /** The patient's cédula as entered by the user — will be normalized for comparison. */
  cedula: string;
}

export interface VerifyPatientRequestCodeOutput {
  sessionToken: string;
  expiresAt: Date;
}

/**
 * VerifyPatientRequestCodeUseCase — validates a 6-digit access code AND the
 * patient's cédula for a patient request.
 *
 * FLOW:
 *   1. Find the request by token. Not found → same 422 as wrong code (oracle-safe).
 *   2. Check status is pending (422 NOT_PENDING — acceptable to disclose).
 *   3. Check request-level brute-force counter (≥ 10 total failures → blocked, same 422).
 *   4. Find the latest code for the request.
 *   5. Check code validity (not expired, not used, not code-level blocked).
 *   6. Fetch the patient record (decrypted) to obtain the stored cédula.
 *   7. Evaluate codeOk AND cedulaOk.
 *      If EITHER fails → increment BOTH counters → throw the SAME generic error
 *      (oracle-safe: callers cannot distinguish which factor failed).
 *   8. On both matching → mark code as used → issue HMAC session token (15-min exp).
 *
 * SECURITY:
 *   - Steps 1 and 3-7 all raise InvalidAccessCodeError — prevents existence oracle.
 *   - Never log the code, cédula, or session token.
 *   - Session token signing delegated to PatientRequestSessionService.
 */
@Injectable()
export class VerifyPatientRequestCodeUseCase {
  constructor(
    @Inject(PATIENT_REQUEST_REPOSITORY)
    private readonly requestRepo: IPatientRequestRepository,
    @Inject(PATIENT_REQUEST_ACCESS_CODE_REPOSITORY)
    private readonly codeRepo: IPatientRequestAccessCodeRepository,
    @Inject(PATIENT_REPOSITORY)
    private readonly patientRepo: IPatientRepository,
    private readonly sessionService: PatientRequestSessionService,
  ) {}

  async execute(input: VerifyPatientRequestCodeInput): Promise<VerifyPatientRequestCodeOutput> {
    const now = new Date();

    // 1. Find request by token.
    //    ORACLE-SAFE: return the same InvalidAccessCodeError when the token
    //    does not exist — prevents existence enumeration by the caller.
    const request = await this.requestRepo.findByToken(input.token);
    if (!request) {
      throw new InvalidAccessCodeError();
    }

    // 2. Request must be pending.
    //    Disclosing NOT_PENDING (fulfilled/revoked) is acceptable — the patient
    //    can see the status when they open the portal URL.
    if (!request.isPending()) {
      throw new PatientRequestNotPendingError();
    }

    // 3. Check request-level brute-force cap (10 accumulated failures).
    //    Same error as wrong code — do not reveal why.
    if (request.isLinkBruteforceBlocked()) {
      throw new InvalidAccessCodeError();
    }

    // 4. Find latest code for this request
    const accessCode = await this.codeRepo.findLatestByRequestId(request.id);
    if (!accessCode || !accessCode.isValidFor(now)) {
      throw new InvalidAccessCodeError();
    }

    // 5. Evaluate code match (do not throw yet — must evaluate cédula first)
    const codeOk = accessCode.matches(input.code);

    // 6. Fetch patient (decrypted) and evaluate cédula match.
    //    Never log the cédula value.
    const patient = await this.patientRepo.findById(request.patientId, request.doctorId);
    const cedulaOk = patient?.cedula != null && cedulasMatch(patient.cedula, input.cedula);

    // 7. If EITHER factor fails → increment BOTH counters and throw the same
    //    generic error (oracle-safe).
    if (!codeOk || !cedulaOk) {
      await Promise.all([
        this.codeRepo.incrementFailedAttempts(accessCode.id),
        this.requestRepo.incrementLinkFailedAttempts(request.id),
      ]);
      throw new InvalidAccessCodeError();
    }

    // 8. Mark code as used
    await this.codeRepo.markUsed(accessCode.id, now);

    // 9. Issue session token (HMAC-signed, 15-min exp) via session service
    const exp = new Date(now.getTime() + PatientRequestSessionService.SESSION_TTL_MS);
    const sessionToken = this.sessionService.sign(request.id, request.token, exp);

    return { sessionToken, expiresAt: exp };
  }
}

// ---------------------------------------------------------------------------
// Exported utilities for cédula normalization (used in tests and other use-cases)
// ---------------------------------------------------------------------------

/**
 * Normalizes a cédula string for comparison.
 * Strips spaces, hyphens, and dots; converts to uppercase.
 */
export function normalizeCedula(raw: string): string {
  return raw.replace(/[\s\-.]/g, '').toUpperCase();
}

/**
 * Returns the digits-only form of a cédula (drops the V/E/P/J prefix).
 */
export function cedulaDigits(raw: string): string {
  return raw.replace(/\D/g, '');
}

/**
 * Compares two cédulas using timing-safe equality (defense in depth).
 * Tolerant of V/E/P prefix and formatting differences.
 * Empty/no-digit inputs never match.
 */
export function cedulasMatch(stored: string, input: string): boolean {
  const normStored = normalizeCedula(stored);
  const normInput = normalizeCedula(input);

  // Exact normalized match (timing-safe)
  if (normStored.length === normInput.length && normStored.length > 0) {
    if (crypto.timingSafeEqual(Buffer.from(normStored), Buffer.from(normInput))) {
      return true;
    }
  }

  // Digit-only fallback (prefix-tolerant): V12345678 == 12345678
  const a = cedulaDigits(stored);
  const b = cedulaDigits(input);
  if (a.length === 0 || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
