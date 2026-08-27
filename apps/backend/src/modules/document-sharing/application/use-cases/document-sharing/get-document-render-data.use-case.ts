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
import { resignGcsImageUrl } from '../../../../storage/application/helpers/resign-gcs-image.helper';
import { GetConsultationBlocksUseCase } from '../../../../consultation-blocks/application/use-cases/consultation-blocks/get-consultation-blocks.use-case';
import { htmlToPlainText, isProbablyHtml } from '@delta/shared-utils';

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

/**
 * A single resolved block entry for the render — label + metadata needed by
 * MedicalDocumentPdf to render each block section with the correct heading.
 */
export interface RenderConsultationBlock {
  key: string;
  label: string;
  printable: boolean;
  sortOrder: number;
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
  /** Full EHR history for the patient (empty array when the patient has no EHR records). */
  ehrRecords: RenderEhrRecord[];
  /**
   * Resolved consultation blocks for the doctor — provides the label and metadata
   * (printable, sortOrder) needed by MedicalDocumentPdf to render each block section
   * with the correct heading.
   *
   * Only enabled blocks are included, sorted by sort_order ASC.
   * Empty array when the doctor has no blocks configured.
   */
  consultationBlocks: RenderConsultationBlock[];
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
    private readonly getConsultationBlocks: GetConsultationBlocksUseCase,
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
    const [
      consultation,
      prescriptions,
      ehrRecords,
      patient,
      doctorProfile,
      informeTemplate,
      blocksOutput,
    ] = await Promise.all([
      this.consultationRepo.findById(link.consultationId, link.doctorId),
      this.prescriptionRepo.findByConsultation(link.consultationId, link.doctorId),
      // Historia clínica = historial EHR del PACIENTE (no de esta sola consulta),
      // consistente con la descarga del doctor (/api/ehr/patient/:id).
      this.ehrRepo.findByPatient(link.patientId, link.doctorId),
      this.patientRepo.findById(link.patientId, link.doctorId),
      this.doctorProfileRepo.findByDoctorId(link.doctorId),
      this.doctorTemplateRepo.findByDoctorAndType(link.doctorId, 'informe'),
      this.getConsultationBlocks.execute(link.doctorId),
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
        // Strip HTML from block values before sending to PDF renderer.
        // Only string values that look like HTML are converted — non-HTML strings
        // and non-string values are passed through unchanged.
        blocksSnapshot: this.plainTextSnapshot(consultation.blocksSnapshot),
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
      ehrRecords: ehrRecords.map((r) => ({
        id: r.id,
        diagnosis: r.diagnosis,
        treatmentPlan: r.treatmentPlan,
      })),
      consultationBlocks: blocksOutput.resolved.map((b) => ({
        key: b.key,
        label: b.label,
        printable: b.printable,
        sortOrder: b.sortOrder,
      })),
      templateConfig,
    };
  }

  /**
   * Converts HTML-flavoured block values to plain text for PDF rendering.
   *
   * Only string values that `isProbablyHtml` recognises as HTML are processed —
   * plain strings and non-string values (numbers, booleans, null, objects) pass
   * through unchanged. The heuristic is conservative: a false-positive (treating
   * a plain string as HTML) only costs an extra regex pass, which is harmless.
   *
   * @param snapshot - The raw blocks_snapshot, possibly null.
   * @returns A new snapshot with HTML strings converted to plain text, or null.
   */
  private plainTextSnapshot(
    snapshot: Record<string, unknown> | null,
  ): Record<string, unknown> | null {
    if (!snapshot) return null;

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(snapshot)) {
      if (typeof value === 'string' && isProbablyHtml(value)) {
        result[key] = htmlToPlainText(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  /**
   * Resolves a stored logo/signature value to a FRESH signed URL.
   *
   * El valor persistido puede ser (a) un object path de GCS o (b) una URL firmada
   * COMPLETA guardada "hace tiempo". Las URLs firmadas v4 vencen a los 7 días, así
   * que devolver la guardada tal cual entrega una URL 400/403 → la imagen no carga
   * en el PDF compartido (bug: firma/logo ausentes). Por eso re-firmamos siempre:
   *   - URL completa de GCS → `resignGcsImageUrl` extrae el path y firma de nuevo.
   *   - object path pelado → `storage.getSignedUrl`.
   *   - URL no-GCS (CDN/data URI) → se devuelve intacta.
   * Returns null when absent/empty. On error, logs and returns null (una firma/logo
   * ausente no debe romper todo el render).
   */
  private async resolveSignedUrl(path: string | null, field: string): Promise<string | null> {
    if (!path || path.trim() === '') return null;
    try {
      if (path.startsWith('http://') || path.startsWith('https://')) {
        // URL completa: si es de GCS, re-firmar con TTL fresco; si no, dejar igual.
        return await resignGcsImageUrl(path, this.storage);
      }
      // Object path pelado → firmar.
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
