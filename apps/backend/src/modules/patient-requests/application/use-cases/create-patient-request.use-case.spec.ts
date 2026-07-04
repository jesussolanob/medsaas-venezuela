import { ConfigService } from '@nestjs/config';
import { CreatePatientRequestUseCase } from './create-patient-request.use-case';
import type { IPatientRequestRepository } from '../../domain/repositories/patient-request.repository';
import type { IPatientRequestAccessCodeRepository } from '../../domain/repositories/patient-request-access-code.repository';
import type { IPatientRepository } from '../../../patients/domain/repositories/patient.repository';
import type { MailerService } from '../../../email/application/services/mailer.service';
import { PatientRequest } from '../../domain/entities/patient-request.entity';
import { PatientRequestAccessCode } from '../../domain/entities/patient-request-access-code.entity';
import { PatientRequestNotFoundError } from '../../domain/errors/patient-request-not-found.error';
import { PatientHasNoEmailError } from '../../domain/errors/patient-has-no-email.error';
import { PatientCedulaRequiredError } from '../../domain/errors/patient-cedula-required.error';

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

const makePatient = (overrides: Partial<{ email: string | null; cedula: string | null }> = {}) =>
  ({
    id: 'patient-1',
    doctorId: 'doctor-1',
    fullName: 'María González',
    email: overrides.email !== undefined ? overrides.email : 'maria@example.com',
    cedula: overrides.cedula !== undefined ? overrides.cedula : 'V-12345678',
    phone: null,
  }) as Awaited<ReturnType<typeof mockPatientRepo.findById>>;

const makeSavedRequest = (): PatientRequest =>
  PatientRequest.create({
    id: 'req-uuid-1',
    doctorId: 'doctor-1',
    patientId: 'patient-1',
    token: 'saved-token-abc',
    title: 'Análisis de sangre',
    description: null,
    responseText: null,
    status: 'pending',
    failedAttempts: 0,
    lastCodeRequestedAt: null,
    fulfilledAt: null,
    createdAt: new Date(),
  });

const makeSavedCode = (): PatientRequestAccessCode =>
  PatientRequestAccessCode.create({
    id: 'code-uuid-1',
    requestId: 'req-uuid-1',
    code: '123456',
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    usedAt: null,
    failedAttempts: 0,
    createdAt: new Date(),
  });

describe('CreatePatientRequestUseCase', () => {
  let useCase: CreatePatientRequestUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    useCase = new CreatePatientRequestUseCase(
      mockRequestRepo,
      mockCodeRepo,
      mockPatientRepo,
      mockMailer as unknown as MailerService,
      mockConfig,
    );

    mockPatientRepo.findById.mockResolvedValue(makePatient());
    mockRequestRepo.save.mockResolvedValue(makeSavedRequest());
    mockCodeRepo.save.mockResolvedValue(makeSavedCode());
  });

  it('returns id, token, url, code, expiresAt on success', async () => {
    const result = await useCase.execute({
      doctorId: 'doctor-1',
      dto: { patientId: 'patient-1', title: 'Análisis de sangre', description: null },
    });

    expect(result.id).toBe('req-uuid-1');
    expect(result.url).toMatch(/^http:\/\/localhost:3000\/patient-requests\//);
    expect(result.code).toMatch(/^\d{6}$/);
    expect(result.expiresAt).toBeInstanceOf(Date);
  });

  it('throws PatientRequestNotFoundError when patient not found (anti-IDOR)', async () => {
    mockPatientRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({
        doctorId: 'doctor-1',
        dto: { patientId: 'patient-1', title: 'Análisis', description: null },
      }),
    ).rejects.toBeInstanceOf(PatientRequestNotFoundError);

    expect(mockRequestRepo.save).not.toHaveBeenCalled();
    expect(mockCodeRepo.save).not.toHaveBeenCalled();
  });

  it('throws PatientHasNoEmailError when patient has no email', async () => {
    mockPatientRepo.findById.mockResolvedValue(makePatient({ email: null }));

    await expect(
      useCase.execute({
        doctorId: 'doctor-1',
        dto: { patientId: 'patient-1', title: 'Análisis', description: null },
      }),
    ).rejects.toBeInstanceOf(PatientHasNoEmailError);

    expect(mockRequestRepo.save).not.toHaveBeenCalled();
  });

  it('throws PatientHasNoEmailError when patient email is empty string', async () => {
    mockPatientRepo.findById.mockResolvedValue(makePatient({ email: '  ' }));

    await expect(
      useCase.execute({
        doctorId: 'doctor-1',
        dto: { patientId: 'patient-1', title: 'Análisis', description: null },
      }),
    ).rejects.toBeInstanceOf(PatientHasNoEmailError);
  });

  it('throws PatientCedulaRequiredError when patient has no cédula', async () => {
    mockPatientRepo.findById.mockResolvedValue(makePatient({ cedula: null }));

    await expect(
      useCase.execute({
        doctorId: 'doctor-1',
        dto: { patientId: 'patient-1', title: 'Análisis', description: null },
      }),
    ).rejects.toBeInstanceOf(PatientCedulaRequiredError);

    expect(mockRequestRepo.save).not.toHaveBeenCalled();
  });

  it('persists request and code', async () => {
    await useCase.execute({
      doctorId: 'doctor-1',
      dto: { patientId: 'patient-1', title: 'Análisis', description: null },
    });

    expect(mockRequestRepo.save).toHaveBeenCalledTimes(1);
    expect(mockCodeRepo.save).toHaveBeenCalledTimes(1);
  });

  it('does NOT throw when email fails (fire-and-forget)', async () => {
    mockMailer.sendTemplate.mockRejectedValue(new Error('SMTP error'));

    await expect(
      useCase.execute({
        doctorId: 'doctor-1',
        dto: { patientId: 'patient-1', title: 'Análisis', description: null },
      }),
    ).resolves.toBeDefined();
  });

  it('scopes patient lookup to the authenticated doctorId', async () => {
    await useCase.execute({
      doctorId: 'doctor-1',
      dto: { patientId: 'patient-1', title: 'Análisis', description: null },
    });

    expect(mockPatientRepo.findById).toHaveBeenCalledWith('patient-1', 'doctor-1');
  });
});
