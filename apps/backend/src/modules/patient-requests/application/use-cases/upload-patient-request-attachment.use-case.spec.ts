import {
  UploadPatientRequestAttachmentUseCase,
  detectMimeFromBuffer,
  sanitizeFilename,
} from './upload-patient-request-attachment.use-case';
import type { IPatientRequestRepository } from '../../domain/repositories/patient-request.repository';
import type { IPatientRequestAttachmentRepository } from '../../domain/repositories/patient-request-attachment.repository';
import type { IStoragePort } from '../../../storage/application/ports/storage.port';
import { PatientRequestSessionService } from '../services/patient-request-session.service';
import { PatientRequest } from '../../domain/entities/patient-request.entity';
import { PatientRequestAttachment } from '../../domain/entities/patient-request-attachment.entity';
import { PatientRequestNotFoundError } from '../../domain/errors/patient-request-not-found.error';
import { PatientRequestNotPendingError } from '../../domain/errors/patient-request-not-pending.error';
import { InvalidSessionTokenError } from '../../domain/errors/invalid-session-token.error';
import {
  StorageValidationError,
  StorageUploadError,
} from '../../../storage/domain/errors/storage.error';

const mockSessionService: jest.Mocked<Pick<PatientRequestSessionService, 'sign' | 'validate'>> = {
  sign: jest.fn(),
  validate: jest.fn(), // by default does not throw
};

const mockRequestRepo: jest.Mocked<IPatientRequestRepository> = {
  save: jest.fn(),
  findByToken: jest.fn(),
  findById: jest.fn(),
  listByDoctor: jest.fn(),
  incrementLinkFailedAttempts: jest.fn(),
  updateLastCodeRequestedAt: jest.fn(),
  markFulfilled: jest.fn(),
};

const mockAttachmentRepo: jest.Mocked<IPatientRequestAttachmentRepository> = {
  save: jest.fn(),
  findByRequestId: jest.fn(),
  countByRequestId: jest.fn(),
  countByRequestIds: jest.fn(),
};

const mockStorage: jest.Mocked<IStoragePort> = {
  upload: jest.fn(),
  getSignedUrl: jest.fn(),
};

const makePendingRequest = (): PatientRequest =>
  PatientRequest.create({
    id: 'req-1',
    doctorId: 'doctor-1',
    patientId: 'patient-1',
    token: 'valid-token-xyz',
    title: 'Análisis',
    description: null,
    responseText: null,
    status: 'pending',
    failedAttempts: 0,
    lastCodeRequestedAt: null,
    fulfilledAt: null,
    createdAt: new Date(),
  });

/** Creates a minimal valid PDF buffer (starts with %PDF). */
function makePdfBuffer(): Buffer {
  const buf = Buffer.alloc(16);
  buf[0] = 0x25;
  buf[1] = 0x50;
  buf[2] = 0x44;
  buf[3] = 0x46; // %PDF
  return buf;
}

const makeSavedAttachment = (): PatientRequestAttachment =>
  PatientRequestAttachment.create({
    id: 'att-1',
    requestId: 'req-1',
    fileUrl: 'patient-requests/req-1/uuid-file.pdf',
    fileName: 'file.pdf',
    contentType: 'application/pdf',
    sizeBytes: 16,
    uploadedAt: new Date(),
  });

describe('UploadPatientRequestAttachmentUseCase', () => {
  let useCase: UploadPatientRequestAttachmentUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: session service validates without throwing
    mockSessionService.validate.mockImplementation(() => undefined);

    useCase = new UploadPatientRequestAttachmentUseCase(
      mockRequestRepo,
      mockAttachmentRepo,
      mockStorage,
      mockSessionService as unknown as PatientRequestSessionService,
    );

    mockRequestRepo.findByToken.mockResolvedValue(makePendingRequest());
    mockStorage.upload.mockResolvedValue({
      url: 'https://signed.example.com/file.pdf',
      path: 'patient-requests/req-1/uuid-file.pdf',
    });
    mockAttachmentRepo.save.mockResolvedValue(makeSavedAttachment());
  });

  it('returns id and fileName on success', async () => {
    const result = await useCase.execute({
      token: 'valid-token-xyz',
      sessionToken: 'any-session-token',
      file: {
        buffer: makePdfBuffer(),
        originalname: 'file.pdf',
        mimetype: 'application/pdf',
        size: 16,
      },
    });

    expect(result.id).toBe('att-1');
    expect(result.fileName).toBe('file.pdf');
    expect(mockStorage.upload).toHaveBeenCalledWith(expect.objectContaining({ isPrivate: true }));
  });

  it('delegates session validation to PatientRequestSessionService', async () => {
    await useCase.execute({
      token: 'valid-token-xyz',
      sessionToken: 'any-session-token',
      file: {
        buffer: makePdfBuffer(),
        originalname: 'file.pdf',
        mimetype: 'application/pdf',
        size: 16,
      },
    });

    expect(mockSessionService.validate).toHaveBeenCalledWith(
      'any-session-token',
      'req-1',
      'valid-token-xyz',
    );
  });

  it('stores the detected MIME type, not the client-declared MIME', async () => {
    await useCase.execute({
      token: 'valid-token-xyz',
      sessionToken: 'any-session-token',
      file: {
        buffer: makePdfBuffer(),
        originalname: 'file.pdf',
        mimetype: 'application/pdf',
        size: 16,
      },
    });

    // attachmentRepo.save should be called with contentType = 'application/pdf' (detected)
    expect(mockAttachmentRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: 'application/pdf' }),
    );
    // Storage upload should also use the detected mime
    expect(mockStorage.upload).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: 'application/pdf' }),
    );
  });

  it('throws InvalidSessionTokenError when sessionToken is empty', async () => {
    await expect(
      useCase.execute({
        token: 'valid-token-xyz',
        sessionToken: '',
        file: {
          buffer: makePdfBuffer(),
          originalname: 'file.pdf',
          mimetype: 'application/pdf',
          size: 16,
        },
      }),
    ).rejects.toBeInstanceOf(InvalidSessionTokenError);
  });

  it('throws PatientRequestNotFoundError when token does not exist', async () => {
    mockRequestRepo.findByToken.mockResolvedValue(null);

    await expect(
      useCase.execute({
        token: 'unknown',
        sessionToken: 'any-session-token',
        file: {
          buffer: makePdfBuffer(),
          originalname: 'file.pdf',
          mimetype: 'application/pdf',
          size: 16,
        },
      }),
    ).rejects.toBeInstanceOf(PatientRequestNotFoundError);
  });

  it('throws PatientRequestNotPendingError when request is fulfilled', async () => {
    mockRequestRepo.findByToken.mockResolvedValue(
      PatientRequest.create({
        ...makePendingRequest(),
        id: 'req-1',
        status: 'fulfilled',
        createdAt: new Date(),
        fulfilledAt: new Date(),
      }),
    );

    await expect(
      useCase.execute({
        token: 'valid-token-xyz',
        sessionToken: 'any-session-token',
        file: {
          buffer: makePdfBuffer(),
          originalname: 'file.pdf',
          mimetype: 'application/pdf',
          size: 16,
        },
      }),
    ).rejects.toBeInstanceOf(PatientRequestNotPendingError);
  });

  it('throws InvalidSessionTokenError when session service rejects the token', async () => {
    mockSessionService.validate.mockImplementation(() => {
      throw new InvalidSessionTokenError();
    });

    await expect(
      useCase.execute({
        token: 'valid-token-xyz',
        sessionToken: 'tampered-token',
        file: {
          buffer: makePdfBuffer(),
          originalname: 'file.pdf',
          mimetype: 'application/pdf',
          size: 16,
        },
      }),
    ).rejects.toBeInstanceOf(InvalidSessionTokenError);
  });

  it('throws StorageValidationError for disallowed MIME type', async () => {
    await expect(
      useCase.execute({
        token: 'valid-token-xyz',
        sessionToken: 'any-session-token',
        file: {
          buffer: Buffer.alloc(16),
          originalname: 'file.gif',
          mimetype: 'image/gif',
          size: 16,
        },
      }),
    ).rejects.toBeInstanceOf(StorageValidationError);
  });

  it('throws StorageValidationError when file exceeds 10 MB', async () => {
    const bigSize = 11 * 1024 * 1024;
    await expect(
      useCase.execute({
        token: 'valid-token-xyz',
        sessionToken: 'any-session-token',
        file: {
          buffer: makePdfBuffer(),
          originalname: 'big.pdf',
          mimetype: 'application/pdf',
          size: bigSize,
        },
      }),
    ).rejects.toBeInstanceOf(StorageValidationError);
  });

  it('throws StorageValidationError when magic bytes do not match declared MIME', async () => {
    // Buffer has JPEG magic bytes but declared as PDF
    const jpegBuf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00, 0x00, 0x00]);
    await expect(
      useCase.execute({
        token: 'valid-token-xyz',
        sessionToken: 'any-session-token',
        file: { buffer: jpegBuf, originalname: 'file.pdf', mimetype: 'application/pdf', size: 8 },
      }),
    ).rejects.toBeInstanceOf(StorageValidationError);
  });

  it('throws StorageUploadError (502) when storage upload fails', async () => {
    mockStorage.upload.mockRejectedValue(new Error('S3 connection timeout'));

    await expect(
      useCase.execute({
        token: 'valid-token-xyz',
        sessionToken: 'any-session-token',
        file: {
          buffer: makePdfBuffer(),
          originalname: 'file.pdf',
          mimetype: 'application/pdf',
          size: 16,
        },
      }),
    ).rejects.toBeInstanceOf(StorageUploadError);
  });
});

// ---------------------------------------------------------------------------
// detectMimeFromBuffer utility tests
// ---------------------------------------------------------------------------

describe('detectMimeFromBuffer', () => {
  it('detects PDF from %PDF magic bytes', () => {
    const buf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00]);
    expect(detectMimeFromBuffer(buf)).toBe('application/pdf');
  });

  it('detects JPEG from FF D8 FF magic bytes', () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
    expect(detectMimeFromBuffer(buf)).toBe('image/jpeg');
  });

  it('detects PNG from magic bytes', () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    expect(detectMimeFromBuffer(buf)).toBe('image/png');
  });

  it('returns null for unknown bytes', () => {
    const buf = Buffer.from([0x00, 0x00, 0x00, 0x00]);
    expect(detectMimeFromBuffer(buf)).toBeNull();
  });

  it('returns null for buffer too short', () => {
    const buf = Buffer.from([0x25, 0x50]);
    expect(detectMimeFromBuffer(buf)).toBeNull();
  });
});

describe('sanitizeFilename', () => {
  it('keeps safe characters', () => {
    expect(sanitizeFilename('analysis-2026.pdf')).toBe('analysis-2026.pdf');
  });

  it('replaces unsafe characters with underscore', () => {
    // '.' is allowed (preserves extensions); '/' is replaced with '_'
    expect(sanitizeFilename('../../etc/passwd')).toBe('.._.._etc_passwd');
  });

  it('handles spaces', () => {
    expect(sanitizeFilename('my file.pdf')).toBe('my_file.pdf');
  });
});
