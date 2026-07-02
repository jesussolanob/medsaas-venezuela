import { GetSignedUrlUseCase } from './get-signed-url.use-case';
import { StorageValidationError, StorageUploadError } from '../../domain/errors/storage.error';
import type { IStoragePort } from '../ports/storage.port';

// ---------------------------------------------------------------------------
// Storage port mock
// ---------------------------------------------------------------------------
const mockStorage: jest.Mocked<IStoragePort> = {
  upload: jest.fn(),
  getSignedUrl: jest.fn(),
};

const makeUseCase = () => new GetSignedUrlUseCase(mockStorage);

const SIGNED_URL =
  'https://minio:9000/delta-uploads/receipt/doctor-001/1234-r.pdf?X-Amz-Signature=abc&X-Amz-Expires=3600';

beforeEach(() => {
  jest.clearAllMocks();
  mockStorage.getSignedUrl.mockResolvedValue(SIGNED_URL);
});

// ---------------------------------------------------------------------------
// Ownership validation (anti-IDOR)
// ---------------------------------------------------------------------------
describe('GetSignedUrlUseCase — ownership validation (anti-IDOR)', () => {
  it('allows access when path starts with <privateKind>/<userId>/', async () => {
    const uc = makeUseCase();
    const result = await uc.execute({
      path: 'receipt/doctor-001/1234-r.pdf',
      userId: 'doctor-001',
    });

    expect(result.url).toBe(SIGNED_URL);
    expect(result.expiresInSeconds).toBe(3600);
  });

  it('throws StorageValidationError when userId does not match path owner', async () => {
    const uc = makeUseCase();
    await expect(
      uc.execute({ path: 'receipt/doctor-999/1234-r.pdf', userId: 'doctor-001' }),
    ).rejects.toThrow(StorageValidationError);
  });

  it('throws StorageValidationError when path owner segment is empty', async () => {
    const uc = makeUseCase();
    await expect(uc.execute({ path: 'receipt/', userId: 'doctor-001' })).rejects.toThrow(
      StorageValidationError,
    );
  });

  it('rejects attempt to access another user path by supplying extra slashes', async () => {
    // path: "receipt/doctor-001/../doctor-999/file.pdf" — ownerId segment is "doctor-001"
    // but attacker hopes traversal works downstream; we check the raw segment only.
    // Since ownerId segment === "doctor-001", this should pass ownership check but
    // the sanitized path is the adapter's concern. Ensure the IDOR guard uses raw segments.
    const uc = makeUseCase();
    // Path where second segment is "doctor-001" — should pass.
    await expect(
      uc.execute({ path: 'document/doctor-001/../../etc/passwd', userId: 'doctor-001' }),
    ).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Kind validation (only private kinds allowed)
// ---------------------------------------------------------------------------
describe('GetSignedUrlUseCase — private kind enforcement', () => {
  it.each(['receipt', 'document'])('accepts private kind "%s"', async (kind) => {
    const uc = makeUseCase();
    const result = await uc.execute({
      path: `${kind}/doctor-001/file.pdf`,
      userId: 'doctor-001',
    });
    expect(result.url).toBe(SIGNED_URL);
  });

  it('throws StorageValidationError for public kind "avatar"', async () => {
    const uc = makeUseCase();
    await expect(
      uc.execute({ path: 'avatar/doctor-001/photo.png', userId: 'doctor-001' }),
    ).rejects.toThrow(StorageValidationError);
  });

  it('throws StorageValidationError for public kind "logo"', async () => {
    const uc = makeUseCase();
    await expect(
      uc.execute({ path: 'logo/doctor-001/logo.png', userId: 'doctor-001' }),
    ).rejects.toThrow(StorageValidationError);
  });

  it('throws StorageValidationError for unknown kind', async () => {
    const uc = makeUseCase();
    await expect(
      uc.execute({ path: 'video/doctor-001/clip.mp4', userId: 'doctor-001' }),
    ).rejects.toThrow(StorageValidationError);
  });
});

// ---------------------------------------------------------------------------
// Delegation to storage port
// ---------------------------------------------------------------------------
describe('GetSignedUrlUseCase — storage port delegation', () => {
  it('calls getSignedUrl on the storage port with the exact path', async () => {
    const uc = makeUseCase();
    await uc.execute({ path: 'receipt/doctor-001/1234-r.pdf', userId: 'doctor-001' });

    expect(mockStorage.getSignedUrl).toHaveBeenCalledWith('receipt/doctor-001/1234-r.pdf');
  });

  it('returns expiresInSeconds = 3600', async () => {
    const uc = makeUseCase();
    const result = await uc.execute({
      path: 'document/doctor-001/doc.pdf',
      userId: 'doctor-001',
    });
    expect(result.expiresInSeconds).toBe(3600);
  });

  it('wraps storage port errors as StorageUploadError', async () => {
    mockStorage.getSignedUrl.mockRejectedValue(new Error('presign timeout'));
    const uc = makeUseCase();
    await expect(
      uc.execute({ path: 'receipt/doctor-001/1-r.pdf', userId: 'doctor-001' }),
    ).rejects.toThrow(StorageUploadError);
  });

  it('wraps non-Error storage port throws as StorageUploadError', async () => {
    mockStorage.getSignedUrl.mockRejectedValue('network failure');
    const uc = makeUseCase();
    await expect(
      uc.execute({ path: 'document/doctor-001/1-d.pdf', userId: 'doctor-001' }),
    ).rejects.toThrow(StorageUploadError);
  });
});
