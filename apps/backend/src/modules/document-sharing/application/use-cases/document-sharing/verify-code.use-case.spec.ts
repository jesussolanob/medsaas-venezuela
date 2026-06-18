import { ConfigService } from '@nestjs/config';
import { VerifyCodeUseCase, normalizeCedula } from './verify-code.use-case';
import type { ISharedDocumentLinkRepository } from '../../../domain/repositories/shared-document-link.repository';
import type { IDocumentAccessCodeRepository } from '../../../domain/repositories/document-access-code.repository';
import type { IPatientRepository } from '../../../../patients/domain/repositories/patient.repository';
import { SharedDocumentLink } from '../../../domain/entities/shared-document-link.entity';
import { DocumentAccessCode } from '../../../domain/entities/document-access-code.entity';
import { Patient } from '../../../../patients/domain/entities/patient.entity';
import { DocumentLinkNotFoundError } from '../../../domain/errors/document-link-not-found.error';
import { DocumentLinkNotActiveError } from '../../../domain/errors/document-link-not-active.error';
import { InvalidAccessCodeError } from '../../../domain/errors/invalid-access-code.error';
import { MissingHmacSecretError } from '../../../domain/errors/missing-hmac-secret.error';

const mockLinkRepo: jest.Mocked<ISharedDocumentLinkRepository> = {
  save: jest.fn(),
  findByToken: jest.fn(),
  findById: jest.fn(),
  incrementLinkFailedAttempts: jest.fn(),
  updateLastCodeRequestedAt: jest.fn(),
};

const mockCodeRepo: jest.Mocked<IDocumentAccessCodeRepository> = {
  save: jest.fn(),
  findLatestByLinkId: jest.fn(),
  incrementFailedAttempts: jest.fn(),
  markUsed: jest.fn(),
};

const mockPatientRepo: jest.Mocked<IPatientRepository> = {
  findById: jest.fn(),
  findByCedulaHash: jest.fn(),
  findByEmailHash: jest.fn(),
  list: jest.fn(),
  findAllByDoctor: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  softDelete: jest.fn(),
  logReveal: jest.fn(),
};

/** Helper — builds a minimal Patient with the given cédula. */
const makePatient = (cedula: string | null): Patient =>
  Patient.create({
    id: 'patient-1',
    doctorId: 'doctor-1',
    fullName: 'Test Patient',
    cedula,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

const mockConfig = {
  get: jest.fn((key: string) => {
    if (key === 'AUTH_RESOLVE_SECRET') return 'test-secret-key-for-unit-tests';
    return undefined;
  }),
} as unknown as ConfigService;

const mockConfigNoSecret = {
  get: jest.fn(() => undefined),
} as unknown as ConfigService;

const makeActiveLink = (failedAttempts = 0): SharedDocumentLink =>
  SharedDocumentLink.create({
    id: 'link-1',
    consultationId: 'consult-1',
    doctorId: 'doctor-1',
    patientId: 'patient-1',
    token: 'valid-token-abc123',
    sections: { report: true, prescriptions: true, ehr: false },
    status: 'active',
    failedAttempts,
    lastCodeRequestedAt: null,
    createdAt: new Date(),
  });

const makeValidCode = (
  overrides: Partial<{ code: string; failedAttempts: number; usedAt: Date | null }> = {},
): DocumentAccessCode =>
  DocumentAccessCode.create({
    id: 'code-1',
    linkId: 'link-1',
    code: overrides.code ?? '654321',
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    usedAt: overrides.usedAt ?? null,
    failedAttempts: overrides.failedAttempts ?? 0,
    createdAt: new Date(),
  });

describe('VerifyCodeUseCase', () => {
  let useCase: VerifyCodeUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    useCase = new VerifyCodeUseCase(mockLinkRepo, mockCodeRepo, mockPatientRepo, mockConfig);

    mockLinkRepo.findByToken.mockResolvedValue(makeActiveLink());
    mockLinkRepo.incrementLinkFailedAttempts.mockResolvedValue();
    mockCodeRepo.findLatestByLinkId.mockResolvedValue(makeValidCode());
    mockCodeRepo.markUsed.mockResolvedValue();
    mockCodeRepo.incrementFailedAttempts.mockResolvedValue();
    // Default: patient exists and has a matching cédula
    mockPatientRepo.findById.mockResolvedValue(makePatient('V-12.345.678'));
  });

  it('returns sessionToken, sections, expiresAt on correct code and correct cédula', async () => {
    const result = await useCase.execute({
      token: 'valid-token-abc123',
      code: '654321',
      cedula: 'V-12.345.678',
    });

    expect(result.sessionToken).toBeTruthy();
    expect(result.sections).toEqual({ report: true, prescriptions: true, ehr: false });
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(mockCodeRepo.markUsed).toHaveBeenCalledWith('code-1', expect.any(Date));
  });

  it('throws DocumentLinkNotFoundError when link does not exist', async () => {
    mockLinkRepo.findByToken.mockResolvedValue(null);

    await expect(
      useCase.execute({ token: 'unknown', code: '123456', cedula: 'V-12345678' }),
    ).rejects.toBeInstanceOf(DocumentLinkNotFoundError);
  });

  it('throws DocumentLinkNotActiveError when link is revoked', async () => {
    mockLinkRepo.findByToken.mockResolvedValue(
      SharedDocumentLink.create({
        ...makeActiveLink(),
        id: 'link-2',
        status: 'revoked',
        createdAt: new Date(),
      }),
    );

    await expect(
      useCase.execute({ token: 'valid-token-abc123', code: '654321', cedula: 'V-12.345.678' }),
    ).rejects.toBeInstanceOf(DocumentLinkNotActiveError);
  });

  it('throws InvalidAccessCodeError when no code exists', async () => {
    mockCodeRepo.findLatestByLinkId.mockResolvedValue(null);

    await expect(
      useCase.execute({ token: 'valid-token-abc123', code: '654321', cedula: 'V-12.345.678' }),
    ).rejects.toBeInstanceOf(InvalidAccessCodeError);
  });

  it('throws InvalidAccessCodeError when code is expired', async () => {
    mockCodeRepo.findLatestByLinkId.mockResolvedValue(
      DocumentAccessCode.create({
        id: 'code-1',
        linkId: 'link-1',
        code: '654321',
        expiresAt: new Date('2020-01-01'), // expired
        usedAt: null,
        failedAttempts: 0,
        createdAt: new Date(),
      }),
    );

    await expect(
      useCase.execute({ token: 'valid-token-abc123', code: '654321', cedula: 'V-12.345.678' }),
    ).rejects.toBeInstanceOf(InvalidAccessCodeError);
  });

  it('throws InvalidAccessCodeError when code is already used', async () => {
    mockCodeRepo.findLatestByLinkId.mockResolvedValue(makeValidCode({ usedAt: new Date() }));

    await expect(
      useCase.execute({ token: 'valid-token-abc123', code: '654321', cedula: 'V-12.345.678' }),
    ).rejects.toBeInstanceOf(InvalidAccessCodeError);
  });

  it('throws InvalidAccessCodeError when code is blocked (5 code-level failed attempts)', async () => {
    mockCodeRepo.findLatestByLinkId.mockResolvedValue(makeValidCode({ failedAttempts: 5 }));

    await expect(
      useCase.execute({ token: 'valid-token-abc123', code: '654321', cedula: 'V-12.345.678' }),
    ).rejects.toBeInstanceOf(InvalidAccessCodeError);
  });

  it('increments BOTH code-level and link-level failed_attempts on wrong code (correct cédula)', async () => {
    await expect(
      useCase.execute({ token: 'valid-token-abc123', code: '000000', cedula: 'V-12.345.678' }),
    ).rejects.toBeInstanceOf(InvalidAccessCodeError);

    expect(mockCodeRepo.incrementFailedAttempts).toHaveBeenCalledWith('code-1');
    expect(mockLinkRepo.incrementLinkFailedAttempts).toHaveBeenCalledWith('link-1');
    expect(mockCodeRepo.markUsed).not.toHaveBeenCalled();
  });

  it('does NOT increment link-level counter on correct code and correct cédula', async () => {
    await useCase.execute({ token: 'valid-token-abc123', code: '654321', cedula: 'V-12.345.678' });

    expect(mockLinkRepo.incrementLinkFailedAttempts).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Cédula verification — new requirements
  // ---------------------------------------------------------------------------

  describe('cédula verification', () => {
    it('throws InvalidAccessCodeError on incorrect cédula even when code is correct', async () => {
      await expect(
        useCase.execute({ token: 'valid-token-abc123', code: '654321', cedula: 'V-99999999' }),
      ).rejects.toBeInstanceOf(InvalidAccessCodeError);
    });

    it('increments BOTH counters when cédula is wrong (code correct)', async () => {
      await expect(
        useCase.execute({ token: 'valid-token-abc123', code: '654321', cedula: 'V-99999999' }),
      ).rejects.toBeInstanceOf(InvalidAccessCodeError);

      expect(mockCodeRepo.incrementFailedAttempts).toHaveBeenCalledWith('code-1');
      expect(mockLinkRepo.incrementLinkFailedAttempts).toHaveBeenCalledWith('link-1');
      expect(mockCodeRepo.markUsed).not.toHaveBeenCalled();
    });

    it('throws InvalidAccessCodeError when patient has no registered cédula (null)', async () => {
      mockPatientRepo.findById.mockResolvedValue(makePatient(null));

      await expect(
        useCase.execute({ token: 'valid-token-abc123', code: '654321', cedula: 'V-12345678' }),
      ).rejects.toBeInstanceOf(InvalidAccessCodeError);

      expect(mockCodeRepo.incrementFailedAttempts).toHaveBeenCalledWith('code-1');
      expect(mockLinkRepo.incrementLinkFailedAttempts).toHaveBeenCalledWith('link-1');
    });

    it('throws InvalidAccessCodeError when patient record is not found', async () => {
      mockPatientRepo.findById.mockResolvedValue(null);

      await expect(
        useCase.execute({ token: 'valid-token-abc123', code: '654321', cedula: 'V-12345678' }),
      ).rejects.toBeInstanceOf(InvalidAccessCodeError);

      expect(mockCodeRepo.incrementFailedAttempts).toHaveBeenCalledWith('code-1');
      expect(mockLinkRepo.incrementLinkFailedAttempts).toHaveBeenCalledWith('link-1');
    });

    it('matches cédula with different formatting (normalization)', async () => {
      // Stored as "V-12.345.678", input as "v12345678" — should match after normalization
      mockPatientRepo.findById.mockResolvedValue(makePatient('V-12.345.678'));

      const result = await useCase.execute({
        token: 'valid-token-abc123',
        code: '654321',
        cedula: 'v12345678',
      });

      expect(result.sessionToken).toBeTruthy();
      expect(mockCodeRepo.markUsed).toHaveBeenCalled();
    });

    it('does NOT mark code as used when only cédula is wrong', async () => {
      mockPatientRepo.findById.mockResolvedValue(makePatient('V-12.345.678'));

      await expect(
        useCase.execute({ token: 'valid-token-abc123', code: '654321', cedula: 'E-99999' }),
      ).rejects.toBeInstanceOf(InvalidAccessCodeError);

      expect(mockCodeRepo.markUsed).not.toHaveBeenCalled();
    });
  });

  describe('link-level brute-force protection', () => {
    it('throws InvalidAccessCodeError (not a different type) when link is bruteforce-blocked', async () => {
      // 10 accumulated failures on the link
      mockLinkRepo.findByToken.mockResolvedValue(makeActiveLink(10));

      await expect(
        useCase.execute({ token: 'valid-token-abc123', code: '654321', cedula: 'V-12.345.678' }),
      ).rejects.toBeInstanceOf(InvalidAccessCodeError);
    });

    it('does NOT check the code when the link is bruteforce-blocked', async () => {
      mockLinkRepo.findByToken.mockResolvedValue(makeActiveLink(10));

      await expect(
        useCase.execute({ token: 'valid-token-abc123', code: '654321', cedula: 'V-12.345.678' }),
      ).rejects.toBeInstanceOf(InvalidAccessCodeError);

      // Code repo and patient repo should never be consulted when the link cap is reached
      expect(mockCodeRepo.findLatestByLinkId).not.toHaveBeenCalled();
      expect(mockCodeRepo.incrementFailedAttempts).not.toHaveBeenCalled();
      expect(mockPatientRepo.findById).not.toHaveBeenCalled();
    });

    it('is not reset by requesting a new code (link counter is separate)', async () => {
      // Simulate 9 accumulated link failures — still below threshold
      mockLinkRepo.findByToken.mockResolvedValue(makeActiveLink(9));
      mockCodeRepo.findLatestByLinkId.mockResolvedValue(makeValidCode({ code: '654321' }));

      // Wrong code → increments link to 10
      await expect(
        useCase.execute({ token: 'valid-token-abc123', code: '000000', cedula: 'V-12.345.678' }),
      ).rejects.toBeInstanceOf(InvalidAccessCodeError);

      expect(mockLinkRepo.incrementLinkFailedAttempts).toHaveBeenCalledWith('link-1');
    });
  });

  it('produces a verifiable session token', () => {
    const exp = new Date(Date.now() + 15 * 60 * 1000);
    const token = useCase.signSessionToken('link-1', 'test-token', exp);
    expect(token).toContain('.');

    const [payloadB64, sigHex] = token.split('.');
    const payload = JSON.parse(Buffer.from(payloadB64!, 'base64url').toString());
    expect(payload.linkId).toBe('link-1');
    expect(payload.token).toBe('test-token');
    expect(sigHex).toHaveLength(64); // SHA-256 hex = 64 chars
  });

  it('throws MissingHmacSecretError when AUTH_RESOLVE_SECRET is absent', () => {
    const useCaseNoSecret = new VerifyCodeUseCase(
      mockLinkRepo,
      mockCodeRepo,
      mockPatientRepo,
      mockConfigNoSecret,
    );
    const exp = new Date(Date.now() + 15 * 60 * 1000);

    expect(() => useCaseNoSecret.signSessionToken('link-1', 'tok', exp)).toThrow(
      MissingHmacSecretError,
    );
  });
});

// ---------------------------------------------------------------------------
// normalizeCedula — unit tests for the exported utility
// ---------------------------------------------------------------------------

describe('normalizeCedula', () => {
  it('strips hyphens and dots, uppercases', () => {
    expect(normalizeCedula('V-12.345.678')).toBe('V12345678');
  });

  it('strips spaces', () => {
    expect(normalizeCedula('V 12 345 678')).toBe('V12345678');
  });

  it('uppercases lowercase prefix', () => {
    expect(normalizeCedula('v12345678')).toBe('V12345678');
  });

  it('leaves digits-only input unchanged', () => {
    expect(normalizeCedula('12345678')).toBe('12345678');
  });

  it('handles mixed formatting consistently', () => {
    const a = normalizeCedula('V-12.345.678');
    const b = normalizeCedula('v12345678');
    const c = normalizeCedula('V 12 345 678');
    expect(a).toBe(b);
    expect(b).toBe(c);
  });
});
