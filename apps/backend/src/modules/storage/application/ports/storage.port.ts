/**
 * IStoragePort — application-layer port (interface) for file storage.
 *
 * Adapters (MinIO / GCS) implement this interface so use-cases remain
 * completely decoupled from the storage technology.
 *
 * Lives in application/ because it is the boundary the use-case depends on.
 * The concrete implementations live in infrastructure/adapters/.
 */
export interface StorageUploadInput {
  buffer: Buffer;
  path: string;
  contentType: string;
}

export interface StorageUploadResult {
  url: string;
  path: string;
}

export interface IStoragePort {
  upload(input: StorageUploadInput): Promise<StorageUploadResult>;
  getSignedUrl?(path: string): Promise<string>;
}

export const STORAGE_PORT = 'STORAGE_PORT' as const;
