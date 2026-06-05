import type { ConfigService } from '@nestjs/config';
import type { IStoragePort } from '../../application/ports/storage.port';
import { MinioStorageAdapter } from './minio-storage.adapter';
import { GcsStorageAdapter } from './gcs-storage.adapter';

export type StorageDriver = 'minio' | 'gcs';

/**
 * Returns the correct storage adapter instance based on the STORAGE_DRIVER
 * environment variable.
 *
 * Default: 'minio' (development).
 */
export function createStorageAdapter(config: ConfigService): IStoragePort {
  const driver = (config.get<string>('STORAGE_DRIVER', 'minio') as StorageDriver);

  if (driver === 'gcs') {
    return new GcsStorageAdapter(config);
  }

  return new MinioStorageAdapter(config);
}
