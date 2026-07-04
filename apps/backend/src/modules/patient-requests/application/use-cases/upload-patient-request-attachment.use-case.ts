import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  PATIENT_REQUEST_REPOSITORY,
  type IPatientRequestRepository,
} from '../../domain/repositories/patient-request.repository';
import {
  PATIENT_REQUEST_ATTACHMENT_REPOSITORY,
  type IPatientRequestAttachmentRepository,
} from '../../domain/repositories/patient-request-attachment.repository';
import { PatientRequestAttachment } from '../../domain/entities/patient-request-attachment.entity';
import { PatientRequestNotFoundError } from '../../domain/errors/patient-request-not-found.error';
import { PatientRequestNotPendingError } from '../../domain/errors/patient-request-not-pending.error';
import { InvalidSessionTokenError } from '../../domain/errors/invalid-session-token.error';
import { STORAGE_PORT, type IStoragePort } from '../../../storage/application/ports/storage.port';
import {
  StorageValidationError,
  StorageUploadError,
} from '../../../storage/domain/errors/storage.error';
import { PatientRequestSessionService } from '../services/patient-request-session.service';

/** Max file size: 10 MB */
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * MIME types allowed for patient attachments.
 * GIF excluded (no clinical value). SVG excluded (XSS vector).
 */
const ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

export interface UploadPatientRequestAttachmentInput {
  token: string;
  sessionToken: string;
  file: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
    size: number;
  };
}

export interface UploadPatientRequestAttachmentOutput {
  id: string;
  fileName: string;
}

/**
 * UploadPatientRequestAttachmentUseCase — stores a file uploaded by the patient.
 *
 * FLOW:
 *   1. Validate session token presence.
 *   2. Find request by token.
 *   3. Verify request is pending.
 *   4. Validate session token (HMAC + expiry + resource match) via session service.
 *   5. Validate file: MIME allowlist, size, magic bytes vs declared MIME.
 *   6. Upload to PRIVATE storage: path = patient-requests/<requestId>/<uuid>-<filename>
 *   7. Persist attachment record (storing the path and DETECTED MIME, not client-declared).
 *   8. Return { id, fileName }.
 *
 * SECURITY:
 *   - Files are stored privately (isPrivate: true) — never public.
 *   - Session token validated via PatientRequestSessionService before loading any PHI.
 *   - MIME allowlist + magic-byte cross-validation prevents disguised malicious files.
 *   - Stored content_type is the DETECTED mime (from magic bytes), not the client claim.
 *   - Never log the session token or file contents.
 *   - Storage failures surface as 502 (external dependency), not 422.
 */
@Injectable()
export class UploadPatientRequestAttachmentUseCase {
  private readonly logger = new Logger(UploadPatientRequestAttachmentUseCase.name);

  constructor(
    @Inject(PATIENT_REQUEST_REPOSITORY)
    private readonly requestRepo: IPatientRequestRepository,
    @Inject(PATIENT_REQUEST_ATTACHMENT_REPOSITORY)
    private readonly attachmentRepo: IPatientRequestAttachmentRepository,
    @Inject(STORAGE_PORT)
    private readonly storage: IStoragePort,
    private readonly sessionService: PatientRequestSessionService,
  ) {}

  async execute(
    input: UploadPatientRequestAttachmentInput,
  ): Promise<UploadPatientRequestAttachmentOutput> {
    // 1. Validate session token presence
    if (!input.sessionToken || input.sessionToken.trim() === '') {
      throw new InvalidSessionTokenError();
    }

    // 2. Find request by token
    const request = await this.requestRepo.findByToken(input.token);
    if (!request) {
      throw new PatientRequestNotFoundError();
    }

    // 3. Verify request is pending
    if (!request.isPending()) {
      throw new PatientRequestNotPendingError();
    }

    // 4. Validate session token via session service
    this.sessionService.validate(input.sessionToken, request.id, input.token);

    // 5. Validate file
    this.validateMimeType(input.file.mimetype);
    this.validateSize(input.file.size);
    // detectAndValidateMagicBytes checks detected === declared and returns the detected mime
    const detectedMime = this.detectAndValidateMagicBytes(input.file.buffer, input.file.mimetype);

    // 6. Build private storage path and upload
    const safeFilename = sanitizeFilename(input.file.originalname);
    const path = `patient-requests/${request.id}/${randomUUID()}-${safeFilename}`;

    let storagePath: string;
    try {
      const result = await this.storage.upload({
        buffer: input.file.buffer,
        path,
        contentType: detectedMime,
        isPrivate: true,
      });
      storagePath = result.path;
    } catch (err: unknown) {
      const cause = err instanceof Error ? err.message : String(err);
      this.logger.error(`Storage upload failed for patient request attachment: ${cause}`);
      // 502 Bad Gateway — storage is an external dependency failure, not client validation
      throw new StorageUploadError(cause);
    }

    // 7. Persist attachment record (use detectedMime — never the client-declared mime)
    const attachment = PatientRequestAttachment.create({
      id: randomUUID(),
      requestId: request.id,
      fileUrl: storagePath,
      fileName: safeFilename,
      contentType: detectedMime,
      sizeBytes: input.file.size,
      uploadedAt: new Date(),
    });
    const saved = await this.attachmentRepo.save(attachment);

    return { id: saved.id, fileName: saved.fileName };
  }

  private validateMimeType(mimetype: string): void {
    if (!ALLOWED_MIME_TYPES.has(mimetype)) {
      throw new StorageValidationError(
        `Tipo de archivo no permitido. Tipos válidos: ${[...ALLOWED_MIME_TYPES].join(', ')}`,
      );
    }
  }

  private validateSize(size: number): void {
    if (size > MAX_BYTES) {
      throw new StorageValidationError(
        `El archivo supera el tamaño máximo de ${MAX_BYTES / (1024 * 1024)} MB`,
      );
    }
  }

  /**
   * Detects the actual MIME type from magic bytes, validates against the
   * allowlist, and confirms it matches the client-declared MIME.
   *
   * SECURITY: Prevents disguised files (e.g. HTML renamed as .pdf) AND
   * prevents client-declared MIME from overriding the detected type.
   *
   * @returns The detected MIME type (to be stored as content_type).
   * @throws {StorageValidationError} on unknown bytes, disallowed type, or mismatch.
   */
  private detectAndValidateMagicBytes(buffer: Buffer, declaredMime: string): string {
    const detected = detectMimeFromBuffer(buffer);

    if (!detected || !ALLOWED_MIME_TYPES.has(detected)) {
      throw new StorageValidationError(
        `El contenido del archivo no corresponde a un tipo permitido. ` +
          `Tipos válidos: ${[...ALLOWED_MIME_TYPES].join(', ')}`,
      );
    }

    if (detected !== declaredMime) {
      throw new StorageValidationError(
        `El contenido del archivo no coincide con el tipo declarado. ` +
          `Declarado: ${declaredMime}, detectado: ${detected}`,
      );
    }

    return detected;
  }
}

// ---------------------------------------------------------------------------
// File validation utilities (inlined — no external deps, no ESM-only packages)
// ---------------------------------------------------------------------------

/**
 * Detects the MIME type of a buffer by inspecting its magic bytes.
 * Returns null when the buffer is too short or the signature is not recognised.
 */
export function detectMimeFromBuffer(buffer: Buffer): string | null {
  if (buffer.length < 4) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  )
    return 'image/png';

  // WebP: RIFF....WEBP
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  )
    return 'image/webp';

  // PDF: %PDF
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return 'application/pdf';
  }

  return null;
}

/**
 * Sanitizes a filename, keeping only safe characters.
 * Dots are preserved to maintain file extensions (e.g. "report.pdf" stays intact).
 * Path separators (/ and \) and other shell-unsafe chars are replaced with underscore.
 */
export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}
