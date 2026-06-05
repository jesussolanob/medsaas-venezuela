import { createStorageAdapter } from './storage-adapter.factory';
import { MinioStorageAdapter } from './minio-storage.adapter';
import { GcsStorageAdapter } from './gcs-storage.adapter';
import type { ConfigService } from '@nestjs/config';

function makeConfig(driver: string): ConfigService {
  return {
    get: (key: string, defaultValue?: string): string => {
      if (key === 'STORAGE_DRIVER') return driver;
      if (key === 'MINIO_ENDPOINT') return 'localhost';
      if (key === 'MINIO_PORT') return '9000';
      if (key === 'MINIO_USE_SSL') return 'false';
      if (key === 'MINIO_BUCKET') return 'delta-uploads';
      if (key === 'MINIO_PUBLIC_URL') return 'http://localhost:9000/delta-uploads';
      if (key === 'GCS_PROJECT_ID') return 'test-project';
      if (key === 'GCS_BUCKET') return 'test-bucket';
      return defaultValue ?? '';
    },
    // Credentials use getOrThrow — return values for tests
    getOrThrow: (key: string): string => {
      if (key === 'MINIO_ACCESS_KEY') return 'test-access-key';
      if (key === 'MINIO_SECRET_KEY') return 'test-secret-key';
      throw new Error(`Missing required config key: ${key}`);
    },
  } as unknown as ConfigService;
}

describe('createStorageAdapter', () => {
  it('returns MinioStorageAdapter when driver is "minio"', () => {
    const adapter = createStorageAdapter(makeConfig('minio'));
    expect(adapter).toBeInstanceOf(MinioStorageAdapter);
  });

  it('returns GcsStorageAdapter when driver is "gcs"', () => {
    const adapter = createStorageAdapter(makeConfig('gcs'));
    expect(adapter).toBeInstanceOf(GcsStorageAdapter);
  });

  it('defaults to MinioStorageAdapter when driver is unknown', () => {
    const adapter = createStorageAdapter(makeConfig(''));
    expect(adapter).toBeInstanceOf(MinioStorageAdapter);
  });

  it('defaults to MinioStorageAdapter when driver is "minio"', () => {
    const adapter = createStorageAdapter(makeConfig('minio'));
    expect(adapter).toBeInstanceOf(MinioStorageAdapter);
  });
});
