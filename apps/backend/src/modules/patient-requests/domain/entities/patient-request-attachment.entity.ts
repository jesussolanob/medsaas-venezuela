/**
 * PatientRequestAttachment domain entity.
 *
 * Represents a file uploaded by the patient in response to a PatientRequest.
 * Files are stored privately in cloud storage — fileUrl contains the storage
 * PATH (not a signed URL); signed URLs are generated on demand by the doctor.
 */
export interface PatientRequestAttachmentCreateParams {
  id: string;
  requestId: string;
  /** Storage path (not a signed URL). e.g. patient-requests/<requestId>/<uuid>-<filename> */
  fileUrl: string;
  fileName: string;
  contentType: string | null;
  sizeBytes: number | null;
  uploadedAt: Date;
}

export class PatientRequestAttachment {
  readonly id: string;
  readonly requestId: string;
  readonly fileUrl: string;
  readonly fileName: string;
  readonly contentType: string | null;
  readonly sizeBytes: number | null;
  readonly uploadedAt: Date;

  constructor(params: PatientRequestAttachmentCreateParams) {
    this.id = params.id;
    this.requestId = params.requestId;
    this.fileUrl = params.fileUrl;
    this.fileName = params.fileName;
    this.contentType = params.contentType;
    this.sizeBytes = params.sizeBytes;
    this.uploadedAt = params.uploadedAt;
  }

  static create(params: PatientRequestAttachmentCreateParams): PatientRequestAttachment {
    return new PatientRequestAttachment(params);
  }
}
