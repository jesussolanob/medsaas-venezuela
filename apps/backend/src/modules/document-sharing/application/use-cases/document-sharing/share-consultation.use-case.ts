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
import { SharedDocumentLink } from '../../../domain/entities/shared-document-link.entity';
import { DocumentAccessCode } from '../../../domain/entities/document-access-code.entity';
import { NoSectionsSelectedError } from '../../../domain/errors/no-sections-selected.error';
import { ConsultationNotOwnedError } from '../../../domain/errors/consultation-not-owned.error';
import { PatientCedulaRequiredForSharingError } from '../../../domain/errors/patient-cedula-required.error';
import type { ShareConsultationDto } from '../../dtos/share-consultation.dto';
import {
  CONSULTATION_REPOSITORY,
  type IConsultationRepository,
} from '../../../../consultations/domain/repositories/consultation.repository';
import {
  PATIENT_REPOSITORY,
  type IPatientRepository,
} from '../../../../patients/domain/repositories/patient.repository';
import { MailerService } from '../../../../email/application/services/mailer.service';

export interface ShareConsultationInput {
  consultationId: string;
  doctorId: string;
  dto: ShareConsultationDto;
  doctorName: string;
}

export interface ShareConsultationOutput {
  url: string;
  code: string;
  expiresAt: Date;
}

/**
 * ShareConsultationUseCase — creates a shared document link for a consultation.
 *
 * FLOW:
 *   1. Verify the consultation exists and is owned by the authenticated doctor.
 *   2. Validate at least one section is selected.
 *   3. Generate a 48-byte URL-safe token and a 6-digit access code (48h TTL).
 *   4. Persist the link and the code.
 *   5. Fire-and-forget email to the patient (if they have one).
 *   6. Return { url, code, expiresAt }.
 *
 * SECURITY:
 *   - Doctor ownership verified before any write (anti-IDOR).
 *   - Token is crypto.randomBytes(48).toString('base64url') — 384 bits of entropy.
 *   - Code is 6 random decimal digits.
 *   - Email failure does NOT propagate — the doctor can share the url+code manually.
 *   - Never log PHI, code, or the token value.
 */
@Injectable()
export class ShareConsultationUseCase {
  private readonly logger = new Logger(ShareConsultationUseCase.name);

  constructor(
    @Inject(SHARED_DOCUMENT_LINK_REPOSITORY)
    private readonly linkRepo: ISharedDocumentLinkRepository,
    @Inject(DOCUMENT_ACCESS_CODE_REPOSITORY)
    private readonly codeRepo: IDocumentAccessCodeRepository,
    @Inject(CONSULTATION_REPOSITORY)
    private readonly consultationRepo: IConsultationRepository,
    @Inject(PATIENT_REPOSITORY)
    private readonly patientRepo: IPatientRepository,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  async execute(input: ShareConsultationInput): Promise<ShareConsultationOutput> {
    // 1. Verify consultation ownership (anti-IDOR)
    const consultation = await this.consultationRepo.findById(input.consultationId, input.doctorId);
    if (!consultation || !consultation.canBeModifiedBy(input.doctorId)) {
      throw new ConsultationNotOwnedError();
    }

    // 1b. The patient must have a cédula on file — it is the second factor the
    //     patient enters to open the shared document (verify-code). Without it
    //     the link is unusable, so fail early with a clear message for the doctor
    //     instead of letting the patient hit a generic 422 with no way forward.
    const patient = await this.patientRepo.findById(consultation.patientId, input.doctorId);
    if (!patient?.cedula || !patient.cedula.trim()) {
      throw new PatientCedulaRequiredForSharingError();
    }

    // 2. Validate at least one section
    const sections = {
      report: input.dto.sections.report,
      prescriptions: input.dto.sections.prescriptions,
      ehr: input.dto.sections.ehr,
    };
    if (!sections.report && !sections.prescriptions && !sections.ehr) {
      throw new NoSectionsSelectedError();
    }

    // 3. Generate secure token and 6-digit code
    const token = crypto.randomBytes(48).toString('base64url');
    const rawCode = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    // 4. Persist link
    const link = SharedDocumentLink.create({
      id: randomUUID(),
      consultationId: input.consultationId,
      doctorId: input.doctorId,
      patientId: consultation.patientId,
      token,
      sections,
      status: 'active',
      failedAttempts: 0,
      lastCodeRequestedAt: null,
      createdAt: new Date(),
    });
    const savedLink = await this.linkRepo.save(link);

    // 5. Persist code
    const accessCode = DocumentAccessCode.create({
      id: randomUUID(),
      linkId: savedLink.id,
      code: rawCode,
      expiresAt,
      usedAt: null,
      failedAttempts: 0,
      createdAt: new Date(),
    });
    await this.codeRepo.save(accessCode);

    // 6. Resolve public URL
    const baseUrl =
      this.config.get<string>('APP_BASE_URL') ??
      this.config.get<string>('FRONTEND_URL') ??
      'http://localhost:3000';
    const url = `${baseUrl}/documents/${token}`;

    // 7. Fire-and-forget email to patient (never fail the request on email error)
    void this.sendEmailToPatient({
      consultation,
      patientId: consultation.patientId,
      doctorId: input.doctorId,
      doctorName: input.doctorName,
      url,
      code: rawCode,
      expiresAt,
    });

    return { url, code: rawCode, expiresAt };
  }

  private async sendEmailToPatient(params: {
    consultation: import('../../../../consultations/domain/entities/consultation.entity').Consultation;
    patientId: string;
    doctorId: string;
    doctorName: string;
    url: string;
    code: string;
    expiresAt: Date;
  }): Promise<void> {
    try {
      const patient = await this.patientRepo.findById(params.patientId, params.doctorId);
      if (!patient?.email) {
        this.logger.debug('[share] patient has no email — skipping notification');
        return;
      }

      const expiresAtStr = params.expiresAt.toLocaleString('es-VE', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      await this.mailer.sendTemplate('shared_documents_code', patient.email, {
        patientName: patient.fullName,
        doctorName: params.doctorName,
        code: params.code,
        url: params.url,
        expiresAt: expiresAtStr,
      });
    } catch (err) {
      // Fire-and-forget: email failures are logged but never propagated.
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[share] email notification failed: ${message}`);
    }
  }
}
