import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Storage } from '@google-cloud/storage';
import type { IStoragePort, StorageUploadInput, StorageUploadResult } from '../../application/ports/storage.port';

/**
 * GcsStorageAdapter — storage adapter for production (Google Cloud Storage).
 *
 * Authenticates via Application Default Credentials (ADC) using the
 * GOOGLE_APPLICATION_CREDENTIALS env var. Objects are uploaded as public-read
 * for Etapa 1 parity with MinIO. Etapa 2 should switch to signed URLs with
 * a CDN for access control.
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

    await file.save(input.buffer, {
      contentType: input.contentType,
      public: true,
    });

    const url = `https://storage.googleapis.com/${this.bucket}/${input.path}`;
    return { url, path: input.path };
  }

  async getSignedUrl(path: string): Promise<string> {
    const [url] = await this.storage
      .bucket(this.bucket)
      .file(path)
      .getSignedUrl({
        action: 'read',
        expires: Date.now() + 60 * 60 * 1000, // 1 hour
      });
    return url;
  }
}
