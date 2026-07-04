/**
 * PatientRequest domain entity.
 *
 * Represents a doctor's request to a patient for documents or a response.
 * The request has a random URL-safe token, a status, and brute-force
 * protection counters mirroring the document-sharing pattern.
 *
 * Business invariants enforced here:
 *   - isPending()         — only pending requests accept new codes/uploads/submit.
 *   - canBeAccessedBy()   — enforces doctor ownership (anti-IDOR).
 *   - isLinkBruteforceBlocked() — blocks verify-code after 10 accumulated failures.
 *   - isCodeRequestOnCooldown() — enforces 60-second cooldown between request-code calls.
 */
export interface PatientRequestCreateParams {
  id: string;
  doctorId: string;
  patientId: string;
  token: string;
  title: string;
  description: string | null;
  responseText: string | null;
  status: 'pending' | 'fulfilled' | 'revoked';
  failedAttempts: number;
  lastCodeRequestedAt: Date | null;
  fulfilledAt: Date | null;
  createdAt: Date;
}

export class PatientRequest {
  readonly id: string;
  readonly doctorId: string;
  readonly patientId: string;
  readonly token: string;
  readonly title: string;
  readonly description: string | null;
  readonly responseText: string | null;
  readonly status: 'pending' | 'fulfilled' | 'revoked';
  /** Accumulated failed verify-code attempts across ALL codes for this request. */
  readonly failedAttempts: number;
  readonly lastCodeRequestedAt: Date | null;
  readonly fulfilledAt: Date | null;
  readonly createdAt: Date;

  /**
   * Maximum total failed attempts allowed across all codes for this request.
   * If the request reaches this threshold, verify-code is blocked even after
   * requesting a new code — the doctor must create a new request.
   */
  static readonly MAX_LINK_FAILED_ATTEMPTS = 10;

  /** Minimum seconds that must elapse between request-code calls. */
  static readonly CODE_REQUEST_COOLDOWN_SECONDS = 60;

  constructor(params: PatientRequestCreateParams) {
    this.id = params.id;
    this.doctorId = params.doctorId;
    this.patientId = params.patientId;
    this.token = params.token;
    this.title = params.title;
    this.description = params.description;
    this.responseText = params.responseText;
    this.status = params.status;
    this.failedAttempts = params.failedAttempts;
    this.lastCodeRequestedAt = params.lastCodeRequestedAt;
    this.fulfilledAt = params.fulfilledAt;
    this.createdAt = params.createdAt;
  }

  /** Returns true when the request is pending (not fulfilled or revoked). */
  isPending(): boolean {
    return this.status === 'pending';
  }

  /** Returns true when the given doctor owns this request. Anti-IDOR guard. */
  canBeAccessedBy(doctorId: string): boolean {
    return this.doctorId === doctorId;
  }

  /**
   * Returns true when the request-level failed-attempt counter has been reached.
   * When true, verify-code is blocked regardless of which code is active.
   * Requesting a new code does NOT reset this counter.
   */
  isLinkBruteforceBlocked(): boolean {
    return this.failedAttempts >= PatientRequest.MAX_LINK_FAILED_ATTEMPTS;
  }

  /**
   * Returns true when a new code was requested too recently.
   * Enforces a 60-second cooldown between request-code calls.
   */
  isCodeRequestOnCooldown(now: Date): boolean {
    if (!this.lastCodeRequestedAt) return false;
    const elapsedMs = now.getTime() - this.lastCodeRequestedAt.getTime();
    return elapsedMs < PatientRequest.CODE_REQUEST_COOLDOWN_SECONDS * 1000;
  }

  static create(params: PatientRequestCreateParams): PatientRequest {
    return new PatientRequest(params);
  }
}
