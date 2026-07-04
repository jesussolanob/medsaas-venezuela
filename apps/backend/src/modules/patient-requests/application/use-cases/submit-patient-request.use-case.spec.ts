import { SubmitPatientRequestUseCase } from './submit-patient-request.use-case';
import type { IPatientRequestRepository } from '../../domain/repositories/patient-request.repository';
import { PatientRequestSessionService } from '../services/patient-request-session.service';
import { PatientRequest } from '../../domain/entities/patient-request.entity';
import { PatientRequestNotFoundError } from '../../domain/errors/patient-request-not-found.error';
import { PatientRequestNotPendingError } from '../../domain/errors/patient-request-not-pending.error';
import { InvalidSessionTokenError } from '../../domain/errors/invalid-session-token.error';

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

const makePendingRequest = (): PatientRequest =>
  PatientRequest.create({
    id: 'req-1',
    doctorId: 'doctor-1',
    patientId: 'patient-1',
    token: 'req-token-xyz',
    title: 'Análisis',
    description: null,
    responseText: null,
    status: 'pending',
    failedAttempts: 0,
    lastCodeRequestedAt: null,
    fulfilledAt: null,
    createdAt: new Date(),
  });

describe('SubmitPatientRequestUseCase', () => {
  let useCase: SubmitPatientRequestUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: session service validates without throwing
    mockSessionService.validate.mockImplementation(() => undefined);

    useCase = new SubmitPatientRequestUseCase(
      mockRequestRepo,
      mockSessionService as unknown as PatientRequestSessionService,
    );

    mockRequestRepo.findByToken.mockResolvedValue(makePendingRequest());
    mockRequestRepo.markFulfilled.mockResolvedValue();
  });

  it('marks request as fulfilled and returns requestId', async () => {
    const result = await useCase.execute({
      token: 'req-token-xyz',
      sessionToken: 'any-session-token',
      responseText: 'Aquí están mis documentos',
    });

    expect(result.requestId).toBe('req-1');
    expect(mockRequestRepo.markFulfilled).toHaveBeenCalledWith(
      'req-1',
      expect.any(Date),
      'Aquí están mis documentos',
    );
  });

  it('delegates session validation to PatientRequestSessionService', async () => {
    await useCase.execute({
      token: 'req-token-xyz',
      sessionToken: 'any-session-token',
      responseText: null,
    });

    expect(mockSessionService.validate).toHaveBeenCalledWith(
      'any-session-token',
      'req-1',
      'req-token-xyz',
    );
  });

  it('throws InvalidSessionTokenError when sessionToken is empty', async () => {
    await expect(
      useCase.execute({ token: 'req-token-xyz', sessionToken: '', responseText: null }),
    ).rejects.toBeInstanceOf(InvalidSessionTokenError);
  });

  it('throws PatientRequestNotFoundError when request does not exist', async () => {
    mockRequestRepo.findByToken.mockResolvedValue(null);

    await expect(
      useCase.execute({ token: 'unknown', sessionToken: 'any-session-token', responseText: null }),
    ).rejects.toBeInstanceOf(PatientRequestNotFoundError);
  });

  it('throws PatientRequestNotPendingError when request is already fulfilled', async () => {
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
        token: 'req-token-xyz',
        sessionToken: 'any-session-token',
        responseText: null,
      }),
    ).rejects.toBeInstanceOf(PatientRequestNotPendingError);
  });

  it('throws InvalidSessionTokenError when session service rejects the token', async () => {
    mockSessionService.validate.mockImplementation(() => {
      throw new InvalidSessionTokenError();
    });

    await expect(
      useCase.execute({
        token: 'req-token-xyz',
        sessionToken: 'tampered-token',
        responseText: null,
      }),
    ).rejects.toBeInstanceOf(InvalidSessionTokenError);
  });

  it('marks fulfilled with null responseText when not provided', async () => {
    await useCase.execute({
      token: 'req-token-xyz',
      sessionToken: 'any-session-token',
      responseText: null,
    });

    expect(mockRequestRepo.markFulfilled).toHaveBeenCalledWith('req-1', expect.any(Date), null);
  });
});
