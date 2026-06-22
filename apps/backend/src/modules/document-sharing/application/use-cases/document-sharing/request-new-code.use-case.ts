import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { randomUUID } from 'crypto';
import {
  SHARED_DOCUMENT_LINK_REPOSITORY,
  type ISharedDocumentLinkRepository,
} from '../../../domain/repositories/shared-document-link.repository';
import {
  DOCUMENT_ACCESS_CODE_REPOSITORY,
  type IDocumentAccessCodeRepository,
} from '../../../domain/repositories/document-access-code.repository';
import { DocumentAccessCode } from '../../../domain/entities/document-access-code.entity';
import { DocumentLinkNotFoundError } from '../../../domain/errors/document-link-not-found.error';
import { DocumentLinkNotActiveError } from '../../../domain/errors/document-link-not-active.error';
import { CodeRequestRateLimitedError } from '../../../domain/errors/code-request-rate-limited.error';
import {
  PATIENT_REPOSITORY,
  type IPatientRepository,
} from '../../../../patients/domain/repositories/patient.repository';
import { MailerService } from '../../../../email/application/services/mailer.service';

export interface RequestNewCodeInput {
  token: string;
}

export interface RequestNewCodeOutput {
  expiresAt: Date;
}

/**
 * RequestNewCodeUseCase — generates a new 6-digit code for an active shared link.
 *
 * FLOW:
 *   1. Find the link by token (404 if not found or revoked).
 *   2. Enforce 60-second cooldown via last_code_requested_at (429 if too soon).
 *   3. Generate a new 6-digit code with a 48-hour TTL.
 *   4. Update last_code_requested_at to now (rate-limit enforcement).
 *   5. Persist the new code.
 *   6. Fire-and-forget: re-send the email to the patient.
 *   7. Return { expiresAt }.
 *
 * SECURITY:
 *   - 60-second cooldown prevents code cycling to bypass the link-level brute-force cap.
 *   - The link-level failed_attempts counter is NOT reset when a new code is requested.
 *     An attacker who cycles codes still accumulates towards the 10-attempt cap.
 *   - Never log the code value.
 *   - Email failure is swallowed (patient does not have email → doctor shares manually).
 */
@Injectable()
export class RequestNewCodeUseCase {
  private readonly logger = new Logger(RequestNewCodeUseCase.name);

  constructor(
    @Inject(SHARED_DOCUMENT_LINK_REPOSITORY)
    private readonly linkRepo: ISharedDocumentLinkRepository,
    @Inject(DOCUMENT_ACCESS_CODE_REPOSITORY)
    private readonly codeRepo: IDocumentAccessCodeRepository,
    @Inject(PATIENT_REPOSITORY)
    private readonly patientRepo: IPatientRepository,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  async execute(input: RequestNewCodeInput): Promise<RequestNewCodeOutput> {
    const now = new Date();

    // 1. Find link
    const link = await this.linkRepo.findByToken(input.token);
    if (!link) {
      throw new DocumentLinkNotFoundError();
    }
    if (!link.isActive()) {
      throw new DocumentLinkNotActiveError();
    }

    // 2. Enforce 60-second cooldown between code requests
    if (link.isCodeRequestOnCooldown(now)) {
      throw new CodeRequestRateLimitedError();
    }

    // 3. Update last_code_requested_at BEFORE generating the code (rate-limit gate).
    //    Even if subsequent steps fail, the cooldown is already set.
    await this.linkRepo.updateLastCodeRequestedAt(link.id, now);

    // 4. Generate new 6-digit code
    const rawCode = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    const expiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    // 5. Persist new code
    const accessCode = DocumentAccessCode.create({
      id: randomUUID(),
      linkId: link.id,
      code: rawCode,
      expiresAt,
      usedAt: null,
      failedAttempts: 0,
      createdAt: now,
    });
    await this.codeRepo.save(accessCode);

    // 6. Resolve public URL for email
    const baseUrl =
      this.config.get<string>('APP_BASE_URL') ??
      this.config.get<string>('FRONTEND_URL') ??
      'http://localhost:3000';
    const url = `${baseUrl}/documents/${link.token}`;

    // 7. Fire-and-forget email
    void this.sendEmail({
      patientId: link.patientId,
      doctorId: link.doctorId,
      code: rawCode,
      url,
      expiresAt,
    });

    return { expiresAt };
  }

  private async sendEmail(params: {
    patientId: string;
    doctorId: string;
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
        'shared_documents_code',
        patient.email,
        {
          patientName: patient.fullName,
          doctorName: 'Su médico',
          code: params.code,
          url: params.url,
          expiresAt: expiresAtStr,
        },
        { type: 'patient', id: params.patientId },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[request-code] email notification failed: ${message}`);
    }
  }
}
