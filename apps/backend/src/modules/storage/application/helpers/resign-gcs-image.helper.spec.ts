import { resignGcsImageUrl } from './resign-gcs-image.helper';
import type { IStoragePort } from '../ports/storage.port';

const GCS_BUCKET = 'delta-files-prod';
const OBJECT_PATH = 'avatar/doctor-123.png';
const GCS_URL = `https://storage.googleapis.com/${GCS_BUCKET}/${OBJECT_PATH}?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Credential=sa%40project.iam.gserviceaccount.com&X-Goog-Date=20260101T000000Z&X-Goog-Expires=604800&X-Goog-SignedHeaders=host&X-Goog-Signature=abc123`;
const FRESH_URL = `https://storage.googleapis.com/${GCS_BUCKET}/${OBJECT_PATH}?X-Goog-Algorithm=GOOG4-RSA-SHA256&fresh=1`;

function makeMockStorage(freshUrl = FRESH_URL): jest.Mocked<IStoragePort> {
  return {
    upload: jest.fn(),
    getSignedUrl: jest.fn().mockResolvedValue(freshUrl),
  };
}

describe('resignGcsImageUrl', () => {
  it('returns null when url is null', async () => {
    const storage = makeMockStorage();
    const result = await resignGcsImageUrl(null, storage);
    expect(result).toBeNull();
    expect(storage.getSignedUrl).not.toHaveBeenCalled();
  });

  it('returns null when url is undefined', async () => {
    const storage = makeMockStorage();
    const result = await resignGcsImageUrl(undefined, storage);
    expect(result).toBeNull();
    expect(storage.getSignedUrl).not.toHaveBeenCalled();
  });

  it('returns empty string as-is when url is empty', async () => {
    const storage = makeMockStorage();
    const result = await resignGcsImageUrl('', storage);
    expect(result).toBe('');
    expect(storage.getSignedUrl).not.toHaveBeenCalled();
  });

  it('re-signs a GCS URL and returns a fresh URL', async () => {
    const storage = makeMockStorage();
    const result = await resignGcsImageUrl(GCS_URL, storage);
    expect(result).toBe(FRESH_URL);
    expect(storage.getSignedUrl).toHaveBeenCalledWith(OBJECT_PATH, 7 * 24 * 60 * 60 * 1000);
  });

  it('extracts the correct object path from the GCS URL (strips bucket)', async () => {
    const storage = makeMockStorage();
    const url = `https://storage.googleapis.com/my-bucket/logo/header.png?X-Goog-Algorithm=GOOG4-RSA-SHA256`;
    await resignGcsImageUrl(url, storage);
    expect(storage.getSignedUrl).toHaveBeenCalledWith('logo/header.png', expect.any(Number));
  });

  it('handles nested object paths with multiple segments', async () => {
    const storage = makeMockStorage();
    const url = `https://storage.googleapis.com/my-bucket/doctors/123/avatar/profile.jpg?X-Goog-Algorithm=GOOG4-RSA-SHA256`;
    await resignGcsImageUrl(url, storage);
    expect(storage.getSignedUrl).toHaveBeenCalledWith(
      'doctors/123/avatar/profile.jpg',
      expect.any(Number),
    );
  });

  it('returns the url unchanged for non-GCS URLs (MinIO, CDN)', async () => {
    const storage = makeMockStorage();
    const minioUrl = 'http://localhost:9000/delta-uploads/avatar/doctor-123.png';
    const result = await resignGcsImageUrl(minioUrl, storage);
    expect(result).toBe(minioUrl);
    expect(storage.getSignedUrl).not.toHaveBeenCalled();
  });

  it('returns the url unchanged for HTTPS CDN URLs', async () => {
    const storage = makeMockStorage();
    const cdnUrl = 'https://cdn.example.com/avatar.png';
    const result = await resignGcsImageUrl(cdnUrl, storage);
    expect(result).toBe(cdnUrl);
    expect(storage.getSignedUrl).not.toHaveBeenCalled();
  });

  it('respects the custom ttlMs when signing', async () => {
    const storage = makeMockStorage();
    const customTtl = 60 * 60 * 1000; // 1 hour
    await resignGcsImageUrl(GCS_URL, storage, customTtl);
    expect(storage.getSignedUrl).toHaveBeenCalledWith(OBJECT_PATH, customTtl);
  });

  it('returns the original url if getSignedUrl throws (graceful degradation)', async () => {
    const storage = makeMockStorage();
    storage.getSignedUrl.mockRejectedValue(new Error('GCS unavailable'));
    const result = await resignGcsImageUrl(GCS_URL, storage);
    expect(result).toBe(GCS_URL);
  });

  it('does not call getSignedUrl for GCS URL with only bucket in path (no object path)', async () => {
    const storage = makeMockStorage();
    // URL with only bucket, no object — extractGcsPath returns null
    const url = 'https://storage.googleapis.com/my-bucket?param=value';
    const result = await resignGcsImageUrl(url, storage);
    // No object path → treated as non-GCS, returned as-is
    expect(storage.getSignedUrl).not.toHaveBeenCalled();
    expect(result).toBe(url);
  });

  it('uses 7-day default TTL', async () => {
    const storage = makeMockStorage();
    await resignGcsImageUrl(GCS_URL, storage);
    const expectedTtl = 7 * 24 * 60 * 60 * 1000;
    expect(storage.getSignedUrl).toHaveBeenCalledWith(OBJECT_PATH, expectedTtl);
  });
});
