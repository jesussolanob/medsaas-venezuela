import {
  UploadFileUseCase,
  sanitizeFilename,
  buildStoragePath,
  detectMimeFromBuffer,
  PRIVATE_KINDS,
  type UploadFileInput,
} from './upload-file.use-case';
import { StorageValidationError, StorageUploadError } from '../../domain/errors/storage.error';
import type { IStoragePort } from '../ports/storage.port';

// ---------------------------------------------------------------------------
// Storage port mock
// ---------------------------------------------------------------------------
const mockStorage: jest.Mocked<IStoragePort> = {
  upload: jest.fn(),
  getSignedUrl: jest.fn(),
};

const makeUseCase = () => new UploadFileUseCase(mockStorage);

// ---------------------------------------------------------------------------
// Real magic-byte buffers — used to test the integrated detectMimeFromBuffer
// without mocking file-type (which was ESM-only and is no longer used).
// ---------------------------------------------------------------------------
const JPEG_BUF = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG_BUF = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const WEBP_BUF = Buffer.from([
  0x52,
  0x49,
  0x46,
  0x46, // RIFF
  0x24,
  0x00,
  0x00,
  0x00, // file size (little-endian)
  0x57,
  0x45,
  0x42,
  0x50, // WEBP
  0x56,
  0x50,
  0x38, // ...
]);
const GIF_BUF = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]); // GIF89a
const PDF_BUF = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
const UNKNOWN_BUF = Buffer.from([0x00, 0x01, 0x02, 0x03]);

/** Valid input for a private kind (document). */
const validPrivateInput: UploadFileInput = {
  buffer: PDF_BUF,
  originalname: 'report.pdf',
  mimetype: 'application/pdf',
  size: 1024,
  kind: 'document',
  userId: 'user-123',
};

/** Valid input for a public kind (avatar). */
const validPublicInput: UploadFileInput = {
  buffer: PNG_BUF,
  originalname: 'avatar.png',
  mimetype: 'image/png',
  size: 512,
  kind: 'avatar',
  userId: 'user-456',
};

beforeEach(() => {
  jest.clearAllMocks();

  mockStorage.upload.mockResolvedValue({
    url: 'http://localhost:9000/delta-uploads/document/user-123/1234-report.pdf',
    path: 'document/user-123/1234-report.pdf',
  });
});

// ---------------------------------------------------------------------------
// detectMimeFromBuffer — pure function, no mocking needed
// ---------------------------------------------------------------------------
describe('detectMimeFromBuffer', () => {
  it('detects image/jpeg from FF D8 FF header', () => {
    expect(detectMimeFromBuffer(JPEG_BUF)).toBe('image/jpeg');
  });

  it('detects image/png from 89 50 4E 47 ... header', () => {
    expect(detectMimeFromBuffer(PNG_BUF)).toBe('image/png');
  });

  it('detects image/webp from RIFF????WEBP header', () => {
    expect(detectMimeFromBuffer(WEBP_BUF)).toBe('image/webp');
  });

  it('detects image/gif from GIF8 header', () => {
    expect(detectMimeFromBuffer(GIF_BUF)).toBe('image/gif');
  });

  it('detects application/pdf from %PDF header', () => {
    expect(detectMimeFromBuffer(PDF_BUF)).toBe('application/pdf');
  });

  it('returns null for unknown/unrecognised buffer', () => {
    expect(detectMimeFromBuffer(UNKNOWN_BUF)).toBeNull();
  });

  it('returns null for buffer shorter than 4 bytes', () => {
    expect(detectMimeFromBuffer(Buffer.from([0xff, 0xd8]))).toBeNull();
  });

  it('does not detect SVG (no entry in signature table — XSS vector)', () => {
    // SVG is XML text; no binary magic bytes → detectMimeFromBuffer returns null
    const svgBuf = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(detectMimeFromBuffer(svgBuf)).toBeNull();
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
  it('contains receipt and document', () => {
    expect(PRIVATE_KINDS.has('receipt')).toBe(true);
    expect(PRIVATE_KINDS.has('document')).toBe(true);
  });

  it('does not contain public kinds avatar, logo, and signature', () => {
    expect(PRIVATE_KINDS.has('avatar')).toBe(false);
    expect(PRIVATE_KINDS.has('logo')).toBe(false);
    // signature is public so its URL persists stably in profiles.signature_url
    expect(PRIVATE_KINDS.has('signature')).toBe(false);
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
        // Use a buffer matching the declared MIME (pdf for document/receipt, png for others)
        const buf = ['document', 'receipt'].includes(kind) ? PDF_BUF : PNG_BUF;
        const mime = ['document', 'receipt'].includes(kind) ? 'application/pdf' : 'image/png';
        await expect(
          uc.execute({ ...validPrivateInput, kind, buffer: buf, mimetype: mime }),
        ).resolves.toBeDefined();
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
    it.each([
      ['image/jpeg', JPEG_BUF],
      ['image/png', PNG_BUF],
      ['image/webp', WEBP_BUF],
      ['image/gif', GIF_BUF],
      ['application/pdf', PDF_BUF],
    ] as [string, Buffer][])('accepts allowed MIME type "%s"', async (mimetype, buf) => {
      const uc = makeUseCase();
      await expect(
        uc.execute({ ...validPrivateInput, mimetype, buffer: buf }),
      ).resolves.toBeDefined();
    });

    it('rejects image/svg+xml (XSS vector)', async () => {
      const uc = makeUseCase();
      await expect(uc.execute({ ...validPrivateInput, mimetype: 'image/svg+xml' })).rejects.toThrow(
        StorageValidationError,
      );
    });

    it('throws StorageValidationError for disallowed MIME type', async () => {
      const uc = makeUseCase();
      await expect(
        uc.execute({ ...validPrivateInput, mimetype: 'application/exe' }),
      ).rejects.toThrow(StorageValidationError);
    });

    it('throws StorageValidationError for video MIME type', async () => {
      const uc = makeUseCase();
      await expect(uc.execute({ ...validPrivateInput, mimetype: 'video/mp4' })).rejects.toThrow(
        StorageValidationError,
      );
    });
  });

  describe('magic bytes validation', () => {
    it('accepts file when detected mime matches declared mime (PDF)', async () => {
      const uc = makeUseCase();
      await expect(uc.execute(validPrivateInput)).resolves.toBeDefined();
    });

    it('rejects file when detected mime does not match — HTML disguised as PNG', async () => {
      const htmlBuf = Buffer.from('<html><body>xss</body></html>');
      const uc = makeUseCase();
      await expect(
        uc.execute({ ...validPublicInput, mimetype: 'image/png', buffer: htmlBuf }),
      ).rejects.toThrow(StorageValidationError);
    });

    it('rejects file when detected mime is not in allowed set — random binary', async () => {
      const exeBuf = Buffer.from([0x4d, 0x5a, 0x90, 0x00]); // MZ header (Windows PE)
      const uc = makeUseCase();
      await expect(
        uc.execute({ ...validPrivateInput, mimetype: 'application/pdf', buffer: exeBuf }),
      ).rejects.toThrow(StorageValidationError);
    });

    it('rejects SVG masquerading as JPEG (no JPEG magic bytes)', async () => {
      const svgBuf = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>');
      const uc = makeUseCase();
      await expect(
        uc.execute({ ...validPublicInput, mimetype: 'image/jpeg', buffer: svgBuf }),
      ).rejects.toThrow(StorageValidationError);
    });

    it('rejects when buffer has no recognised binary signature for a binary mime', async () => {
      const uc = makeUseCase();
      await expect(
        uc.execute({ ...validPrivateInput, mimetype: 'image/jpeg', buffer: UNKNOWN_BUF }),
      ).rejects.toThrow(StorageValidationError);
    });
  });

  describe('public vs private kind selection', () => {
    it('calls storage.upload with isPrivate=true for kind "receipt"', async () => {
      mockStorage.upload.mockResolvedValue({
        url: 'https://signed.url/receipt?sig=abc',
        path: 'receipt/user-123/1-r.pdf',
      });
      const uc = makeUseCase();
      await uc.execute({ ...validPrivateInput, kind: 'receipt' });

      const call = mockStorage.upload.mock.calls[0]![0]!;
      expect(call.isPrivate).toBe(true);
    });

    it('calls storage.upload with isPrivate=true for kind "document"', async () => {
      mockStorage.upload.mockResolvedValue({
        url: 'https://signed.url/doc?sig=xyz',
        path: 'document/user-123/1-d.pdf',
      });
      const uc = makeUseCase();
      await uc.execute({ ...validPrivateInput, kind: 'document' });

      const call = mockStorage.upload.mock.calls[0]![0]!;
      expect(call.isPrivate).toBe(true);
    });

    it('calls storage.upload with isPrivate=false for kind "signature"', async () => {
      mockStorage.upload.mockResolvedValue({
        url: 'http://minio/delta-uploads/signature/user-123/1-s.png',
        path: 'signature/user-123/1-s.png',
      });
      const uc = makeUseCase();
      await uc.execute({ ...validPublicInput, kind: 'signature' });

      const call = mockStorage.upload.mock.calls[0]![0]!;
      expect(call.isPrivate).toBe(false);
    });

    it('calls storage.upload with isPrivate=false for kind "avatar"', async () => {
      mockStorage.upload.mockResolvedValue({
        url: 'http://minio/delta-uploads/avatar/user-456/1-avatar.png',
        path: 'avatar/user-456/1-avatar.png',
      });
      const uc = makeUseCase();
      await uc.execute({ ...validPublicInput, kind: 'avatar' });

      const call = mockStorage.upload.mock.calls[0]![0]!;
      expect(call.isPrivate).toBe(false);
    });

    it('calls storage.upload with isPrivate=false for kind "logo"', async () => {
      mockStorage.upload.mockResolvedValue({
        url: 'http://minio/delta-uploads/logo/user-456/1-logo.png',
        path: 'logo/user-456/1-logo.png',
      });
      const uc = makeUseCase();
      await uc.execute({ ...validPublicInput, kind: 'logo' });

      const call = mockStorage.upload.mock.calls[0]![0]!;
      expect(call.isPrivate).toBe(false);
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
      expect(call.buffer).toEqual(PDF_BUF);
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
