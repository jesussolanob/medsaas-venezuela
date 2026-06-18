import { ConfigService } from '@nestjs/config';
import { VerifyCodeUseCase } from './verify-code.use-case';
import type { ISharedDocumentLinkRepository } from '../../../domain/repositories/shared-document-link.repository';
import type { IDocumentAccessCodeRepository } from '../../../domain/repositories/document-access-code.repository';
import { SharedDocumentLink } from '../../../domain/entities/shared-document-link.entity';
import { DocumentAccessCode } from '../../../domain/entities/document-access-code.entity';
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
    useCase = new VerifyCodeUseCase(mockLinkRepo, mockCodeRepo, mockConfig);

    mockLinkRepo.findByToken.mockResolvedValue(makeActiveLink());
    mockLinkRepo.incrementLinkFailedAttempts.mockResolvedValue();
    mockCodeRepo.findLatestByLinkId.mockResolvedValue(makeValidCode());
    mockCodeRepo.markUsed.mockResolvedValue();
    mockCodeRepo.incrementFailedAttempts.mockResolvedValue();
  });

  it('returns sessionToken, sections, expiresAt on correct code', async () => {
    const result = await useCase.execute({ token: 'valid-token-abc123', code: '654321' });

    expect(result.sessionToken).toBeTruthy();
    expect(result.sections).toEqual({ report: true, prescriptions: true, ehr: false });
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(mockCodeRepo.markUsed).toHaveBeenCalledWith('code-1', expect.any(Date));
  });

  it('throws DocumentLinkNotFoundError when link does not exist', async () => {
    mockLinkRepo.findByToken.mockResolvedValue(null);

    await expect(useCase.execute({ token: 'unknown', code: '123456' })).rejects.toBeInstanceOf(
      DocumentLinkNotFoundError,
    );
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
      useCase.execute({ token: 'valid-token-abc123', code: '654321' }),
    ).rejects.toBeInstanceOf(DocumentLinkNotActiveError);
  });

  it('throws InvalidAccessCodeError when no code exists', async () => {
    mockCodeRepo.findLatestByLinkId.mockResolvedValue(null);

    await expect(
      useCase.execute({ token: 'valid-token-abc123', code: '654321' }),
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
      useCase.execute({ token: 'valid-token-abc123', code: '654321' }),
    ).rejects.toBeInstanceOf(InvalidAccessCodeError);
  });

  it('throws InvalidAccessCodeError when code is already used', async () => {
    mockCodeRepo.findLatestByLinkId.mockResolvedValue(makeValidCode({ usedAt: new Date() }));

    await expect(
      useCase.execute({ token: 'valid-token-abc123', code: '654321' }),
    ).rejects.toBeInstanceOf(InvalidAccessCodeError);
  });

  it('throws InvalidAccessCodeError when code is blocked (5 code-level failed attempts)', async () => {
    mockCodeRepo.findLatestByLinkId.mockResolvedValue(makeValidCode({ failedAttempts: 5 }));

    await expect(
      useCase.execute({ token: 'valid-token-abc123', code: '654321' }),
    ).rejects.toBeInstanceOf(InvalidAccessCodeError);
  });

  it('increments BOTH code-level and link-level failed_attempts on wrong code', async () => {
    await expect(
      useCase.execute({ token: 'valid-token-abc123', code: '000000' }),
    ).rejects.toBeInstanceOf(InvalidAccessCodeError);

    expect(mockCodeRepo.incrementFailedAttempts).toHaveBeenCalledWith('code-1');
    expect(mockLinkRepo.incrementLinkFailedAttempts).toHaveBeenCalledWith('link-1');
    expect(mockCodeRepo.markUsed).not.toHaveBeenCalled();
  });

  it('does NOT increment link-level counter on correct code', async () => {
    await useCase.execute({ token: 'valid-token-abc123', code: '654321' });

    expect(mockLinkRepo.incrementLinkFailedAttempts).not.toHaveBeenCalled();
  });

  describe('link-level brute-force protection', () => {
    it('throws InvalidAccessCodeError (not a different type) when link is bruteforce-blocked', async () => {
      // 10 accumulated failures on the link
      mockLinkRepo.findByToken.mockResolvedValue(makeActiveLink(10));

      await expect(
        useCase.execute({ token: 'valid-token-abc123', code: '654321' }),
      ).rejects.toBeInstanceOf(InvalidAccessCodeError);
    });

    it('does NOT check the code when the link is bruteforce-blocked', async () => {
      mockLinkRepo.findByToken.mockResolvedValue(makeActiveLink(10));

      await expect(
        useCase.execute({ token: 'valid-token-abc123', code: '654321' }),
      ).rejects.toBeInstanceOf(InvalidAccessCodeError);

      // Code repo should never be consulted when the link cap is reached
      expect(mockCodeRepo.findLatestByLinkId).not.toHaveBeenCalled();
      expect(mockCodeRepo.incrementFailedAttempts).not.toHaveBeenCalled();
    });

    it('is not reset by requesting a new code (link counter is separate)', async () => {
      // Simulate 9 accumulated link failures — still below threshold
      mockLinkRepo.findByToken.mockResolvedValue(makeActiveLink(9));
      mockCodeRepo.findLatestByLinkId.mockResolvedValue(makeValidCode({ code: '654321' }));

      // Wrong code → increments link to 10
      await expect(
        useCase.execute({ token: 'valid-token-abc123', code: '000000' }),
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
    const useCaseNoSecret = new VerifyCodeUseCase(mockLinkRepo, mockCodeRepo, mockConfigNoSecret);
    const exp = new Date(Date.now() + 15 * 60 * 1000);

    expect(() => useCaseNoSecret.signSessionToken('link-1', 'tok', exp)).toThrow(
      MissingHmacSecretError,
    );
  });
});
