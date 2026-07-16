import type { IStoragePort } from '../ports/storage.port';

/**
 * GCS signed-URL detection.
 *
 * GCS v4 signed URLs have the form:
 *   https://storage.googleapis.com/<bucket>/<object>?X-Goog-Algorithm=...
 *
 * The object path follows the bucket name in the URL path.
 */
const GCS_BASE = 'https://storage.googleapis.com/';

/**
 * Extracts the GCS object path from a signed (or non-signed) GCS URL.
 *
 * Examples:
 *   Input:  https://storage.googleapis.com/my-bucket/avatar/doctor-123.png?X-Goog-Algorithm=...
 *   Output: avatar/doctor-123.png
 *
 * Returns null if the URL is not a GCS URL or cannot be parsed safely.
 */
function extractGcsPath(url: string): string | null {
  if (!url.startsWith(GCS_BASE)) return null;

  try {
    const parsed = new URL(url);
    // pathname is /<bucket>/<object-path>  — strip the leading /<bucket>/ segment
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    if (pathParts.length < 2) return null;
    // pathParts[0] is the bucket name; everything after is the object path
    return pathParts.slice(1).join('/');
  } catch {
    return null;
  }
}

/**
 * Re-signs a stored GCS image URL with a fresh TTL.
 *
 * Use this at READ time for image URLs that were persisted as signed GCS URLs
 * (avatar, logo, signature). Signed GCS v4 URLs have a maximum TTL of 7 days,
 * so stored URLs expire and render as 403. This helper regenerates a fresh URL
 * on every read, keeping images always accessible.
 *
 * Behaviour:
 *   - If `url` is a GCS URL, returns a fresh signed URL using `storagePort.getSignedUrl`.
 *   - If `url` is not a GCS URL (MinIO, CDN, data URI, etc.), returns `url` unchanged.
 *   - If `url` is null / empty, returns it unchanged.
 *   - If `getSignedUrl` throws (e.g. network issue), the original `url` is returned
 *     so the caller does not crash — the image may be broken but the response is valid.
 *
 * @param url           The stored URL value (possibly an expired signed GCS URL).
 * @param storagePort   The active IStoragePort adapter (MinIO in dev, GCS in prod).
 * @param ttlMs         TTL for the new signed URL. Default: 7 days (v4 max).
 */
export async function resignGcsImageUrl(
  url: string | null | undefined,
  storagePort: IStoragePort,
  ttlMs = 7 * 24 * 60 * 60 * 1000,
): Promise<string | null> {
  if (!url) return url ?? null;

  const gcsPath = extractGcsPath(url);
  if (!gcsPath) {
    // Not a GCS URL — return as-is (MinIO public URL, external CDN, etc.)
    return url;
  }

  try {
    return await storagePort.getSignedUrl(gcsPath, ttlMs);
  } catch {
    // Best-effort: if re-signing fails, return the original stored URL.
    // The image may be expired/broken but the API response remains valid.
    return url;
  }
}
