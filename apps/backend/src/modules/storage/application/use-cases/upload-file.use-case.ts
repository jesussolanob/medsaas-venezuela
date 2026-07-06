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
 * Detects the MIME type of a buffer by inspecting its magic bytes (file signature).
 *
 * Returns the detected MIME string, or null when the buffer is too short or the
 * signature is not recognised. This is intentionally CJS-compatible and has no
 * external dependencies — it replaces `file-type` (ESM-only since v16).
 *
 * Covered signatures:
 *   JPEG:   FF D8 FF
 *   PNG:    89 50 4E 47 0D 0A 1A 0A
 *   WebP:   RIFF????WEBP  (bytes 0-3 = "RIFF", bytes 8-11 = "WEBP")
 *   GIF:    47 49 46 38   ("GIF8")
 *   PDF:    25 50 44 46   ("%PDF")
 */
export function detectMimeFromBuffer(buffer: Buffer): string | null {
  if (buffer.length < 4) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A (8 bytes)
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
  ) {
    return 'image/png';
  }

  // WebP: RIFF (4 bytes) + 4 bytes size + WEBP (4 bytes)
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
  ) {
    return 'image/webp';
  }

  // GIF: GIF8 (GIF87a or GIF89a)
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
    return 'image/gif';
  }

  // PDF: %PDF
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return 'application/pdf';
  }

  return null;
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
    this.validateMagicBytes(input.buffer, input.mimetype);

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
      // GCS errors are sometimes plain objects (not Error instances), which
      // stringified to the useless "[object Object]". Extract a real message.
      const cause =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null
            ? ((err as { message?: string }).message ?? JSON.stringify(err))
            : String(err);
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
   * Inspects the buffer's magic bytes to verify the file's true MIME type.
   *
   * Rejects files where the detected binary signature does not match a
   * supported type, even if the declared Content-Type is valid. This prevents
   * attackers from disguising malicious files (e.g. HTML, JS) as images by
   * renaming them and sending a spoofed Content-Type header.
   *
   * Implementation uses a hand-rolled CJS-native check (no external dependency)
   * instead of `file-type` (ESM-only in v16+, incompatible with the NestJS CJS
   * build — TypeScript compiles `await import(…)` to a `require()` call which
   * fails at runtime for ESM-only packages).
   *
   * Supported signatures:
   *   JPEG   FF D8 FF
   *   PNG    89 50 4E 47 0D 0A 1A 0A
   *   WebP   52 49 46 46 ?? ?? ?? ?? 57 45 42 50   (RIFF….WEBP)
   *   GIF    47 49 46 38                             (GIF8)
   *   PDF    25 50 44 46                             (%PDF)
   */
  private validateMagicBytes(buffer: Buffer, declaredMime: string): void {
    if (!BINARY_MIME_TYPES.has(declaredMime)) {
      // Non-binary types are not subject to magic-byte inspection.
      return;
    }

    const detected = detectMimeFromBuffer(buffer);

    if (!detected || !ALLOWED_MIME_TYPES.has(detected)) {
      throw new StorageValidationError(
        `File content does not match a supported type. ` +
          `Declared: ${declaredMime}, detected: ${detected ?? 'unknown'}`,
      );
    }
  }
}
