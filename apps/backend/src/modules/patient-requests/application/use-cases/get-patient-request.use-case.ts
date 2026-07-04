import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  PATIENT_REQUEST_REPOSITORY,
  type IPatientRequestRepository,
} from '../../domain/repositories/patient-request.repository';
import {
  PATIENT_REQUEST_ATTACHMENT_REPOSITORY,
  type IPatientRequestAttachmentRepository,
} from '../../domain/repositories/patient-request-attachment.repository';
import {
  PATIENT_REPOSITORY,
  type IPatientRepository,
} from '../../../patients/domain/repositories/patient.repository';
import { STORAGE_PORT, type IStoragePort } from '../../../storage/application/ports/storage.port';
import { PatientRequestNotFoundError } from '../../domain/errors/patient-request-not-found.error';

export interface PatientRequestAttachmentDto {
  id: string;
  fileName: string;
  contentType: string | null;
  sizeBytes: number | null;
  /** Fresh signed URL (TTL: 1 hour) for private object download. */
  signedUrl: string;
  uploadedAt: string;
}

export interface GetPatientRequestOutput {
  id: string;
  patientId: string;
  patientName: string;
  title: string;
  description: string | null;
  responseText: string | null;
  status: 'pending' | 'fulfilled' | 'revoked';
  createdAt: string;
  fulfilledAt: string | null;
  attachments: PatientRequestAttachmentDto[];
}

export interface GetPatientRequestInput {
  id: string;
  doctorId: string;
}

/**
 * GetPatientRequestUseCase — returns request detail with attachments for the doctor.
 *
 * Generates fresh signed URLs (1-hour TTL) for each private attachment so the
 * doctor can download the patient-uploaded files.
 *
 * Ownership is double-verified: findById is scoped to doctorId (anti-IDOR) and
 * we additionally call canBeAccessedBy on the entity.
 *
 * SECURITY:
 *   - Attachment signed URLs bypass the GetSignedUrlUseCase ownership check
 *     (which validates `<kind>/<userId>/...`) because our paths use
 *     `patient-requests/<requestId>/...`. Ownership is validated here by
 *     confirming the request belongs to the authenticated doctor before
 *     generating any signed URLs.
 *   - Never log PII (patient name, response text).
 */
@Injectable()
export class GetPatientRequestUseCase {
  private readonly logger = new Logger(GetPatientRequestUseCase.name);

  constructor(
    @Inject(PATIENT_REQUEST_REPOSITORY)
    private readonly requestRepo: IPatientRequestRepository,
    @Inject(PATIENT_REQUEST_ATTACHMENT_REPOSITORY)
    private readonly attachmentRepo: IPatientRequestAttachmentRepository,
    @Inject(PATIENT_REPOSITORY)
    private readonly patientRepo: IPatientRepository,
    @Inject(STORAGE_PORT)
    private readonly storage: IStoragePort,
  ) {}

  async execute(input: GetPatientRequestInput): Promise<GetPatientRequestOutput> {
    // 1. Find request scoped to doctor (returns null if not found or wrong doctor)
    const request = await this.requestRepo.findById(input.id, input.doctorId);
    if (!request || !request.canBeAccessedBy(input.doctorId)) {
      throw new PatientRequestNotFoundError();
    }

    // 2. Fetch patient (decrypted name)
    const patient = await this.patientRepo.findById(request.patientId, request.doctorId);
    const patientName = patient?.fullName ?? 'Paciente';

    // 3. Fetch attachments and generate signed URLs in parallel
    const attachments = await this.attachmentRepo.findByRequestId(request.id);
    const attachmentDtos = await Promise.all(
      attachments.map(async (att) => {
        let signedUrl = '';
        try {
          signedUrl = await this.storage.getSignedUrl(att.fileUrl);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(`[get-patient-request] failed to generate signed URL: ${msg}`);
        }

        return {
          id: att.id,
          fileName: att.fileName,
          contentType: att.contentType,
          sizeBytes: att.sizeBytes,
          signedUrl,
          uploadedAt: att.uploadedAt.toISOString(),
        } satisfies PatientRequestAttachmentDto;
      }),
    );

    // 4. Audit log — fire-and-forget (never fail the request on audit error)
    //    Registers the doctor's access to patient PHI (detail + attachments).
    void this.logAccess(input.doctorId, request.patientId);

    return {
      id: request.id,
      patientId: request.patientId,
      patientName,
      title: request.title,
      description: request.description,
      responseText: request.responseText,
      status: request.status,
      createdAt: request.createdAt.toISOString(),
      fulfilledAt: request.fulfilledAt?.toISOString() ?? null,
      attachments: attachmentDtos,
    };
  }

  /**
   * Logs the doctor's access to a patient request (PHI reveal) in
   * access_audit_log via the patient repository.
   *
   * Fire-and-forget: never log PII in the error message.
   */
  private async logAccess(doctorId: string, patientId: string): Promise<void> {
    try {
      await this.patientRepo.logReveal({
        actorId: doctorId,
        actorRole: 'doctor',
        patientId,
        fieldRevealed: 'patient_request_detail',
        ipAddress: null,
        userAgent: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[get-patient-request] audit log failed: ${message}`);
    }
  }
}
