import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  SHARED_DOCUMENT_LINK_REPOSITORY,
  type ISharedDocumentLinkRepository,
} from '../../../domain/repositories/shared-document-link.repository';
import { DocumentLinkNotFoundError } from '../../../domain/errors/document-link-not-found.error';
import { DocumentLinkNotActiveError } from '../../../domain/errors/document-link-not-active.error';
import { SessionTokenValidatorService } from '../../services/session-token-validator.service';
import { PdfGeneratorService } from '../../../infrastructure/pdf/pdf-generator.service';
import {
  CONSULTATION_REPOSITORY,
  type IConsultationRepository,
} from '../../../../consultations/domain/repositories/consultation.repository';
import {
  PRESCRIPTION_REPOSITORY,
  type IPrescriptionRepository,
} from '../../../../prescriptions/domain/repositories/prescription.repository';
import {
  EHR_REPOSITORY,
  type IEhrRepository,
} from '../../../../ehr/domain/repositories/ehr.repository';
import {
  PATIENT_REPOSITORY,
  type IPatientRepository,
} from '../../../../patients/domain/repositories/patient.repository';
import {
  DOCTOR_PROFILE_REPOSITORY,
  type IDoctorProfileRepository,
} from '../../../../doctor-settings/domain/repositories/doctor-profile.repository';

export interface DownloadDocumentInput {
  token: string;
  sessionToken: string;
}

export interface DownloadDocumentOutput {
  pdfBytes: Uint8Array;
  filename: string;
}

/**
 * DownloadDocumentUseCase — validates a session token and generates the PDF.
 *
 * FLOW:
 *   1. Guard: reject empty/undefined sessionToken early.
 *   2. Find the link by token (404 if not found/revoked).
 *   3. Validate the session token (HMAC signature + expiry + linkId match).
 *   4. Fetch consultation, prescriptions, EHR — decrypted by their repos.
 *   5. Fetch patient name and doctor name for PDF header.
 *   6. Generate PDF with only the sections the link specifies.
 *   7. Log the access to access_audit_log (fire-and-forget).
 *   8. Return raw PDF bytes.
 *
 * SECURITY:
 *   - sessionToken validated for presence before any DB read.
 *   - Session token validated cryptographically before loading PHI.
 *   - AUTH_RESOLVE_SECRET is mandatory — no fallback allowed.
 *   - Never log PHI or the token value.
 *   - If the link is revoked between verify-code and download, return 404.
 *   - Audit log uses doctorId as actor_id (the link owner) and 'doctor' role.
 */
@Injectable()
export class DownloadDocumentUseCase {
  private readonly logger = new Logger(DownloadDocumentUseCase.name);

  constructor(
    @Inject(SHARED_DOCUMENT_LINK_REPOSITORY)
    private readonly linkRepo: ISharedDocumentLinkRepository,
    @Inject(CONSULTATION_REPOSITORY)
    private readonly consultationRepo: IConsultationRepository,
    @Inject(PRESCRIPTION_REPOSITORY)
    private readonly prescriptionRepo: IPrescriptionRepository,
    @Inject(EHR_REPOSITORY)
    private readonly ehrRepo: IEhrRepository,
    @Inject(PATIENT_REPOSITORY)
    private readonly patientRepo: IPatientRepository,
    @Inject(DOCTOR_PROFILE_REPOSITORY)
    private readonly doctorProfileRepo: IDoctorProfileRepository,
    private readonly pdfGenerator: PdfGeneratorService,
    private readonly sessionTokenValidator: SessionTokenValidatorService,
  ) {}

  async execute(input: DownloadDocumentInput): Promise<DownloadDocumentOutput> {
    // 1. Find link (presence check is handled inside validateSessionToken below)
    const link = await this.linkRepo.findByToken(input.token);
    if (!link) {
      throw new DocumentLinkNotFoundError();
    }
    if (!link.isActive()) {
      throw new DocumentLinkNotActiveError();
    }

    // 2. Validate session token (presence + HMAC + expiry + resource match)
    this.sessionTokenValidator.validate(input.sessionToken, link.id, input.token);

    // 4. Fetch decrypted consultation (doctorId scoped — anti-IDOR)
    const consultation = await this.consultationRepo.findById(link.consultationId, link.doctorId);
    if (!consultation) {
      this.logger.warn('[download] consultation disappeared after link was created');
      throw new DocumentLinkNotFoundError();
    }

    // 5. Fetch prescriptions and EHR (only if sections require them)
    const prescriptions = link.sections.prescriptions
      ? await this.prescriptionRepo.findByConsultation(link.consultationId, link.doctorId)
      : [];

    const ehrRecord = link.sections.ehr
      ? await this.ehrRepo.findByConsultation(link.consultationId, link.doctorId)
      : null;

    // 6. Fetch patient name and doctor name for PDF header
    const patient = await this.patientRepo.findById(link.patientId, link.doctorId);
    const patientName = patient?.fullName ?? 'Paciente';
    const patientCedula = patient?.cedula ?? null;

    const doctorProfile = await this.doctorProfileRepo.findByDoctorId(link.doctorId);
    const doctorName = doctorProfile?.fullName ?? 'Dr./Dra.';

    // 7. Generate PDF
    this.logger.debug('[download] generating PDF');
    const pdfBytes = await this.pdfGenerator.generate({
      doctorName,
      patientName,
      patientCedula,
      consultationDate: consultation.consultationDate,
      sections: link.sections,
      consultation,
      prescriptions,
      ehrRecord,
    });

    const dateStr = consultation.consultationDate.toISOString().slice(0, 10);
    const filename = `documentos-consulta-${dateStr}.pdf`;

    // 8. Audit log — fire-and-forget (never fail download on audit error)
    void this.logDownloadAccess(link.doctorId, link.patientId, link.sections);

    return { pdfBytes, filename };
  }

  private async logDownloadAccess(
    doctorId: string,
    patientId: string,
    sections: { report: boolean; prescriptions: boolean; ehr: boolean },
  ): Promise<void> {
    try {
      const sectionsLabel = [
        sections.report ? 'report' : null,
        sections.prescriptions ? 'prescriptions' : null,
        sections.ehr ? 'ehr' : null,
      ]
        .filter(Boolean)
        .join(',');

      await this.patientRepo.logReveal({
        actorId: doctorId,
        actorRole: 'doctor',
        patientId,
        fieldRevealed: `shared_document_download:${sectionsLabel}`,
        ipAddress: null,
        userAgent: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[download] audit log failed: ${message}`);
    }
  }
}
