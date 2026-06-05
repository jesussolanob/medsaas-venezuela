import {
  UploadFileUseCase,
  sanitizeFilename,
  buildStoragePath,
  PRIVATE_KINDS,
  type UploadFileInput,
} from './upload-file.use-case';
import { StorageValidationError, StorageUploadError } from '../../domain/errors/storage.error';
import type { IStoragePort } from '../ports/storage.port';

// ---------------------------------------------------------------------------
// file-type mock — must be set up before any import that might use it, but
// Jest module mocking is hoisted so we declare the factory here.
// ---------------------------------------------------------------------------
jest.mock('file-type', () => ({
  fileTypeFromBuffer: jest.fn(),
}));

import * as fileTypeModule from 'file-type';
const mockFileTypeFromBuffer = fileTypeModule.fileTypeFromBuffer as jest.MockedFunction<
  typeof fileTypeModule.fileTypeFromBuffer
>;

// ---------------------------------------------------------------------------
// Storage port mock
// ---------------------------------------------------------------------------
const mockStorage: jest.Mocked<IStoragePort> = {
  upload: jest.fn(),
  getSignedUrl: jest.fn(),
};

const makeUseCase = () => new UploadFileUseCase(mockStorage);

/** Valid input for a private kind (document). */
const validPrivateInput: UploadFileInput = {
  buffer: Buffer.from('data'),
  originalname: 'report.pdf',
  mimetype: 'application/pdf',
  size: 1024,
  kind: 'document',
  userId: 'user-123',
};

/** Valid input for a public kind (avatar). */
const validPublicInput: UploadFileInput = {
  buffer: Buffer.from('png-data'),
  originalname: 'avatar.png',
  mimetype: 'image/png',
  size: 512,
  kind: 'avatar',
  userId: 'user-456',
};

beforeEach(() => {
  jest.clearAllMocks();

  // Default: file-type detects application/pdf for binary buffer
  mockFileTypeFromBuffer.mockResolvedValue({ mime: 'application/pdf', ext: 'pdf' });

  mockStorage.upload.mockResolvedValue({
    url: 'http://localhost:9000/delta-uploads/document/user-123/1234-report.pdf',
    path: 'document/user-123/1234-report.pdf',
  });
});

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------
describe('sanitizeFilename', () => {
  it('replaces spaces with underscores', () => {
    expect(sanitizeFilename('my file.pdf')).toBe('my_file.pdf');
  });

  it('removes path traversal characters', () => {
    expect(sanitizeFilename('../evil.pdf')).toBe('.._evil.pdf');
  });

  it('removes slash characters', () => {
    expect(sanitizeFilename('a/b/c.pdf')).toBe('a_b_c.pdf');
  });

  it('keeps safe characters intact', () => {
    expect(sanitizeFilename('valid-name_v2.png')).toBe('valid-name_v2.png');
  });
});

describe('buildStoragePath', () => {
  it('builds path with correct format', () => {
    const result = buildStoragePath('avatar', 'user-abc', 'photo.jpg');
    expect(result).toMatch(/^avatar\/user-abc\/\d+-photo\.jpg$/);
  });

  it('sanitizes the filename in the path', () => {
    const result = buildStoragePath('document', 'u1', 'bad file!.pdf');
    expect(result).not.toContain(' ');
    expect(result).not.toContain('!');
  });

  it('uses the provided kind as path prefix', () => {
    const result = buildStoragePath('logo', 'u1', 'logo.png');
    expect(result).toMatch(/^logo\//);
  });
});

// ---------------------------------------------------------------------------
// PRIVATE_KINDS constant
// ---------------------------------------------------------------------------
describe('PRIVATE_KINDS', () => {
  it('contains receipt, document, signature', () => {
    expect(PRIVATE_KINDS.has('receipt')).toBe(true);
    expect(PRIVATE_KINDS.has('document')).toBe(true);
    expect(PRIVATE_KINDS.has('signature')).toBe(true);
  });

  it('does not contain public kinds avatar and logo', () => {
    expect(PRIVATE_KINDS.has('avatar')).toBe(false);
    expect(PRIVATE_KINDS.has('logo')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// UploadFileUseCase
// ---------------------------------------------------------------------------
describe('UploadFileUseCase', () => {
  describe('kind validation', () => {
    it.each(['avatar', 'receipt', 'document', 'logo', 'signature'])(
      'accepts valid kind "%s"',
      async (kind) => {
        const uc = makeUseCase();
        await expect(uc.execute({ ...validPrivateInput, kind })).resolves.toBeDefined();
      },
    );

    it('throws StorageValidationError for unknown kind', async () => {
      const uc = makeUseCase();
      await expect(uc.execute({ ...validPrivateInput, kind: 'video' })).rejects.toThrow(
        StorageValidationError,
      );
    });
  });

  describe('size validation', () => {
    it('accepts file at exactly 10 MB', async () => {
      const uc = makeUseCase();
      await expect(
        uc.execute({ ...validPrivateInput, size: 10 * 1024 * 1024 }),
      ).resolves.toBeDefined();
    });

    it('throws StorageValidationError for file exceeding 10 MB', async () => {
      const uc = makeUseCase();
      await expect(
        uc.execute({ ...validPrivateInput, size: 10 * 1024 * 1024 + 1 }),
      ).rejects.toThrow(StorageValidationError);
    });
  });

  describe('content-type validation', () => {
    it.each(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'])(
      'accepts allowed MIME type "%s"',
      async (mimetype) => {
        mockFileTypeFromBuffer.mockResolvedValue({ mime: mimetype as Parameters<typeof mockFileTypeFromBuffer>[0] extends Buffer ? never : never, ext: 'bin' } as Awaited<ReturnType<typeof mockFileTypeFromBuffer>>);
        // Re-setup mock to return the correct mime for each type
        mockFileTypeFromBuffer.mockResolvedValue({ mime: mimetype, ext: 'bin' } as NonNullable<Awaited<ReturnType<typeof mockFileTypeFromBuffer>>>);
        const uc = makeUseCase();
        await expect(uc.execute({ ...validPrivateInput, mimetype })).resolves.toBeDefined();
      },
    );

    it('rejects image/svg+xml (XSS vector)', async () => {
      const uc = makeUseCase();
      await expect(
        uc.execute({ ...validPrivateInput, mimetype: 'image/svg+xml' }),
      ).rejects.toThrow(StorageValidationError);
    });

    it('throws StorageValidationError for disallowed MIME type', async () => {
      const uc = makeUseCase();
      await expect(
        uc.execute({ ...validPrivateInput, mimetype: 'application/exe' }),
      ).rejects.toThrow(StorageValidationError);
    });

    it('throws StorageValidationError for video MIME type', async () => {
      const uc = makeUseCase();
      await expect(
        uc.execute({ ...validPrivateInput, mimetype: 'video/mp4' }),
      ).rejects.toThrow(StorageValidationError);
    });
  });

  describe('magic bytes validation (HIGH-3)', () => {
    it('accepts file when detected mime matches declared mime', async () => {
      mockFileTypeFromBuffer.mockResolvedValue({ mime: 'application/pdf', ext: 'pdf' });
      const uc = makeUseCase();
      await expect(uc.execute(validPrivateInput)).resolves.toBeDefined();
    });

    it('rejects file when detected mime does not match (HTML disguised as PNG)', async () => {
      // Simulate an HTML file with a spoofed image/png Content-Type header.
      // file-type detects no recognised binary signature.
      mockFileTypeFromBuffer.mockResolvedValue(undefined);
      const uc = makeUseCase();
      await expect(
        uc.execute({ ...validPublicInput, mimetype: 'image/png' }),
      ).rejects.toThrow(StorageValidationError);
    });

    it('rejects file when detected mime is disallowed (e.g. application/x-msdownload)', async () => {
      mockFileTypeFromBuffer.mockResolvedValue({
        mime: 'application/x-msdownload',
        ext: 'exe',
      });
      const uc = makeUseCase();
      await expect(uc.execute({ ...validPrivateInput, mimetype: 'application/pdf' })).rejects.toThrow(
        StorageValidationError,
      );
    });

    it('rejects SVG masquerading as JPEG (detected as image/svg+xml)', async () => {
      mockFileTypeFromBuffer.mockResolvedValue({ mime: 'image/svg+xml', ext: 'svg' });
      const uc = makeUseCase();
      await expect(
        uc.execute({ ...validPublicInput, mimetype: 'image/jpeg' }),
      ).rejects.toThrow(StorageValidationError);
    });

    it('rejects when fileTypeFromBuffer returns undefined for a binary mime', async () => {
      mockFileTypeFromBuffer.mockResolvedValue(undefined);
      const uc = makeUseCase();
      await expect(uc.execute({ ...validPrivateInput, mimetype: 'image/jpeg' })).rejects.toThrow(
        StorageValidationError,
      );
    });
  });

  describe('public vs private kind selection (HIGH-2)', () => {
    it('calls storage.upload with isPrivate=true for kind "receipt"', async () => {
      mockStorage.upload.mockResolvedValue({ url: 'https://signed.url/receipt?sig=abc', path: 'receipt/user-123/1-r.pdf' });
      const uc = makeUseCase();
      await uc.execute({ ...validPrivateInput, kind: 'receipt' });

      const call = mockStorage.upload.mock.calls[0]![0]!;
      expect(call.isPrivate).toBe(true);
    });

    it('calls storage.upload with isPrivate=true for kind "document"', async () => {
      mockStorage.upload.mockResolvedValue({ url: 'https://signed.url/doc?sig=xyz', path: 'document/user-123/1-d.pdf' });
      const uc = makeUseCase();
      await uc.execute({ ...validPrivateInput, kind: 'document' });

      const call = mockStorage.upload.mock.calls[0]![0]!;
      expect(call.isPrivate).toBe(true);
    });

    it('calls storage.upload with isPrivate=true for kind "signature"', async () => {
      mockFileTypeFromBuffer.mockResolvedValue({ mime: 'image/png', ext: 'png' });
      mockStorage.upload.mockResolvedValue({ url: 'https://signed.url/sig?sig=zzz', path: 'signature/user-123/1-s.png' });
      const uc = makeUseCase();
      await uc.execute({ ...validPublicInput, kind: 'signature' });

      const call = mockStorage.upload.mock.calls[0]![0]!;
      expect(call.isPrivate).toBe(true);
    });

    it('calls storage.upload with isPrivate=false for kind "avatar"', async () => {
      mockFileTypeFromBuffer.mockResolvedValue({ mime: 'image/png', ext: 'png' });
      mockStorage.upload.mockResolvedValue({ url: 'http://minio/delta-uploads/avatar/user-456/1-avatar.png', path: 'avatar/user-456/1-avatar.png' });
      const uc = makeUseCase();
      await uc.execute({ ...validPublicInput, kind: 'avatar' });

      const call = mockStorage.upload.mock.calls[0]![0]!;
      expect(call.isPrivate).toBe(false);
    });

    it('calls storage.upload with isPrivate=false for kind "logo"', async () => {
      mockFileTypeFromBuffer.mockResolvedValue({ mime: 'image/png', ext: 'png' });
      mockStorage.upload.mockResolvedValue({ url: 'http://minio/delta-uploads/logo/user-456/1-logo.png', path: 'logo/user-456/1-logo.png' });
      const uc = makeUseCase();
      await uc.execute({ ...validPublicInput, kind: 'logo' });

      const call = mockStorage.upload.mock.calls[0]![0]!;
      expect(call.isPrivate).toBe(false);
    });

    it('returns signed URL from adapter for private kind', async () => {
      const signedUrl = 'https://minio:9000/delta-uploads/receipt/user-123/1-r.pdf?X-Amz-Signature=abc123&X-Amz-Expires=3600';
      mockStorage.upload.mockResolvedValue({ url: signedUrl, path: 'receipt/user-123/1-r.pdf' });
      const uc = makeUseCase();
      const result = await uc.execute({ ...validPrivateInput, kind: 'receipt' });

      expect(result.url).toContain('X-Amz-Signature');
    });

    it('returns public URL from adapter for public kind', async () => {
      mockFileTypeFromBuffer.mockResolvedValue({ mime: 'image/png', ext: 'png' });
      const publicUrl = 'http://localhost:9000/delta-uploads/avatar/user-456/1-avatar.png';
      mockStorage.upload.mockResolvedValue({ url: publicUrl, path: 'avatar/user-456/1-avatar.png' });
      const uc = makeUseCase();
      const result = await uc.execute({ ...validPublicInput, kind: 'avatar' });

      expect(result.url).not.toContain('Signature');
      expect(result.url).toContain('avatar');
    });
  });

  describe('successful upload', () => {
    it('calls storage.upload with correct path and contentType', async () => {
      const uc = makeUseCase();
      await uc.execute(validPrivateInput);

      expect(mockStorage.upload).toHaveBeenCalledTimes(1);
      const call = mockStorage.upload.mock.calls[0]![0]!;
      expect(call.contentType).toBe('application/pdf');
      expect(call.path).toMatch(/^document\/user-123\/\d+-report\.pdf$/);
      expect(call.buffer).toEqual(Buffer.from('data'));
    });

    it('returns url and path from storage adapter', async () => {
      const uc = makeUseCase();
      const result = await uc.execute(validPrivateInput);
      expect(result.url).toContain('delta-uploads');
      expect(result.path).toContain('document/user-123');
    });
  });

  describe('storage adapter failure', () => {
    it('throws StorageUploadError when adapter throws', async () => {
      mockStorage.upload.mockRejectedValue(new Error('connection refused'));
      const uc = makeUseCase();
      await expect(uc.execute(validPrivateInput)).rejects.toThrow(StorageUploadError);
    });

    it('wraps non-Error throws as StorageUploadError', async () => {
      mockStorage.upload.mockRejectedValue('string error');
      const uc = makeUseCase();
      await expect(uc.execute(validPrivateInput)).rejects.toThrow(StorageUploadError);
    });
  });
});
