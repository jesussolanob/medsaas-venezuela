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
  /**
   * When true the adapter stores the object privately and returns a
   * time-limited signed URL (TTL: 1 hour) instead of a permanent public URL.
   * When false (default) the adapter stores the object with public-read access.
   */
  isPrivate?: boolean;
}

export interface StorageUploadResult {
  /** Public URL (permanent) for public kinds; signed URL (1 h TTL) for private kinds. */
  url: string;
  path: string;
}

export interface IStoragePort {
  upload(input: StorageUploadInput): Promise<StorageUploadResult>;
  /**
   * Returns a fresh signed URL for an already-stored object.
   *
   * @param path    Object path within the bucket (e.g. "avatar/doctor-123.png").
   * @param ttlMs   Optional TTL in milliseconds. Defaults to 1 hour (3 600 000 ms).
   *                GCS v4 signed URLs support a maximum of 7 days.
   *                MinIO adapters may ignore this parameter and always use 1 hour.
   */
  getSignedUrl(path: string, ttlMs?: number): Promise<string>;
}

export const STORAGE_PORT = 'STORAGE_PORT' as const;
