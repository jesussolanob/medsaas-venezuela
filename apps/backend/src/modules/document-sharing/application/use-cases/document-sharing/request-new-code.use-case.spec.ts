import { ConfigService } from '@nestjs/config';
import { RequestNewCodeUseCase } from './request-new-code.use-case';
import type { ISharedDocumentLinkRepository } from '../../../domain/repositories/shared-document-link.repository';
import type { IDocumentAccessCodeRepository } from '../../../domain/repositories/document-access-code.repository';
import type { IPatientRepository } from '../../../../patients/domain/repositories/patient.repository';
import type { MailerService } from '../../../../email/application/services/mailer.service';
import { SharedDocumentLink } from '../../../domain/entities/shared-document-link.entity';
import { DocumentAccessCode } from '../../../domain/entities/document-access-code.entity';
import { DocumentLinkNotFoundError } from '../../../domain/errors/document-link-not-found.error';
import { DocumentLinkNotActiveError } from '../../../domain/errors/document-link-not-active.error';
import { CodeRequestRateLimitedError } from '../../../domain/errors/code-request-rate-limited.error';

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

const mockPatientRepo = {
  findById: jest.fn(),
  findByCedulaHash: jest.fn(),
  findByEmailHash: jest.fn(),
  list: jest.fn(),
  findAllByDoctor: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  softDelete: jest.fn(),
  logReveal: jest.fn(),
} as jest.Mocked<IPatientRepository>;

const mockMailer = {
  sendTemplate: jest.fn(),
} as jest.Mocked<Pick<MailerService, 'sendTemplate'>>;

const mockConfig = {
  get: jest.fn((key: string) => {
    if (key === 'APP_BASE_URL') return 'http://localhost:3000';
    return undefined;
  }),
} as unknown as ConfigService;

const makeActiveLink = (lastCodeRequestedAt: Date | null = null): SharedDocumentLink =>
  SharedDocumentLink.create({
    id: 'link-1',
    consultationId: 'consult-1',
    doctorId: 'doctor-1',
    patientId: 'patient-1',
    token: 'valid-token',
    sections: { report: true, prescriptions: false, ehr: false },
    status: 'active',
    failedAttempts: 0,
    lastCodeRequestedAt,
    createdAt: new Date(),
  });

const makeCode = (): DocumentAccessCode =>
  DocumentAccessCode.create({
    id: 'code-new',
    linkId: 'link-1',
    code: '999888',
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    usedAt: null,
    failedAttempts: 0,
    createdAt: new Date(),
  });

describe('RequestNewCodeUseCase', () => {
  let useCase: RequestNewCodeUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    useCase = new RequestNewCodeUseCase(
      mockLinkRepo,
      mockCodeRepo,
      mockPatientRepo,
      mockMailer as unknown as MailerService,
      mockConfig,
    );

    mockLinkRepo.findByToken.mockResolvedValue(makeActiveLink());
    mockLinkRepo.updateLastCodeRequestedAt.mockResolvedValue();
    mockCodeRepo.save.mockResolvedValue(makeCode());
    mockPatientRepo.findById.mockResolvedValue(null);
  });

  it('returns expiresAt on success', async () => {
    const result = await useCase.execute({ token: 'valid-token' });
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(mockCodeRepo.save).toHaveBeenCalledTimes(1);
  });

  it('updates last_code_requested_at before persisting the new code', async () => {
    await useCase.execute({ token: 'valid-token' });
    expect(mockLinkRepo.updateLastCodeRequestedAt).toHaveBeenCalledWith('link-1', expect.any(Date));
  });

  it('throws DocumentLinkNotFoundError when token does not exist', async () => {
    mockLinkRepo.findByToken.mockResolvedValue(null);

    await expect(useCase.execute({ token: 'unknown' })).rejects.toBeInstanceOf(
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

    await expect(useCase.execute({ token: 'valid-token' })).rejects.toBeInstanceOf(
      DocumentLinkNotActiveError,
    );
  });

  it('does not throw when email fails (fire-and-forget)', async () => {
    mockPatientRepo.findById.mockResolvedValue({
      id: 'patient-1',
      doctorId: 'doctor-1',
      fullName: 'Test',
      email: 'test@test.com',
    } as Awaited<ReturnType<typeof mockPatientRepo.findById>>);
    mockMailer.sendTemplate.mockRejectedValue(new Error('SMTP error'));

    await expect(useCase.execute({ token: 'valid-token' })).resolves.toBeDefined();
  });

  describe('rate limiting — 60-second cooldown', () => {
    it('throws CodeRequestRateLimitedError when called within 60 seconds', async () => {
      const recentRequest = new Date(Date.now() - 30_000); // 30s ago
      mockLinkRepo.findByToken.mockResolvedValue(makeActiveLink(recentRequest));

      await expect(useCase.execute({ token: 'valid-token' })).rejects.toBeInstanceOf(
        CodeRequestRateLimitedError,
      );
    });

    it('does not update last_code_requested_at when rate-limited', async () => {
      const recentRequest = new Date(Date.now() - 30_000);
      mockLinkRepo.findByToken.mockResolvedValue(makeActiveLink(recentRequest));

      await expect(useCase.execute({ token: 'valid-token' })).rejects.toBeInstanceOf(
        CodeRequestRateLimitedError,
      );

      expect(mockLinkRepo.updateLastCodeRequestedAt).not.toHaveBeenCalled();
      expect(mockCodeRepo.save).not.toHaveBeenCalled();
    });

    it('allows request when last request was more than 60 seconds ago', async () => {
      const oldRequest = new Date(Date.now() - 61_000); // 61s ago
      mockLinkRepo.findByToken.mockResolvedValue(makeActiveLink(oldRequest));

      const result = await useCase.execute({ token: 'valid-token' });

      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(mockLinkRepo.updateLastCodeRequestedAt).toHaveBeenCalledWith(
        'link-1',
        expect.any(Date),
      );
    });

    it('allows first request when lastCodeRequestedAt is null', async () => {
      mockLinkRepo.findByToken.mockResolvedValue(makeActiveLink(null));

      const result = await useCase.execute({ token: 'valid-token' });

      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it('sets the rate-limit gate BEFORE creating the code (even if code creation fails)', async () => {
      mockCodeRepo.save.mockRejectedValue(new Error('DB error'));

      await expect(useCase.execute({ token: 'valid-token' })).rejects.toThrow('DB error');

      // The cooldown timestamp was set despite the failure
      expect(mockLinkRepo.updateLastCodeRequestedAt).toHaveBeenCalled();
    });
  });
});
