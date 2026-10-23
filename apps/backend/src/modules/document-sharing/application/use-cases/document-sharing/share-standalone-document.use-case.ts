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
import {
  STANDALONE_DOCUMENT_REPOSITORY,
  type IStandaloneDocumentRepository,
} from '../../../../standalone-documents/domain/repositories/istandalone-document.repository';
import {
  PATIENT_REPOSITORY,
  type IPatientRepository,
} from '../../../../patients/domain/repositories/patient.repository';
import {
  DOCTOR_PROFILE_REPOSITORY,
  type IDoctorProfileRepository,
} from '../../../../doctor-settings/domain/repositories/doctor-profile.repository';
import { MailerService } from '../../../../email/application/services/mailer.service';
import { DocumentLinkNotFoundError } from '../../../domain/errors/document-link-not-found.error';
import { StandaloneDocumentNotIssuedError } from '../../../../standalone-documents/domain/errors/standalone-document-not-issued.error';
import { PatientCedulaRequiredForSharingError } from '../../../domain/errors/patient-cedula-required.error';
import type { StandaloneDocumentType } from '../../../../standalone-documents/domain/entities/standalone-document.entity';
import { formatShareExpiryCaracas } from '../../utils/format-share-expiry-caracas';

export interface ShareStandaloneDocumentInput {
  standaloneDocumentId: string;
  doctorId: string;
  /** @deprecated Use case resolves the doctor display name from the profile. This
   * field is accepted for backward compatibility but is no longer used. */
  doctorName?: string;
}

export interface ShareStandaloneDocumentOutput {
  url: string;
  code: string;
  expiresAt: Date;
}

/**
 * Builds the display name for the doctor shown in patient-facing emails.
 * Mirrors the pattern used in the frontend (ConsultationsClient, standalone-pdf, reminders).
 *
 * Format: "<professionalTitle> <fullName>" (trimmed).
 * Falls back to profile email when fullName is absent, and to a generic label
 * when no profile is available.
 */
function buildDoctorDisplayName(
  profile: { fullName: string; professionalTitle: string | null; email: string } | null,
): string {
  if (profile?.fullName?.trim()) {
    const title = profile.professionalTitle?.trim() ?? '';
    const name = profile.fullName.trim();
    return title ? `${title} ${name}` : name;
  }
  return profile?.email ?? 'Su especialista';
}

/** Maps standalone document type to the docSelection type key expected by the PDF viewer. */
function toDocSelectionType(type: StandaloneDocumentType): string {
  switch (type) {
    case 'recipe':
      return 'recipe';
    case 'paraclinical':
      return 'paraclinical';
    case 'reposo':
      return 'rest';
  }
}

/**
 * ShareStandaloneDocumentUseCase
 *
 * Creates a shared document link for an ISSUED standalone document (recipe /
 * paraclinical / reposo issued outside a consultation).
 *
 * FLOW:
 *   1. Verify the document exists and belongs to the authenticated doctor (anti-IDOR).
 *   2. Assert status === 'issued' (409 STANDALONE_DOCUMENT_NOT_ISSUED otherwise).
 *   3. Assert patient has a cédula (required for verify-code second factor).
 *   4. Generate token + 6-digit code (48 h TTL).
 *   5. Persist link (standaloneDocumentId set, consultationId null) + code.
 *   6. Fire-and-forget email to patient (if they have an email address).
 *   7. Return { url, code, expiresAt }.
 *
 * SECURITY:
 *   - Doctor ownership verified before any write (anti-IDOR).
 *   - Token is crypto.randomBytes(48).toString('base64url') — 384 bits of entropy.
 *   - Code is 6 random decimal digits.
 *   - Email failure does NOT propagate.
 *   - Never log PHI, the code, or the token value.
 *   - Voided documents are rejected (treated identically to non-issued).
 */
@Injectable()
export class ShareStandaloneDocumentUseCase {
  private readonly logger = new Logger(ShareStandaloneDocumentUseCase.name);

  constructor(
    @Inject(SHARED_DOCUMENT_LINK_REPOSITORY)
    private readonly linkRepo: ISharedDocumentLinkRepository,
    @Inject(DOCUMENT_ACCESS_CODE_REPOSITORY)
    private readonly codeRepo: IDocumentAccessCodeRepository,
    @Inject(STANDALONE_DOCUMENT_REPOSITORY)
    private readonly standaloneDocRepo: IStandaloneDocumentRepository,
    @Inject(PATIENT_REPOSITORY)
    private readonly patientRepo: IPatientRepository,
    @Inject(DOCTOR_PROFILE_REPOSITORY)
    private readonly doctorProfileRepo: IDoctorProfileRepository,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  async execute(input: ShareStandaloneDocumentInput): Promise<ShareStandaloneDocumentOutput> {
    // 1. Verify document exists and belongs to the doctor (anti-IDOR)
    const doc = await this.standaloneDocRepo.findById(input.standaloneDocumentId);
    if (!doc || !doc.canBeModifiedBy(input.doctorId)) {
      throw new DocumentLinkNotFoundError();
    }

    // 2. Assert document is issued (not draft or voided)
    if (!doc.isIssued()) {
      throw new StandaloneDocumentNotIssuedError();
    }

    // 3. Assert patient has a cédula — it is the second factor in verify-code.
    //    Without it the link is unusable; fail early with a clear message.
    const patient = await this.patientRepo.findById(doc.patientId, input.doctorId);
    if (!patient?.cedula || !patient.cedula.trim()) {
      throw new PatientCedulaRequiredForSharingError();
    }

    // 4. Generate secure token and 6-digit code
    const token = crypto.randomBytes(48).toString('base64url');
    const rawCode = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    // 5. Build docSelection — the PDF viewer uses this to determine what to render.
    const docSelection = {
      types: [toDocSelectionType(doc.type)],
      informeBlockKeys: [] as string[],
      restContent: null as string | null,
    };

    const link = SharedDocumentLink.createForStandaloneDocument({
      id: randomUUID(),
      standaloneDocumentId: doc.id,
      doctorId: input.doctorId,
      patientId: doc.patientId,
      token,
      docSelection,
      status: 'active',
      failedAttempts: 0,
      lastCodeRequestedAt: null,
      createdAt: new Date(),
    });
    const savedLink = await this.linkRepo.save(link);

    // 5b. Persist code
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

    // 7. Fire-and-forget email to patient
    void this.sendEmailToPatient({
      patientId: doc.patientId,
      doctorId: input.doctorId,
      url,
      code: rawCode,
      expiresAt,
    });

    return { url, code: rawCode, expiresAt };
  }

  private async sendEmailToPatient(params: {
    patientId: string;
    doctorId: string;
    url: string;
    code: string;
    expiresAt: Date;
  }): Promise<void> {
    try {
      const [patient, doctorProfile] = await Promise.all([
        this.patientRepo.findById(params.patientId, params.doctorId),
        this.doctorProfileRepo.findByDoctorId(params.doctorId),
      ]);

      if (!patient?.email) {
        this.logger.debug('[share-standalone] patient has no email — skipping notification');
        return;
      }

      const doctorName = buildDoctorDisplayName(doctorProfile);
      const expiresAtStr = formatShareExpiryCaracas(params.expiresAt);

      await this.mailer.sendTemplate(
        'shared_documents_code',
        patient.email,
        {
          patientName: patient.fullName,
          doctorName,
          code: params.code,
          url: params.url,
          expiresAt: expiresAtStr,
        },
        { type: 'patient', id: params.patientId },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[share-standalone] email notification failed: ${message}`);
    }
  }
}
