import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
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
import type { AttachmentSnapshot } from '../../../domain/entities/shared-document-link.entity';
import { DocumentAccessCode } from '../../../domain/entities/document-access-code.entity';
import { NoShareContentError } from '../../../domain/errors/no-share-content.error';
import { DocumentLinkNotFoundError } from '../../../domain/errors/document-link-not-found.error';
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
import {
  DOCTOR_PROFILE_REPOSITORY,
  type IDoctorProfileRepository,
} from '../../../../doctor-settings/domain/repositories/doctor-profile.repository';
import { MailerService } from '../../../../email/application/services/mailer.service';
import { formatShareExpiryCaracas } from '../../utils/format-share-expiry-caracas';
import { buildDoctorDisplayName } from '../../utils/build-doctor-display-name';
import {
  DOCTOR_DOCUMENT_FILE_REPOSITORY,
  type IDoctorDocumentFileRepository,
} from '../../../../doctor-document-files/domain/repositories/doctor-document-file.repository';
import { DoctorDocumentFileInvalidPathError } from '../../../../doctor-document-files/domain/errors/doctor-document-file-invalid-path.error';

/** Max attachments per link. */
const MAX_ATTACHMENTS = 10;
/** Max total attachment size per link (25 MB). */
const MAX_TOTAL_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/** MIME types allowed for upload-only attachments. */
const ATTACHMENT_ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export interface ShareConsultationInput {
  consultationId: string;
  doctorId: string;
  dto: ShareConsultationDto;
  /** @deprecated Use case resolves the doctor display name from the profile. This
   * field is accepted for backward compatibility but is no longer used. */
  doctorName?: string;
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
 *   2. Validate at least one section or one attachment is selected.
 *   3. Resolve attachments: validate library IDs (ownership) and upload paths.
 *   4. Generate a 48-byte URL-safe token and a 6-digit access code (48h TTL).
 *   5. Persist the link (with attachment snapshot) and the code.
 *   6. Fire-and-forget email to the patient (if they have one).
 *   7. Return { url, code, expiresAt }.
 *
 * SECURITY:
 *   - Doctor ownership verified before any write (anti-IDOR).
 *   - Token is crypto.randomBytes(48).toString('base64url') — 384 bits of entropy.
 *   - Code is 6 random decimal digits.
 *   - Library file IDs are verified against the doctor's own library.
 *   - Upload filePaths must start with `document/<doctorId>/` (no `..`).
 *   - storagePaths for library items come from the DB, never from the client.
 *   - Email failure does NOT propagate.
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
    @Inject(DOCTOR_PROFILE_REPOSITORY)
    private readonly doctorProfileRepo: IDoctorProfileRepository,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
    @Optional()
    @Inject(DOCTOR_DOCUMENT_FILE_REPOSITORY)
    private readonly docFileRepo?: IDoctorDocumentFileRepository,
  ) {}

  async execute(input: ShareConsultationInput): Promise<ShareConsultationOutput> {
    // 1. Verify consultation ownership (anti-IDOR)
    const consultation = await this.consultationRepo.findById(input.consultationId, input.doctorId);
    if (!consultation || !consultation.canBeModifiedBy(input.doctorId)) {
      throw new ConsultationNotOwnedError();
    }

    // 1b. The patient must have a cédula on file — it is the second factor.
    const patient = await this.patientRepo.findById(consultation.patientId, input.doctorId);
    if (!patient?.cedula || !patient.cedula.trim()) {
      throw new PatientCedulaRequiredForSharingError();
    }

    // 2. Validate at least one section or one attachment.
    const sections = {
      report: input.dto.sections?.report ?? false,
      prescriptions: input.dto.sections?.prescriptions ?? false,
      ehr: input.dto.sections?.ehr ?? false,
    };
    const hasDocSelection = (input.dto.doc_selection?.types?.length ?? 0) > 0;
    const hasAttachments =
      (input.dto.attachments?.libraryFileIds?.length ?? 0) > 0 ||
      (input.dto.attachments?.uploads?.length ?? 0) > 0;
    const hasLegacySections = sections.report || sections.prescriptions || sections.ehr;

    if (!hasDocSelection && !hasAttachments && !hasLegacySections) {
      throw new NoShareContentError();
    }

    // 3. Resolve attachments snapshot
    const attachments = await this.resolveAttachments(input.doctorId, input.dto);

    // 4. Generate secure token and 6-digit code
    const token = crypto.randomBytes(48).toString('base64url');
    const rawCode = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    // 5. Persist link
    const docSelection = input.dto.doc_selection
      ? {
          types: input.dto.doc_selection.types as string[],
          informeBlockKeys: input.dto.doc_selection.informeBlockKeys ?? [],
          restContent: input.dto.doc_selection.restContent ?? null,
        }
      : null;

    const link = SharedDocumentLink.create({
      id: randomUUID(),
      consultationId: input.consultationId,
      doctorId: input.doctorId,
      patientId: consultation.patientId,
      token,
      sections,
      docSelection,
      attachments,
      status: 'active',
      failedAttempts: 0,
      lastCodeRequestedAt: null,
      createdAt: new Date(),
    });
    const savedLink = await this.linkRepo.save(link);

    // 6. Persist code
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

    // 7. Resolve public URL
    const baseUrl =
      this.config.get<string>('APP_BASE_URL') ??
      this.config.get<string>('FRONTEND_URL') ??
      'http://localhost:3000';
    const url = `${baseUrl}/documents/${token}`;

    // 8. Fire-and-forget email to patient (never fail the request on email error)
    void this.sendEmailToPatient({
      consultation,
      patientId: consultation.patientId,
      doctorId: input.doctorId,
      url,
      code: rawCode,
      expiresAt,
    });

    return { url, code: rawCode, expiresAt };
  }

  // ---------------------------------------------------------------------------
  // Attachment resolution
  // ---------------------------------------------------------------------------

  /**
   * Resolves the attachment input into a frozen AttachmentSnapshot[].
   *
   * Library items: IDs are verified against the doctor's own library DB rows —
   *   the storagePath is NEVER taken from the client, always from the DB.
   * Upload items: filePath is validated to start with `document/<doctorId>/`.
   *
   * Returns null when no attachments were requested.
   * Enforces MAX_ATTACHMENTS and MAX_TOTAL_ATTACHMENT_BYTES.
   */
  private async resolveAttachments(
    doctorId: string,
    dto: ShareConsultationDto,
  ): Promise<AttachmentSnapshot[] | null> {
    const libraryIds = dto.attachments?.libraryFileIds ?? [];
    const uploads = dto.attachments?.uploads ?? [];

    if (libraryIds.length === 0 && uploads.length === 0) return null;

    const snapshots: AttachmentSnapshot[] = [];

    // Resolve library files from DB (ownership verified by the query scope)
    if (libraryIds.length > 0) {
      if (!this.docFileRepo) {
        this.logger.warn('[share] docFileRepo not injected but library IDs provided — skipping');
      } else {
        const libFiles = await this.docFileRepo.findByIdsAndDoctor(libraryIds, doctorId);
        // Reject if any requested ID was not found (deleted or not owned) — anti-IDOR
        if (libFiles.length !== libraryIds.length) {
          throw new DocumentLinkNotFoundError();
        }
        for (const f of libFiles) {
          snapshots.push({
            name: f.name,
            storagePath: f.storagePath,
            mimeType: f.mimeType,
            sizeBytes: f.sizeBytes,
            source: 'library',
            libraryFileId: f.id,
          });
        }
      }
    }

    // Validate and add upload-only files
    for (const up of uploads) {
      if (!ATTACHMENT_ALLOWED_MIME_TYPES.has(up.mimeType)) {
        throw new DoctorDocumentFileInvalidPathError();
      }
      this.assertValidUploadPath(up.filePath, doctorId);
      snapshots.push({
        name: up.name,
        storagePath: up.filePath,
        mimeType: up.mimeType,
        sizeBytes: up.sizeBytes,
        source: 'upload',
      });
    }

    // Enforce limits
    if (snapshots.length > MAX_ATTACHMENTS) {
      throw new NoShareContentError(); // reused — 10-attachment limit
    }
    const totalBytes = snapshots.reduce((sum, s) => sum + s.sizeBytes, 0);
    if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
      throw new NoShareContentError(); // reused — 25 MB limit
    }

    return snapshots.length > 0 ? snapshots : null;
  }

  /**
   * Validates that an upload filePath starts with `document/<doctorId>/`
   * and contains no path traversal.
   */
  private assertValidUploadPath(filePath: string, doctorId: string): void {
    const requiredPrefix = `document/${doctorId}/`;
    if (!filePath.startsWith(requiredPrefix) || filePath.includes('..')) {
      throw new DoctorDocumentFileInvalidPathError();
    }
  }

  // ---------------------------------------------------------------------------
  // Email
  // ---------------------------------------------------------------------------

  private async sendEmailToPatient(params: {
    consultation: import('../../../../consultations/domain/entities/consultation.entity').Consultation;
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
        this.logger.debug('[share] patient has no email — skipping notification');
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
      this.logger.warn(`[share] email notification failed: ${message}`);
    }
  }
}
