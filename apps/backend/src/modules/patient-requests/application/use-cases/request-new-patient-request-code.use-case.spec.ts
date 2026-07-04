import { ConfigService } from '@nestjs/config';
import { RequestNewPatientRequestCodeUseCase } from './request-new-patient-request-code.use-case';
import type { IPatientRequestRepository } from '../../domain/repositories/patient-request.repository';
import type { IPatientRequestAccessCodeRepository } from '../../domain/repositories/patient-request-access-code.repository';
import type { IPatientRepository } from '../../../patients/domain/repositories/patient.repository';
import type { MailerService } from '../../../email/application/services/mailer.service';
import { PatientRequest } from '../../domain/entities/patient-request.entity';
import { PatientRequestAccessCode } from '../../domain/entities/patient-request-access-code.entity';
import { PatientRequestNotPendingError } from '../../domain/errors/patient-request-not-pending.error';
import { CodeRequestRateLimitedError } from '../../domain/errors/code-request-rate-limited.error';
import { InvalidAccessCodeError } from '../../domain/errors/invalid-access-code.error';

const mockRequestRepo: jest.Mocked<IPatientRequestRepository> = {
  save: jest.fn(),
  findByToken: jest.fn(),
  findById: jest.fn(),
  listByDoctor: jest.fn(),
  incrementLinkFailedAttempts: jest.fn(),
  updateLastCodeRequestedAt: jest.fn(),
  markFulfilled: jest.fn(),
};

const mockCodeRepo: jest.Mocked<IPatientRequestAccessCodeRepository> = {
  save: jest.fn(),
  findLatestByRequestId: jest.fn(),
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

const mockMailer = {
  sendTemplate: jest.fn(),
} as jest.Mocked<Pick<MailerService, 'sendTemplate'>>;

const mockConfig = {
  get: jest.fn((key: string) => {
    if (key === 'APP_BASE_URL') return 'http://localhost:3000';
    return undefined;
  }),
} as unknown as ConfigService;

const makeActiveRequest = (lastCodeRequestedAt: Date | null = null): PatientRequest =>
  PatientRequest.create({
    id: 'req-1',
    doctorId: 'doctor-1',
    patientId: 'patient-1',
    token: 'valid-token',
    title: 'Análisis de sangre',
    description: null,
    responseText: null,
    status: 'pending',
    failedAttempts: 0,
    lastCodeRequestedAt,
    fulfilledAt: null,
    createdAt: new Date(),
  });

const makeCode = (): PatientRequestAccessCode =>
  PatientRequestAccessCode.create({
    id: 'code-new',
    requestId: 'req-1',
    code: '999888',
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    usedAt: null,
    failedAttempts: 0,
    createdAt: new Date(),
  });

describe('RequestNewPatientRequestCodeUseCase', () => {
  let useCase: RequestNewPatientRequestCodeUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    useCase = new RequestNewPatientRequestCodeUseCase(
      mockRequestRepo,
      mockCodeRepo,
      mockPatientRepo,
      mockMailer as unknown as MailerService,
      mockConfig,
    );

    mockRequestRepo.findByToken.mockResolvedValue(makeActiveRequest());
    mockRequestRepo.updateLastCodeRequestedAt.mockResolvedValue();
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
    expect(mockRequestRepo.updateLastCodeRequestedAt).toHaveBeenCalledWith(
      'req-1',
      expect.any(Date),
    );
  });

  // ORACLE-SAFE: not-found returns same 422 as wrong code (issue #1)
  it('throws InvalidAccessCodeError (not 404) when token does not exist', async () => {
    mockRequestRepo.findByToken.mockResolvedValue(null);

    await expect(useCase.execute({ token: 'unknown' })).rejects.toBeInstanceOf(
      InvalidAccessCodeError,
    );
  });

  it('throws PatientRequestNotPendingError when request is fulfilled', async () => {
    mockRequestRepo.findByToken.mockResolvedValue(
      PatientRequest.create({
        ...makeActiveRequest(),
        id: 'req-2',
        status: 'fulfilled',
        createdAt: new Date(),
        fulfilledAt: new Date(),
      }),
    );

    await expect(useCase.execute({ token: 'valid-token' })).rejects.toBeInstanceOf(
      PatientRequestNotPendingError,
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
      mockRequestRepo.findByToken.mockResolvedValue(makeActiveRequest(recentRequest));

      await expect(useCase.execute({ token: 'valid-token' })).rejects.toBeInstanceOf(
        CodeRequestRateLimitedError,
      );
    });

    it('does not update last_code_requested_at when rate-limited', async () => {
      const recentRequest = new Date(Date.now() - 30_000);
      mockRequestRepo.findByToken.mockResolvedValue(makeActiveRequest(recentRequest));

      await expect(useCase.execute({ token: 'valid-token' })).rejects.toBeInstanceOf(
        CodeRequestRateLimitedError,
      );

      expect(mockRequestRepo.updateLastCodeRequestedAt).not.toHaveBeenCalled();
      expect(mockCodeRepo.save).not.toHaveBeenCalled();
    });

    it('allows request when last request was more than 60 seconds ago', async () => {
      const oldRequest = new Date(Date.now() - 61_000);
      mockRequestRepo.findByToken.mockResolvedValue(makeActiveRequest(oldRequest));

      const result = await useCase.execute({ token: 'valid-token' });

      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(mockRequestRepo.updateLastCodeRequestedAt).toHaveBeenCalledWith(
        'req-1',
        expect.any(Date),
      );
    });

    it('sets the rate-limit gate BEFORE creating the code (even if code creation fails)', async () => {
      mockCodeRepo.save.mockRejectedValue(new Error('DB error'));

      await expect(useCase.execute({ token: 'valid-token' })).rejects.toThrow('DB error');

      expect(mockRequestRepo.updateLastCodeRequestedAt).toHaveBeenCalled();
    });
  });
});
