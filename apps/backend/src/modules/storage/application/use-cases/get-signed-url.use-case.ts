import { Injectable, Inject, Logger } from '@nestjs/common';
import { IStoragePort, STORAGE_PORT } from '../ports/storage.port';
import { PRIVATE_KINDS } from './upload-file.use-case';
import { StorageValidationError, StorageUploadError } from '../../domain/errors/storage.error';

export interface GetSignedUrlInput {
  path: string;
  userId: string;
}

export interface GetSignedUrlResult {
  url: string;
  /** TTL in seconds. */
  expiresInSeconds: number;
}

/**
 * GetSignedUrlUseCase — generates a fresh signed URL for a private object.
 *
 * SECURITY (anti-IDOR):
 *   The `path` must start with `<privateKind>/<userId>/` where `userId` matches
 *   the authenticated user (user.sub). A doctor can only generate signed URLs
 *   for their own objects. Any attempt to sign another user's path is rejected
 *   with a StorageValidationError (mapped to HTTP 403 by GlobalExceptionFilter).
 *
 *   Only paths whose leading kind segment belongs to PRIVATE_KINDS are accepted.
 *   Requesting a signed URL for a public kind (avatar, logo) is also rejected —
 *   public objects are always served via their permanent public URL.
 */
@Injectable()
export class GetSignedUrlUseCase {
  private static readonly TTL_SECONDS = 3600;

  private readonly logger = new Logger(GetSignedUrlUseCase.name);

  constructor(
    @Inject(STORAGE_PORT)
    private readonly storage: IStoragePort,
  ) {}

  async execute(input: GetSignedUrlInput): Promise<GetSignedUrlResult> {
    this.validateOwnership(input.path, input.userId);

    try {
      const url = await this.storage.getSignedUrl(input.path);
      return { url, expiresInSeconds: GetSignedUrlUseCase.TTL_SECONDS };
    } catch (err: unknown) {
      const cause = err instanceof Error ? err.message : String(err);
      this.logger.error(`getSignedUrl failed for path "${input.path}": ${cause}`);
      throw new StorageUploadError(cause);
    }
  }

  /**
   * Validates that:
   * 1. The path's leading segment is a private kind (receipt | document | signature).
   * 2. The second segment is exactly the authenticated user's ID.
   *
   * Expected format: `<privateKind>/<userId>/...`
   */
  private validateOwnership(path: string, userId: string): void {
    const segments = path.split('/');
    const kind = segments[0] ?? '';
    const ownerId = segments[1] ?? '';

    if (!PRIVATE_KINDS.has(kind)) {
      throw new StorageValidationError(
        `Path "${path}" does not belong to a private kind. ` +
        `Private kinds: ${[...PRIVATE_KINDS].join(', ')}`,
      );
    }

    if (ownerId !== userId) {
      // Return the same error shape for both "wrong owner" and "not found"
      // to avoid leaking information about other users' files.
      throw new StorageValidationError(
        `Access denied: path does not belong to the authenticated user`,
      );
    }
  }
}
