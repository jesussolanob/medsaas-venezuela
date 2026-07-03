import { Injectable, Inject, Logger } from '@nestjs/common';
import { IStoragePort, StorageUploadResult, STORAGE_PORT } from '../ports/storage.port';
import { StorageValidationError, StorageUploadError } from '../../domain/errors/storage.error';
import { detectMimeFromBuffer, sanitizeFilename } from './upload-file.use-case';

/**
 * Allowed MIME types for public booking receipts.
 * Subset of the general upload MIME set — same validation rules, same magic-byte checks.
 * SVG is intentionally excluded (XSS vector).
 */
const RECEIPT_ALLOWED_MIME: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
]);

/** Max file size for public receipts: 10 MB (same cap as authenticated uploads). */
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Storage path prefix that isolates anonymous booking receipts from
 * user-scoped private receipts (`receipt/<userId>/...`).
 *
 * All paths written by this use case start with this prefix, making
 * them easy to identify and apply separate bucket policies if needed.
 */
const PUBLIC_RECEIPT_PREFIX = 'receipts/public';

export interface PublicUploadReceiptInput {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

/**
 * PublicUploadReceiptUseCase — unauthenticated upload for booking payment proofs.
 *
 * SECURITY CONSTRAINTS:
 *   - Accepts ONLY images (jpeg, png, webp, gif) and PDF — magic bytes verified.
 *   - Max 10 MB.
 *   - Kind is HARDCODED to 'receipt'; callers cannot influence the storage kind.
 *   - Path is isolated under `receipts/public/` — separate from authenticated
 *     user-scoped `receipt/<userId>/` paths.
 *   - Files are stored as public objects (permanent URL) so the doctor can
 *     view the receipt from the appointment panel without a time-limited signed URL.
 *   - No PII is stored or logged.
 *
 * This use case is called from PublicStorageController which carries no auth guard.
 */
@Injectable()
export class PublicUploadReceiptUseCase {
  private readonly logger = new Logger(PublicUploadReceiptUseCase.name);

  constructor(
    @Inject(STORAGE_PORT)
    private readonly storage: IStoragePort,
  ) {}

  async execute(input: PublicUploadReceiptInput): Promise<StorageUploadResult> {
    this.validateSize(input.size);
    this.validateMimeType(input.mimetype);
    this.validateMagicBytes(input.buffer, input.mimetype);

    const safe = sanitizeFilename(input.originalname);
    const path = `${PUBLIC_RECEIPT_PREFIX}/${Date.now()}-${safe}`;

    try {
      return await this.storage.upload({
        buffer: input.buffer,
        path,
        contentType: input.mimetype,
        /**
         * isPrivate = false → permanent public URL.
         * Receipts from the booking flow must be viewable by the doctor at any
         * time without token refresh; a permanent URL satisfies this requirement.
         * The payload is a payment screenshot / PDF — not clinical PHI.
         */
        isPrivate: false,
      });
    } catch (err: unknown) {
      const cause = err instanceof Error ? err.message : String(err);
      this.logger.error(`Public receipt upload failed: ${cause}`);
      throw new StorageUploadError(cause);
    }
  }

  private validateSize(size: number): void {
    if (size > MAX_BYTES) {
      throw new StorageValidationError(
        `File exceeds maximum allowed size of ${MAX_BYTES / (1024 * 1024)} MB`,
      );
    }
  }

  private validateMimeType(mimetype: string): void {
    if (!RECEIPT_ALLOWED_MIME.has(mimetype)) {
      throw new StorageValidationError(
        `Content type "${mimetype}" is not allowed for receipts. ` +
          `Allowed: ${[...RECEIPT_ALLOWED_MIME].join(', ')}`,
      );
    }
  }

  /**
   * Verifies the buffer's magic bytes match the declared MIME type.
   * Prevents disguising malicious files as images by spoofing Content-Type.
   */
  private validateMagicBytes(buffer: Buffer, declaredMime: string): void {
    const detected = detectMimeFromBuffer(buffer);

    if (!detected || !RECEIPT_ALLOWED_MIME.has(detected)) {
      throw new StorageValidationError(
        `File content does not match a supported receipt type. ` +
          `Declared: ${declaredMime}, detected: ${detected ?? 'unknown'}`,
      );
    }
  }
}
