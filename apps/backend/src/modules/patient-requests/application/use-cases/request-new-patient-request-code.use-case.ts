import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { randomUUID } from 'crypto';
import {
  PATIENT_REQUEST_REPOSITORY,
  type IPatientRequestRepository,
} from '../../domain/repositories/patient-request.repository';
import {
  PATIENT_REQUEST_ACCESS_CODE_REPOSITORY,
  type IPatientRequestAccessCodeRepository,
} from '../../domain/repositories/patient-request-access-code.repository';
import { PatientRequestAccessCode } from '../../domain/entities/patient-request-access-code.entity';
import { PatientRequestNotPendingError } from '../../domain/errors/patient-request-not-pending.error';
import { CodeRequestRateLimitedError } from '../../domain/errors/code-request-rate-limited.error';
import { InvalidAccessCodeError } from '../../domain/errors/invalid-access-code.error';
import {
  PATIENT_REPOSITORY,
  type IPatientRepository,
} from '../../../patients/domain/repositories/patient.repository';
import { MailerService } from '../../../email/application/services/mailer.service';

export interface RequestNewPatientRequestCodeInput {
  token: string;
}

export interface RequestNewPatientRequestCodeOutput {
  expiresAt: Date;
}

/**
 * RequestNewPatientRequestCodeUseCase — generates a new 6-digit code for a
 * pending patient request.
 *
 * FLOW:
 *   1. Find the request by token (404 if not found).
 *   2. Check status is pending (422).
 *   3. Enforce 60-second cooldown via last_code_requested_at (429 if too soon).
 *   4. Update last_code_requested_at BEFORE generating the code (rate-limit gate).
 *   5. Generate a new 6-digit code with a 48-hour TTL.
 *   6. Persist the new code.
 *   7. Fire-and-forget: re-send the email to the patient.
 *   8. Return { expiresAt }.
 *
 * SECURITY:
 *   - 60-second cooldown prevents code cycling to bypass the link-level brute-force cap.
 *   - The request-level failed_attempts counter is NOT reset when a new code is requested.
 *   - Never log the code value.
 */
@Injectable()
export class RequestNewPatientRequestCodeUseCase {
  private readonly logger = new Logger(RequestNewPatientRequestCodeUseCase.name);

  constructor(
    @Inject(PATIENT_REQUEST_REPOSITORY)
    private readonly requestRepo: IPatientRequestRepository,
    @Inject(PATIENT_REQUEST_ACCESS_CODE_REPOSITORY)
    private readonly codeRepo: IPatientRequestAccessCodeRepository,
    @Inject(PATIENT_REPOSITORY)
    private readonly patientRepo: IPatientRepository,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  async execute(
    input: RequestNewPatientRequestCodeInput,
  ): Promise<RequestNewPatientRequestCodeOutput> {
    const now = new Date();

    // 1. Find request.
    //    ORACLE-SAFE: return 422 when token does not exist — same as wrong code —
    //    to prevent existence enumeration through this public endpoint.
    const request = await this.requestRepo.findByToken(input.token);
    if (!request) {
      throw new InvalidAccessCodeError();
    }

    // 2. Must be pending
    if (!request.isPending()) {
      throw new PatientRequestNotPendingError();
    }

    // 3. Enforce 60-second cooldown between code requests
    if (request.isCodeRequestOnCooldown(now)) {
      throw new CodeRequestRateLimitedError();
    }

    // 4. Update last_code_requested_at BEFORE generating the code (rate-limit gate).
    //    Even if subsequent steps fail, the cooldown is already set.
    await this.requestRepo.updateLastCodeRequestedAt(request.id, now);

    // 5. Generate new 6-digit code
    const rawCode = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    const expiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    // 6. Persist new code
    const accessCode = PatientRequestAccessCode.create({
      id: randomUUID(),
      requestId: request.id,
      code: rawCode,
      expiresAt,
      usedAt: null,
      failedAttempts: 0,
      createdAt: now,
    });
    await this.codeRepo.save(accessCode);

    // 7. Resolve public URL for email
    const baseUrl =
      this.config.get<string>('APP_BASE_URL') ??
      this.config.get<string>('FRONTEND_URL') ??
      'http://localhost:3000';
    const url = `${baseUrl}/patient-requests/${request.token}`;

    // 8. Fire-and-forget email
    void this.sendEmail({
      patientId: request.patientId,
      doctorId: request.doctorId,
      title: request.title,
      code: rawCode,
      url,
      expiresAt,
    });

    return { expiresAt };
  }

  private async sendEmail(params: {
    patientId: string;
    doctorId: string;
    title: string;
    code: string;
    url: string;
    expiresAt: Date;
  }): Promise<void> {
    try {
      const patient = await this.patientRepo.findById(params.patientId, params.doctorId);
      if (!patient?.email) {
        this.logger.debug('[request-code] patient has no email — skipping notification');
        return;
      }

      const expiresAtStr = params.expiresAt.toLocaleString('es-VE', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      await this.mailer.sendTemplate(
        'patient_request_code',
        patient.email,
        {
          patientName: patient.fullName,
          title: params.title,
          code: params.code,
          url: params.url,
          expiresAt: expiresAtStr,
        },
        { type: 'patient', id: params.patientId },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[request-new-code] email notification failed: ${message}`);
    }
  }
}
