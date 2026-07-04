import { Inject, Injectable } from '@nestjs/common';
import {
  PATIENT_REQUEST_REPOSITORY,
  type IPatientRequestRepository,
} from '../../domain/repositories/patient-request.repository';
import { PatientRequestNotFoundError } from '../../domain/errors/patient-request-not-found.error';
import { PatientRequestNotPendingError } from '../../domain/errors/patient-request-not-pending.error';
import { InvalidSessionTokenError } from '../../domain/errors/invalid-session-token.error';
import { PatientRequestSessionService } from '../services/patient-request-session.service';

export interface SubmitPatientRequestInput {
  token: string;
  sessionToken: string;
  responseText: string | null;
}

export interface SubmitPatientRequestOutput {
  requestId: string;
}

/**
 * SubmitPatientRequestUseCase — marks a patient request as fulfilled.
 *
 * FLOW:
 *   1. Validate session token presence.
 *   2. Find request by token (404 if not found).
 *   3. Verify request is pending (idempotent: fulfilled is 422).
 *   4. Validate session token (HMAC + expiry + resource match) via session service.
 *   5. Mark request as fulfilled with optional response text.
 *   6. Return { requestId }.
 *
 * SECURITY:
 *   - Session token validated via PatientRequestSessionService before any write.
 *   - Never log the session token or response text.
 */
@Injectable()
export class SubmitPatientRequestUseCase {
  constructor(
    @Inject(PATIENT_REQUEST_REPOSITORY)
    private readonly requestRepo: IPatientRequestRepository,
    private readonly sessionService: PatientRequestSessionService,
  ) {}

  async execute(input: SubmitPatientRequestInput): Promise<SubmitPatientRequestOutput> {
    // 1. Validate session token presence
    if (!input.sessionToken || input.sessionToken.trim() === '') {
      throw new InvalidSessionTokenError();
    }

    // 2. Find request by token
    const request = await this.requestRepo.findByToken(input.token);
    if (!request) {
      throw new PatientRequestNotFoundError();
    }

    // 3. Must be pending
    if (!request.isPending()) {
      throw new PatientRequestNotPendingError();
    }

    // 4. Validate session token via session service
    this.sessionService.validate(input.sessionToken, request.id, input.token);

    // 5. Mark as fulfilled
    const now = new Date();
    await this.requestRepo.markFulfilled(request.id, now, input.responseText);

    return { requestId: request.id };
  }
}
