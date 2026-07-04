import type { PatientRequestAttachment } from '../entities/patient-request-attachment.entity';

export const PATIENT_REQUEST_ATTACHMENT_REPOSITORY = Symbol('IPatientRequestAttachmentRepository');

/**
 * Contract for patient_request_attachments persistence.
 */
export interface IPatientRequestAttachmentRepository {
  /** Persist a new attachment record. */
  save(attachment: PatientRequestAttachment): Promise<PatientRequestAttachment>;

  /** Find all attachments for a given request ordered by uploaded_at ASC. */
  findByRequestId(requestId: string): Promise<PatientRequestAttachment[]>;

  /** Count attachments for a given request. */
  countByRequestId(requestId: string): Promise<number>;

  /**
   * Count attachments for multiple requests in a single query (GROUP BY request_id).
   * Returns a record keyed by requestId; missing keys mean 0 attachments.
   */
  countByRequestIds(requestIds: string[]): Promise<Record<string, number>>;
}
