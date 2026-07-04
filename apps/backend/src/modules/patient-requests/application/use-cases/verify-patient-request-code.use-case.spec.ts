import {
  VerifyPatientRequestCodeUseCase,
  normalizeCedula,
  cedulasMatch,
} from './verify-patient-request-code.use-case';
import type { IPatientRequestRepository } from '../../domain/repositories/patient-request.repository';
import type { IPatientRequestAccessCodeRepository } from '../../domain/repositories/patient-request-access-code.repository';
import type { IPatientRepository } from '../../../patients/domain/repositories/patient.repository';
import { PatientRequestSessionService } from '../services/patient-request-session.service';
import { PatientRequest } from '../../domain/entities/patient-request.entity';
import { PatientRequestAccessCode } from '../../domain/entities/patient-request-access-code.entity';
import { Patient } from '../../../patients/domain/entities/patient.entity';
import { PatientRequestNotPendingError } from '../../domain/errors/patient-request-not-pending.error';
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

const mockSessionService: jest.Mocked<Pick<PatientRequestSessionService, 'sign' | 'validate'>> = {
  sign: jest.fn().mockReturnValue('mocked-session-token'),
  validate: jest.fn(),
};

const makeActiveRequest = (failedAttempts = 0): PatientRequest =>
  PatientRequest.create({
    id: 'req-1',
    doctorId: 'doctor-1',
    patientId: 'patient-1',
    token: 'valid-token-abc123',
    title: 'Análisis de sangre',
    description: null,
    responseText: null,
    status: 'pending',
    failedAttempts,
    lastCodeRequestedAt: null,
    fulfilledAt: null,
    createdAt: new Date(),
  });

const makeValidCode = (
  overrides: Partial<{ code: string; failedAttempts: number; usedAt: Date | null }> = {},
): PatientRequestAccessCode =>
  PatientRequestAccessCode.create({
    id: 'code-1',
    requestId: 'req-1',
    code: overrides.code ?? '654321',
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    usedAt: overrides.usedAt ?? null,
    failedAttempts: overrides.failedAttempts ?? 0,
    createdAt: new Date(),
  });

const makePatient = (cedula: string | null): Patient =>
  Patient.create({
    id: 'patient-1',
    doctorId: 'doctor-1',
    fullName: 'María González',
    cedula,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

describe('VerifyPatientRequestCodeUseCase', () => {
  let useCase: VerifyPatientRequestCodeUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSessionService.sign.mockReturnValue('mocked-session-token');

    useCase = new VerifyPatientRequestCodeUseCase(
      mockRequestRepo,
      mockCodeRepo,
      mockPatientRepo,
      mockSessionService as unknown as PatientRequestSessionService,
    );

    mockRequestRepo.findByToken.mockResolvedValue(makeActiveRequest());
    mockRequestRepo.incrementLinkFailedAttempts.mockResolvedValue();
    mockCodeRepo.findLatestByRequestId.mockResolvedValue(makeValidCode());
    mockCodeRepo.markUsed.mockResolvedValue();
    mockCodeRepo.incrementFailedAttempts.mockResolvedValue();
    mockPatientRepo.findById.mockResolvedValue(makePatient('V-12.345.678'));
  });

  it('returns sessionToken and expiresAt on correct code and correct cédula', async () => {
    const result = await useCase.execute({
      token: 'valid-token-abc123',
      code: '654321',
      cedula: 'V-12.345.678',
    });

    expect(result.sessionToken).toBe('mocked-session-token');
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(mockCodeRepo.markUsed).toHaveBeenCalledWith('code-1', expect.any(Date));
  });

  it('delegates session signing to PatientRequestSessionService', async () => {
    await useCase.execute({ token: 'valid-token-abc123', code: '654321', cedula: 'V-12.345.678' });

    expect(mockSessionService.sign).toHaveBeenCalledWith(
      'req-1',
      'valid-token-abc123',
      expect.any(Date),
    );
  });

  // ORACLE-SAFE: not-found returns same 422 as wrong code (issue #1)
  it('throws InvalidAccessCodeError (not 404) when request does not exist', async () => {
    mockRequestRepo.findByToken.mockResolvedValue(null);

    await expect(
      useCase.execute({ token: 'unknown', code: '123456', cedula: 'V-12345678' }),
    ).rejects.toBeInstanceOf(InvalidAccessCodeError);
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

    await expect(
      useCase.execute({ token: 'valid-token-abc123', code: '654321', cedula: 'V-12.345.678' }),
    ).rejects.toBeInstanceOf(PatientRequestNotPendingError);
  });

  it('throws InvalidAccessCodeError when request is link-bruteforce-blocked', async () => {
    mockRequestRepo.findByToken.mockResolvedValue(makeActiveRequest(10));

    await expect(
      useCase.execute({ token: 'valid-token-abc123', code: '654321', cedula: 'V-12.345.678' }),
    ).rejects.toBeInstanceOf(InvalidAccessCodeError);

    expect(mockCodeRepo.findLatestByRequestId).not.toHaveBeenCalled();
    expect(mockPatientRepo.findById).not.toHaveBeenCalled();
  });

  it('throws InvalidAccessCodeError when no code exists', async () => {
    mockCodeRepo.findLatestByRequestId.mockResolvedValue(null);

    await expect(
      useCase.execute({ token: 'valid-token-abc123', code: '654321', cedula: 'V-12.345.678' }),
    ).rejects.toBeInstanceOf(InvalidAccessCodeError);
  });

  it('throws InvalidAccessCodeError when code is expired', async () => {
    mockCodeRepo.findLatestByRequestId.mockResolvedValue(
      PatientRequestAccessCode.create({
        id: 'code-1',
        requestId: 'req-1',
        code: '654321',
        expiresAt: new Date('2020-01-01'),
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
    mockCodeRepo.findLatestByRequestId.mockResolvedValue(makeValidCode({ usedAt: new Date() }));

    await expect(
      useCase.execute({ token: 'valid-token-abc123', code: '654321', cedula: 'V-12.345.678' }),
    ).rejects.toBeInstanceOf(InvalidAccessCodeError);
  });

  it('throws InvalidAccessCodeError when wrong code (correct cédula)', async () => {
    await expect(
      useCase.execute({ token: 'valid-token-abc123', code: '000000', cedula: 'V-12.345.678' }),
    ).rejects.toBeInstanceOf(InvalidAccessCodeError);

    expect(mockCodeRepo.incrementFailedAttempts).toHaveBeenCalledWith('code-1');
    expect(mockRequestRepo.incrementLinkFailedAttempts).toHaveBeenCalledWith('req-1');
    expect(mockCodeRepo.markUsed).not.toHaveBeenCalled();
  });

  it('throws InvalidAccessCodeError when wrong cédula (correct code)', async () => {
    await expect(
      useCase.execute({ token: 'valid-token-abc123', code: '654321', cedula: 'V-99999999' }),
    ).rejects.toBeInstanceOf(InvalidAccessCodeError);

    expect(mockCodeRepo.incrementFailedAttempts).toHaveBeenCalledWith('code-1');
    expect(mockRequestRepo.incrementLinkFailedAttempts).toHaveBeenCalledWith('req-1');
    expect(mockCodeRepo.markUsed).not.toHaveBeenCalled();
  });

  it('throws InvalidAccessCodeError when patient has no cédula', async () => {
    mockPatientRepo.findById.mockResolvedValue(makePatient(null));

    await expect(
      useCase.execute({ token: 'valid-token-abc123', code: '654321', cedula: 'V-12345678' }),
    ).rejects.toBeInstanceOf(InvalidAccessCodeError);

    expect(mockCodeRepo.incrementFailedAttempts).toHaveBeenCalledWith('code-1');
    expect(mockRequestRepo.incrementLinkFailedAttempts).toHaveBeenCalledWith('req-1');
  });

  it('throws InvalidAccessCodeError when patient is not found', async () => {
    mockPatientRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({ token: 'valid-token-abc123', code: '654321', cedula: 'V-12345678' }),
    ).rejects.toBeInstanceOf(InvalidAccessCodeError);
  });

  it('does not increment counters on correct code and correct cédula', async () => {
    await useCase.execute({ token: 'valid-token-abc123', code: '654321', cedula: 'V-12.345.678' });

    expect(mockRequestRepo.incrementLinkFailedAttempts).not.toHaveBeenCalled();
    expect(mockCodeRepo.incrementFailedAttempts).not.toHaveBeenCalled();
  });

  it('matches cédula with different formatting (normalization)', async () => {
    mockPatientRepo.findById.mockResolvedValue(makePatient('V-12.345.678'));

    const result = await useCase.execute({
      token: 'valid-token-abc123',
      code: '654321',
      cedula: 'v12345678',
    });

    expect(result.sessionToken).toBeTruthy();
    expect(mockCodeRepo.markUsed).toHaveBeenCalled();
  });
});

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
});

describe('cedulasMatch', () => {
  it('matches identical normalized cédulas', () => {
    expect(cedulasMatch('V-12.345.678', 'v12345678')).toBe(true);
  });

  it('matches when input omits the V/E/P prefix', () => {
    expect(cedulasMatch('V12345678', '12345678')).toBe(true);
  });

  it('does not match different numbers', () => {
    expect(cedulasMatch('V12345678', '99999999')).toBe(false);
  });

  it('does not match empty input', () => {
    expect(cedulasMatch('V12345678', '')).toBe(false);
  });
});
