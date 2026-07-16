import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';
import type {
  IStoragePort,
  StorageUploadInput,
  StorageUploadResult,
} from '../../application/ports/storage.port';

/**
 * MinioStorageAdapter — storage adapter for local development (MinIO).
 *
 * On module init, ensures the configured bucket exists with a selective
 * public-read policy: only `avatar/*` and `logo/*` prefixes are public.
 * All other prefixes (receipt, document, signature) remain private and
 * are served via pre-signed URLs (TTL: 1 hour).
 *
 * SECURITY:
 *   - MINIO_ACCESS_KEY and MINIO_SECRET_KEY are required — boot fails with
 *     a clear error if either is missing (via ConfigService.getOrThrow).
 *   - Connection errors during onModuleInit are caught and logged as
 *     warnings so the server can start even when MinIO is temporarily
 *     unavailable (e.g. Docker not yet healthy).
 */
@Injectable()
export class MinioStorageAdapter implements IStoragePort, OnModuleInit {
  private readonly logger = new Logger(MinioStorageAdapter.name);
  private readonly client: Minio.Client;
  private readonly bucket: string;
  private readonly publicUrl: string;

  /** Kinds whose objects are stored with public-read access. */
  private static readonly PUBLIC_PREFIXES = ['avatar', 'logo'] as const;

  constructor(private readonly config: ConfigService) {
    const endpoint = this.config.get<string>('MINIO_ENDPOINT', 'localhost');
    const port = parseInt(this.config.get<string>('MINIO_PORT', '9000'), 10);
    const useSSL = this.config.get<string>('MINIO_USE_SSL', 'false') === 'true';

    // Credentials must be explicitly configured — no functional defaults.
    const accessKey = this.config.getOrThrow<string>('MINIO_ACCESS_KEY');
    const secretKey = this.config.getOrThrow<string>('MINIO_SECRET_KEY');

    this.bucket = this.config.get<string>('MINIO_BUCKET', 'delta-uploads');
    this.publicUrl = this.config.get<string>(
      'MINIO_PUBLIC_URL',
      `http://${endpoint}:${port}/${this.bucket}`,
    );

    this.client = new Minio.Client({
      endPoint: endpoint,
      port,
      useSSL,
      accessKey,
      secretKey,
    });
  }

  /**
   * Ensures the bucket exists and applies a selective public-read policy
   * covering only the `avatar/*` and `logo/*` prefixes.
   * Failures here are logged as warnings, not thrown, so boot does not crash.
   */
  async onModuleInit(): Promise<void> {
    try {
      const exists = await this.client.bucketExists(this.bucket);
      if (!exists) {
        await this.client.makeBucket(this.bucket);
        this.logger.log(`Bucket "${this.bucket}" created`);
      }

      await this.applySelectivePublicPolicy();
      this.logger.log(`MinIO adapter ready — bucket: ${this.bucket}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `MinIO not available at startup (${msg}). ` +
          'Upload requests will fail until MinIO is reachable.',
      );
    }
  }

  async upload(input: StorageUploadInput): Promise<StorageUploadResult> {
    await this.client.putObject(this.bucket, input.path, input.buffer, input.buffer.length, {
      'Content-Type': input.contentType,
    });

    if (input.isPrivate) {
      // Return a signed URL (1 h TTL) for private objects.
      const url = await this.getSignedUrl(input.path);
      return { url, path: input.path };
    }

    const url = `${this.publicUrl}/${input.path}`;
    return { url, path: input.path };
  }

  /**
   * Returns a pre-signed GET URL valid for 1 hour (3 600 seconds).
   * Used for private objects (receipt, document, signature).
   *
   * The optional `ttlMs` parameter is accepted to satisfy the IStoragePort
   * interface but MinIO always uses a fixed 1-hour TTL in this implementation.
   */
  async getSignedUrl(path: string, _ttlMs?: number): Promise<string> {
    return this.client.presignedGetObject(this.bucket, path, 3600);
  }

  /**
   * Applies a bucket policy that grants public `s3:GetObject` access only to
   * the `avatar/*` and `logo/*` prefixes. All other objects remain private.
   *
   * Resource ARNs use the format:
   *   `arn:aws:s3:::<bucket>/<prefix>/*`
   */
  private async applySelectivePublicPolicy(): Promise<void> {
    const resources = MinioStorageAdapter.PUBLIC_PREFIXES.map(
      (prefix) => `arn:aws:s3:::${this.bucket}/${prefix}/*`,
    );

    const policy = JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: { AWS: ['*'] },
          Action: ['s3:GetObject'],
          Resource: resources,
        },
      ],
    });

    await this.client.setBucketPolicy(this.bucket, policy);
  }
}
