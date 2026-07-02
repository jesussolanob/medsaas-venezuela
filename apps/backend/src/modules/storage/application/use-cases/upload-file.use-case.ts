import { Injectable, Inject, Logger } from '@nestjs/common';
import { IStoragePort, StorageUploadResult, STORAGE_PORT } from '../ports/storage.port';
import { StorageValidationError, StorageUploadError } from '../../domain/errors/storage.error';

/** Allowed `kind` values that scope the storage path. */
export type UploadKind = 'avatar' | 'receipt' | 'document' | 'logo' | 'signature';

const ALLOWED_KINDS: ReadonlySet<string> = new Set<UploadKind>([
  'avatar',
  'receipt',
  'document',
  'logo',
  'signature',
]);

/**
 * Kinds that must be stored privately.
 * Uploads return a time-limited signed URL (TTL: 1 hour).
 * Public kinds (avatar, logo, signature) return a permanent public URL.
 *
 * `signature` was previously private but its URL is persisted in `profiles.signature_url`
 * and rendered on generated PDFs/prescriptions — it must remain stable across requests.
 * Medical signatures are not PII under the system's threat model (they are static images
 * of a handwritten mark, equivalent to a logo, and do not contain health data).
 * SVG uploads remain BLOCKED at the MIME type layer (XSS vector) regardless of kind.
 */
export const PRIVATE_KINDS: ReadonlySet<string> = new Set<UploadKind>(['receipt', 'document']);

/** Max file size: 10 MB */
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Allowed MIME types (images + PDF).
 * SVG is intentionally excluded — it allows embedded JavaScript (XSS vector)
 * and has no clinical use case in this system.
 */
const ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
]);

/**
 * MIME types that must have their magic bytes verified against the buffer.
 * PDF and all image types listed here require binary signature inspection.
 */
const BINARY_MIME_TYPES: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
]);

export interface UploadFileInput {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
  kind: string;
  userId: string;
}

/**
 * Sanitizes a filename, keeping only safe characters.
 * Prevents path traversal and shell injection.
 */
export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/**
 * Builds the storage path for a given upload.
 * Format: `<kind>/<userId>/<timestamp>-<sanitizedFilename>`
 */
export function buildStoragePath(kind: string, userId: string, originalname: string): string {
  const safe = sanitizeFilename(originalname);
  return `${kind}/${userId}/${Date.now()}-${safe}`;
}

@Injectable()
export class UploadFileUseCase {
  private readonly logger = new Logger(UploadFileUseCase.name);

  constructor(
    @Inject(STORAGE_PORT)
    private readonly storage: IStoragePort,
  ) {}

  async execute(input: UploadFileInput): Promise<StorageUploadResult> {
    this.validateKind(input.kind);
    this.validateSize(input.size);
    this.validateMimeType(input.mimetype);
    await this.validateMagicBytes(input.buffer, input.mimetype);

    const path = buildStoragePath(input.kind, input.userId, input.originalname);
    const isPrivate = PRIVATE_KINDS.has(input.kind);

    try {
      return await this.storage.upload({
        buffer: input.buffer,
        path,
        contentType: input.mimetype,
        isPrivate,
      });
    } catch (err: unknown) {
      const cause = err instanceof Error ? err.message : String(err);
      this.logger.error(`Storage upload failed: ${cause}`);
      throw new StorageUploadError(cause);
    }
  }

  private validateKind(kind: string): void {
    if (!ALLOWED_KINDS.has(kind)) {
      throw new StorageValidationError(
        `Invalid kind "${kind}". Allowed: ${[...ALLOWED_KINDS].join(', ')}`,
      );
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
    if (!ALLOWED_MIME_TYPES.has(mimetype)) {
      throw new StorageValidationError(
        `Content type "${mimetype}" is not allowed. Allowed: ${[...ALLOWED_MIME_TYPES].join(', ')}`,
      );
    }
  }

  /**
   * Inspects the buffer's magic bytes using the `file-type` package.
   * Rejects files where the detected binary signature does not match a
   * supported type, even if the declared Content-Type is valid.
   *
   * This prevents attackers from disguising malicious files (e.g. HTML, JS)
   * as images by renaming them and sending a spoofed Content-Type header.
   *
   * `file-type` is ESM-only; it is imported dynamically to work inside the
   * CommonJS/NestJS build environment.
   */
  private async validateMagicBytes(buffer: Buffer, declaredMime: string): Promise<void> {
    if (!BINARY_MIME_TYPES.has(declaredMime)) {
      // Non-binary types are not subject to magic-byte inspection.
      return;
    }

    const { fileTypeFromBuffer } = await import('file-type');
    const detected = await fileTypeFromBuffer(buffer);

    if (!detected || !ALLOWED_MIME_TYPES.has(detected.mime)) {
      throw new StorageValidationError(
        `File content does not match a supported type. ` +
          `Declared: ${declaredMime}, detected: ${detected?.mime ?? 'unknown'}`,
      );
    }
  }
}
