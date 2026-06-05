import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';
import type { IStoragePort, StorageUploadInput, StorageUploadResult } from '../../application/ports/storage.port';

/**
 * MinioStorageAdapter — storage adapter for local development (MinIO).
 *
 * On module init, ensures the configured bucket exists with a public-read
 * policy so URLs are directly accessible without signed URLs (Etapa 1).
 *
 * IMPORTANT: Connection errors during onModuleInit are caught and logged as
 * warnings — they must NOT crash the boot sequence, allowing the server to
 * start even when MinIO is temporarily unavailable.
 */
@Injectable()
export class MinioStorageAdapter implements IStoragePort, OnModuleInit {
  private readonly logger = new Logger(MinioStorageAdapter.name);
  private readonly client: Minio.Client;
  private readonly bucket: string;
  private readonly publicUrl: string;

  constructor(private readonly config: ConfigService) {
    const endpoint = this.config.get<string>('MINIO_ENDPOINT', 'localhost');
    const port = parseInt(this.config.get<string>('MINIO_PORT', '9000'), 10);
    const useSSL = this.config.get<string>('MINIO_USE_SSL', 'false') === 'true';
    const accessKey = this.config.get<string>('MINIO_ACCESS_KEY', 'delta');
    const secretKey = this.config.get<string>('MINIO_SECRET_KEY', 'delta-secret-dev');

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
   * Ensures the bucket exists and has a public-read policy.
   * Failures here are logged as warnings, not thrown, so boot does not crash.
   */
  async onModuleInit(): Promise<void> {
    try {
      const exists = await this.client.bucketExists(this.bucket);
      if (!exists) {
        await this.client.makeBucket(this.bucket);
        this.logger.log(`Bucket "${this.bucket}" created`);
      }

      await this.applyPublicReadPolicy();
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

    const url = `${this.publicUrl}/${input.path}`;
    return { url, path: input.path };
  }

  async getSignedUrl(path: string): Promise<string> {
    // Pre-signed URL valid for 1 hour (3600 seconds)
    return this.client.presignedGetObject(this.bucket, path, 3600);
  }

  private async applyPublicReadPolicy(): Promise<void> {
    const policy = JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: { AWS: ['*'] },
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${this.bucket}/*`],
        },
      ],
    });
    await this.client.setBucketPolicy(this.bucket, policy);
  }
}
