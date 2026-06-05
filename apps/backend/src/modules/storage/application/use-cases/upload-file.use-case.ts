import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  IStoragePort,
  StorageUploadResult,
  STORAGE_PORT,
} from '../ports/storage.port';
import {
  StorageValidationError,
  StorageUploadError,
} from '../../domain/errors/storage.error';

/** Allowed `kind` values that scope the storage path. */
export type UploadKind = 'avatar' | 'receipt' | 'document' | 'logo' | 'signature';

const ALLOWED_KINDS: ReadonlySet<string> = new Set<UploadKind>([
  'avatar',
  'receipt',
  'document',
  'logo',
  'signature',
]);

/** Max file size: 10 MB */
const MAX_BYTES = 10 * 1024 * 1024;

/** Allowed MIME types (images + PDF). */
const ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
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

    const path = buildStoragePath(input.kind, input.userId, input.originalname);

    try {
      return await this.storage.upload({
        buffer: input.buffer,
        path,
        contentType: input.mimetype,
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
}
