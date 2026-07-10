import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  SHARED_DOCUMENT_LINK_REPOSITORY,
  type ISharedDocumentLinkRepository,
} from '../../../domain/repositories/shared-document-link.repository';
import type {
  DocSelection,
  DocumentSections,
} from '../../../domain/entities/shared-document-link.entity';
import { DocumentLinkNotFoundError } from '../../../domain/errors/document-link-not-found.error';
import { DocumentLinkNotActiveError } from '../../../domain/errors/document-link-not-active.error';
import { SessionTokenValidatorService } from '../../services/session-token-validator.service';
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
import {
  DOCTOR_TEMPLATE_REPOSITORY,
  type IDoctorTemplateRepository,
} from '../../../../doctor-templates/domain/repositories/doctor-template.repository';
import {
  STORAGE_PORT,
  type IStoragePort,
} from '../../../../storage/application/ports/storage.port';

export interface GetDocumentRenderDataInput {
  token: string;
  sessionToken: string;
}

/** Template configuration for PDF rendering — sourced from the 'informe' template. */
export interface RenderTemplateConfig {
  headerText: string;
  footerText: string;
  primaryColor: string;
  fontFamily: string;
  showLogo: boolean;
  showSignature: boolean;
  /** Usable URL (already resolved/signed) for the logo image. Null if not set. */
  logoUrl: string | null;
  /** Usable URL (already resolved/signed) for the signature image. Null if not set. */
  signatureUrl: string | null;
}

/** Doctor profile data returned for the render header. */
export interface RenderDoctorProfile {
  fullName: string;
  professionalTitle: string | null;
  specialty: string | null;
  licenseNumber: string | null;
  /** Usable URL (signed) for the doctor's logo. Null if not set. */
  logoUrl: string | null;
  /** Usable URL (signed) for the doctor's signature. Null if not set. */
  signatureUrl: string | null;
}

/** Patient data (masked: fullName + cedula only — render does not expose all PII). */
export interface RenderPatientData {
  fullName: string;
  cedula: string | null;
}

/** Prescription item for render. */
export interface RenderPrescriptionItem {
  id: string;
  medication: string;
  dosage: string | null;
  frequency: string | null;
  duration: string | null;
  notes: string | null;
}

/** EHR record for render. */
export interface RenderEhrRecord {
  id: string;
  diagnosis: string | null;
  treatmentPlan: string | null;
}

/** Consultation data for render — includes live clinical fields and blocks snapshot. */
export interface RenderConsultationData {
  id: string;
  consultationCode: string;
  consultationDate: string; // ISO 8601
  chiefComplaint: string | null;
  diagnosis: string | null;
  treatment: string | null;
  notes: string | null;
  /** JSONB blocks snapshot keyed by block_key → value. Null when not present. */
  blocksSnapshot: Record<string, unknown> | null;
}

/** Full render-data payload returned to the frontend. */
export interface DocumentRenderData {
  /** Link-level section flags (legacy backward-compat). */
  sections: DocumentSections;
  /**
   * New unified document selection (null for links created before this feature).
   * When present, the frontend uses this for rendering; otherwise falls back to `sections`.
   */
  docSelection: DocSelection | null;
  consultation: RenderConsultationData;
  patient: RenderPatientData;
  doctor: RenderDoctorProfile;
  prescriptions: RenderPrescriptionItem[];
  ehrRecord: RenderEhrRecord | null;
  /**
   * Template config for the 'informe' type.
   *
   * Design decision: the 'informe' template is fetched server-side so the patient-facing
   * render URL is self-contained (no extra authenticated fetch required from the browser).
   * When no template is configured, defaults are derived from the DoctorProfile fields
   * (logoUrl / signatureUrl / licenseNumber) so the frontend can fall back gracefully.
   *
   * NOTE: logoUrl / signatureUrl values are GCS object PATHS in the database. They are
   * resolved to fresh signed URLs (1 h TTL) here before being returned. If the path
   * is null or empty the field is returned as null.
   */
  templateConfig: RenderTemplateConfig | null;
}

/**
 * GetDocumentRenderDataUseCase — returns live clinical data for patient-facing rendering.
 *
 * FLOW:
 *   1. Find the link by token; reject if not found or inactive.
 *   2. Validate session token (HMAC + expiry + resource match).
 *   3. Fetch all data IN PARALLEL: consultation, prescriptions, EHR, patient, doctor
 *      profile, and 'informe' template — all doctorId-scoped (anti-IDOR).
 *   4. Resolve signed URLs for logo and signature (fire-and-forget failures → null).
 *   5. Log audit entry (fire-and-forget).
 *   6. Return the full render payload.
 *
 * SECURITY:
 *   - Session token validated before any PHI is loaded.
 *   - doctorId always comes from the link, never from input (anti-IDOR).
 *   - Never log PII (fullName, cedula, diagnosis, treatment, medication).
 *   - Audit log uses doctorId as actorId and role 'doctor' (same as download).
 */
@Injectable()
export class GetDocumentRenderDataUseCase {
  private readonly logger = new Logger(GetDocumentRenderDataUseCase.name);

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
    @Inject(DOCTOR_TEMPLATE_REPOSITORY)
    private readonly doctorTemplateRepo: IDoctorTemplateRepository,
    @Inject(STORAGE_PORT)
    private readonly storage: IStoragePort,
    private readonly sessionTokenValidator: SessionTokenValidatorService,
  ) {}

  async execute(input: GetDocumentRenderDataInput): Promise<DocumentRenderData> {
    // 1. Find link
    const link = await this.linkRepo.findByToken(input.token);
    if (!link) {
      throw new DocumentLinkNotFoundError();
    }
    if (!link.isActive()) {
      throw new DocumentLinkNotActiveError();
    }

    // 2. Validate session token (presence + HMAC + expiry + resource match)
    this.sessionTokenValidator.validate(input.sessionToken, link.id, input.token);

    // 3. Fetch all live data in parallel (doctorId scoped throughout — anti-IDOR)
    const [consultation, prescriptions, ehrRecord, patient, doctorProfile, informeTemplate] =
      await Promise.all([
        this.consultationRepo.findById(link.consultationId, link.doctorId),
        this.prescriptionRepo.findByConsultation(link.consultationId, link.doctorId),
        this.ehrRepo.findByConsultation(link.consultationId, link.doctorId),
        this.patientRepo.findById(link.patientId, link.doctorId),
        this.doctorProfileRepo.findByDoctorId(link.doctorId),
        this.doctorTemplateRepo.findByDoctorAndType(link.doctorId, 'informe'),
      ]);

    if (!consultation) {
      this.logger.warn('[render-data] consultation not found for active link');
      throw new DocumentLinkNotFoundError();
    }

    // 4. Resolve signed URLs for logo and signature
    const [logoUrl, signatureUrl, templateLogoUrl, templateSignatureUrl] = await Promise.all([
      this.resolveSignedUrl(doctorProfile?.logoUrl ?? null, 'doctor.logoUrl'),
      this.resolveSignedUrl(doctorProfile?.signatureUrl ?? null, 'doctor.signatureUrl'),
      this.resolveSignedUrl(informeTemplate?.logoUrl ?? null, 'template.logoUrl'),
      this.resolveSignedUrl(informeTemplate?.signatureUrl ?? null, 'template.signatureUrl'),
    ]);

    // 5. Audit log — fire-and-forget
    void this.logRenderAccess(link.doctorId, link.patientId, link.sections);

    // 6. Build and return the render payload
    const doctor: RenderDoctorProfile = {
      fullName: doctorProfile?.fullName ?? 'Dr./Dra.',
      professionalTitle: doctorProfile?.professionalTitle ?? null,
      specialty: doctorProfile?.specialty ?? null,
      licenseNumber: doctorProfile?.licenseNumber ?? null,
      logoUrl,
      signatureUrl,
    };

    const templateConfig: RenderTemplateConfig | null = informeTemplate
      ? {
          headerText: informeTemplate.headerText,
          footerText: informeTemplate.footerText,
          primaryColor: informeTemplate.primaryColor,
          fontFamily: informeTemplate.fontFamily,
          showLogo: informeTemplate.showLogo,
          showSignature: informeTemplate.showSignature,
          logoUrl: templateLogoUrl,
          signatureUrl: templateSignatureUrl,
        }
      : null;

    return {
      sections: link.sections,
      docSelection: link.docSelection,
      consultation: {
        id: consultation.id,
        consultationCode: consultation.consultationCode,
        consultationDate: consultation.consultationDate.toISOString(),
        chiefComplaint: consultation.chiefComplaint,
        diagnosis: consultation.diagnosis,
        treatment: consultation.treatment,
        notes: consultation.notes,
        blocksSnapshot: consultation.blocksSnapshot,
      },
      patient: {
        fullName: patient?.fullName ?? 'Paciente',
        cedula: patient?.cedula ?? null,
      },
      doctor,
      prescriptions: prescriptions.map((p) => ({
        id: p.id,
        medication: p.medication,
        dosage: p.dosage,
        frequency: p.frequency,
        duration: p.duration,
        notes: p.notes,
      })),
      ehrRecord: ehrRecord
        ? {
            id: ehrRecord.id,
            diagnosis: ehrRecord.diagnosis,
            treatmentPlan: ehrRecord.treatmentPlan,
          }
        : null,
      templateConfig,
    };
  }

  /**
   * Resolves a stored GCS object path to a signed URL.
   * Returns null when the path is absent/empty. On error, logs and returns null
   * (a missing logo/signature should not fail the whole render).
   */
  private async resolveSignedUrl(path: string | null, field: string): Promise<string | null> {
    if (!path || path.trim() === '') return null;
    // If the stored value is already a full URL (legacy absolute path), return as-is.
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    try {
      return await this.storage.getSignedUrl(path);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[render-data] failed to sign URL for ${field}: ${message}`);
      return null;
    }
  }

  private async logRenderAccess(
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
        fieldRevealed: `shared_document_render:${sectionsLabel}`,
        ipAddress: null,
        userAgent: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[render-data] audit log failed: ${message}`);
    }
  }
}
