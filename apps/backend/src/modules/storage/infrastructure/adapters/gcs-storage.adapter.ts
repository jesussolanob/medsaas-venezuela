import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Storage } from '@google-cloud/storage';
import type {
  IStoragePort,
  StorageUploadInput,
  StorageUploadResult,
} from '../../application/ports/storage.port';

/**
 * GcsStorageAdapter — storage adapter for production (Google Cloud Storage).
 *
 * Authenticates via Application Default Credentials (ADC) using the
 * GOOGLE_APPLICATION_CREDENTIALS env var.
 *
 * PUBLIC kinds (avatar, logo):
 *   Objects are uploaded with `public: true` and served via the canonical
 *   GCS public URL (permanent, no expiry).
 *
 * PRIVATE kinds (receipt, document, signature):
 *   Objects are NOT made public. A v4 signed URL (action: read, TTL: 1 hour)
 *   is generated after upload and returned as the `url` field.
 *
 * IMPORTANT: Initialization errors are caught and logged as warnings so the
 * boot sequence is not interrupted.
 */
@Injectable()
export class GcsStorageAdapter implements IStoragePort, OnModuleInit {
  private readonly logger = new Logger(GcsStorageAdapter.name);
  private readonly storage: Storage;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    const projectId = this.config.get<string>('GCS_PROJECT_ID');

    this.bucket = this.config.get<string>('GCS_BUCKET', '');
    this.storage = new Storage({ projectId });
  }

  async onModuleInit(): Promise<void> {
    try {
      const bucketRef = this.storage.bucket(this.bucket);
      const [exists] = await bucketRef.exists();
      if (exists) {
        this.logger.log(`GCS adapter ready — bucket: ${this.bucket}`);
      } else {
        this.logger.warn(`GCS bucket "${this.bucket}" does not exist. Uploads will fail.`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `GCS not available at startup (${msg}). ` +
          'Ensure GOOGLE_APPLICATION_CREDENTIALS and GCS_BUCKET are set correctly.',
      );
    }
  }

  async upload(input: StorageUploadInput): Promise<StorageUploadResult> {
    const file = this.storage.bucket(this.bucket).file(input.path);

    // NOTE: the bucket has Uniform Bucket-Level Access (UBLA) enabled, so
    // per-object ACLs (`public: true`) are rejected by GCS (this crashed all
    // avatar/logo uploads). We never set object ACLs. Public kinds are served
    // via a long-lived signed URL instead of a permanent public URL — the
    // bucket can't be made public because it also holds private patient docs.
    await file.save(input.buffer, {
      contentType: input.contentType,
    });

    // Private kinds (receipt, document, signature) get a short-lived link;
    // public kinds (avatar, logo) get a long-lived one (V4 max is 7 days).
    const ttlMs = input.isPrivate ? 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
    const url = await this.getSignedUrl(input.path, ttlMs);
    return { url, path: input.path };
  }

  /**
   * Returns a v4 signed URL. Default TTL 1 hour; callers may request longer
   * (up to the V4 maximum of 7 days) for public assets.
   * Used for private objects and for the GET /api/storage/signed-url endpoint.
   */
  async getSignedUrl(path: string, ttlMs = 60 * 60 * 1000): Promise<string> {
    const [url] = await this.storage
      .bucket(this.bucket)
      .file(path)
      .getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + ttlMs,
      });
    return url;
  }
}
