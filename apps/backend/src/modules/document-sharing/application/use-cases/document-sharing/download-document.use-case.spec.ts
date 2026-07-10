import { ConfigService } from '@nestjs/config';
import { DownloadDocumentUseCase } from './download-document.use-case';
import { VerifyCodeUseCase } from './verify-code.use-case';
import { SessionTokenValidatorService } from '../../../application/services/session-token-validator.service';
import type { ISharedDocumentLinkRepository } from '../../../domain/repositories/shared-document-link.repository';
import type { IConsultationRepository } from '../../../../consultations/domain/repositories/consultation.repository';
import type { IPrescriptionRepository } from '../../../../prescriptions/domain/repositories/prescription.repository';
import type { IEhrRepository } from '../../../../ehr/domain/repositories/ehr.repository';
import type { IPatientRepository } from '../../../../patients/domain/repositories/patient.repository';
import type { IDoctorProfileRepository } from '../../../../doctor-settings/domain/repositories/doctor-profile.repository';
import type { PdfGeneratorService } from '../../../infrastructure/pdf/pdf-generator.service';
import { SharedDocumentLink } from '../../../domain/entities/shared-document-link.entity';
import { Consultation } from '../../../../consultations/domain/entities/consultation.entity';
import { DocumentLinkNotFoundError } from '../../../domain/errors/document-link-not-found.error';
import { DocumentLinkNotActiveError } from '../../../domain/errors/document-link-not-active.error';
import { InvalidSessionTokenError } from '../../../domain/errors/invalid-session-token.error';
import { MissingHmacSecretError } from '../../../domain/errors/missing-hmac-secret.error';

const TEST_SECRET = 'test-secret-for-download-spec';

const mockConfig = {
  get: jest.fn((key: string) => {
    if (key === 'AUTH_RESOLVE_SECRET') return TEST_SECRET;
    return undefined;
  }),
} as unknown as ConfigService;

const mockConfigNoSecret = {
  get: jest.fn(() => undefined),
} as unknown as ConfigService;

/** Build a real SessionTokenValidatorService backed by the given ConfigService. */
const makeValidator = (config: ConfigService) => new SessionTokenValidatorService(config);

const mockLinkRepo: jest.Mocked<ISharedDocumentLinkRepository> = {
  save: jest.fn(),
  findByToken: jest.fn(),
  findById: jest.fn(),
  incrementLinkFailedAttempts: jest.fn(),
  updateLastCodeRequestedAt: jest.fn(),
};

const mockConsultationRepo = {
  findById: jest.fn(),
  findByCode: jest.fn(),
  countByDoctorAndMonth: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  updatePayment: jest.fn(),
  list: jest.fn(),
  findByPatient: jest.fn(),
  findByAppointmentId: jest.fn(),
  deleteById: jest.fn().mockResolvedValue(undefined),
} as jest.Mocked<IConsultationRepository>;

const mockPrescriptionRepo = {
  findById: jest.fn(),
  findByPatient: jest.fn(),
  findByConsultation: jest.fn(),
  save: jest.fn(),
} as jest.Mocked<IPrescriptionRepository>;

const mockEhrRepo = {
  findById: jest.fn(),
  findByPatient: jest.fn(),
  findByConsultation: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
} as jest.Mocked<IEhrRepository>;

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

const mockDoctorProfileRepo = {
  findByDoctorId: jest.fn(),
  update: jest.fn(),
  updateExchangeRate: jest.fn(),
} as jest.Mocked<IDoctorProfileRepository>;

const mockPdfGenerator = {
  generate: jest.fn(),
} as jest.Mocked<Pick<PdfGeneratorService, 'generate'>>;

const makeActiveLink = (): SharedDocumentLink =>
  SharedDocumentLink.create({
    id: 'link-1',
    consultationId: 'consult-1',
    doctorId: 'doctor-1',
    patientId: 'patient-1',
    token: 'the-link-token',
    sections: { report: true, prescriptions: false, ehr: false },
    docSelection: null,
    status: 'active',
    failedAttempts: 0,
    lastCodeRequestedAt: null,
    createdAt: new Date(),
  });

const makeConsultation = (): Consultation =>
  Consultation.create({
    id: 'consult-1',
    doctorId: 'doctor-1',
    patientId: 'patient-1',
    appointmentId: null,
    consultationCode: 'DLT-202606-001',
    consultationDate: new Date('2026-06-18'),
    chiefComplaint: null,
    diagnosis: null,
    treatment: null,
    notes: null,
    paymentStatus: 'pending',
    paymentMethod: null,
    amount: null,
    paymentDate: null,
    blocksSnapshot: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

// Helper: produce a valid session token using the same logic as VerifyCodeUseCase
const signToken = (linkId: string, token: string, exp: Date): string => {
  const verifyUseCase = new VerifyCodeUseCase(
    {
      findByToken: jest.fn(),
      save: jest.fn(),
      findById: jest.fn(),
      incrementLinkFailedAttempts: jest.fn(),
      updateLastCodeRequestedAt: jest.fn(),
    } as jest.Mocked<ISharedDocumentLinkRepository>,
    {
      save: jest.fn(),
      findLatestByLinkId: jest.fn(),
      incrementFailedAttempts: jest.fn(),
      markUsed: jest.fn(),
    } as jest.Mocked<
      import('../../../domain/repositories/document-access-code.repository').IDocumentAccessCodeRepository
    >,
    {
      findById: jest.fn(),
      findByCedulaHash: jest.fn(),
      findByEmailHash: jest.fn(),
      list: jest.fn(),
      findAllByDoctor: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      logReveal: jest.fn(),
    } as jest.Mocked<IPatientRepository>,
    mockConfig,
  );
  return verifyUseCase.signSessionToken(linkId, token, exp);
};

describe('DownloadDocumentUseCase', () => {
  let useCase: DownloadDocumentUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    useCase = new DownloadDocumentUseCase(
      mockLinkRepo,
      mockConsultationRepo,
      mockPrescriptionRepo,
      mockEhrRepo,
      mockPatientRepo,
      mockDoctorProfileRepo,
      mockPdfGenerator as unknown as PdfGeneratorService,
      makeValidator(mockConfig),
    );

    mockLinkRepo.findByToken.mockResolvedValue(makeActiveLink());
    mockConsultationRepo.findById.mockResolvedValue(makeConsultation());
    mockPrescriptionRepo.findByConsultation.mockResolvedValue([]);
    mockEhrRepo.findByConsultation.mockResolvedValue(null);
    mockPatientRepo.findById.mockResolvedValue(null);
    mockPatientRepo.logReveal.mockResolvedValue();
    mockDoctorProfileRepo.findByDoctorId.mockResolvedValue(null);
    mockPdfGenerator.generate.mockResolvedValue(new Uint8Array([1, 2, 3]));
  });

  it('returns pdfBytes and filename on valid session token', async () => {
    const exp = new Date(Date.now() + 10 * 60 * 1000);
    const sessionToken = signToken('link-1', 'the-link-token', exp);

    const result = await useCase.execute({ token: 'the-link-token', sessionToken });

    expect(result.pdfBytes).toBeInstanceOf(Uint8Array);
    expect(result.filename).toMatch(/\.pdf$/);
  });

  it('logs audit entry on successful download', async () => {
    const exp = new Date(Date.now() + 10 * 60 * 1000);
    const sessionToken = signToken('link-1', 'the-link-token', exp);

    await useCase.execute({ token: 'the-link-token', sessionToken });

    // logReveal is fire-and-forget; give microtasks time to flush
    await Promise.resolve();
    expect(mockPatientRepo.logReveal).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'doctor-1',
        actorRole: 'doctor',
        patientId: 'patient-1',
        fieldRevealed: expect.stringContaining('shared_document_download'),
      }),
    );
  });

  it('uses doctor profile name when available', async () => {
    mockDoctorProfileRepo.findByDoctorId.mockResolvedValue({
      id: 'doctor-1',
      fullName: 'Dr. Juan Pérez',
    } as Awaited<ReturnType<typeof mockDoctorProfileRepo.findByDoctorId>>);

    const exp = new Date(Date.now() + 10 * 60 * 1000);
    const sessionToken = signToken('link-1', 'the-link-token', exp);

    await useCase.execute({ token: 'the-link-token', sessionToken });

    const pdfCall = mockPdfGenerator.generate.mock.calls[0]?.[0];
    expect(pdfCall?.doctorName).toBe('Dr. Juan Pérez');
  });

  it('falls back to Dr./Dra. when doctor profile is not found', async () => {
    mockDoctorProfileRepo.findByDoctorId.mockResolvedValue(null);

    const exp = new Date(Date.now() + 10 * 60 * 1000);
    const sessionToken = signToken('link-1', 'the-link-token', exp);

    await useCase.execute({ token: 'the-link-token', sessionToken });

    const pdfCall = mockPdfGenerator.generate.mock.calls[0]?.[0];
    expect(pdfCall?.doctorName).toBe('Dr./Dra.');
  });

  it('throws InvalidSessionTokenError for empty sessionToken', async () => {
    await expect(
      useCase.execute({ token: 'the-link-token', sessionToken: '' }),
    ).rejects.toBeInstanceOf(InvalidSessionTokenError);
  });

  it('throws InvalidSessionTokenError for whitespace-only sessionToken', async () => {
    await expect(
      useCase.execute({ token: 'the-link-token', sessionToken: '   ' }),
    ).rejects.toBeInstanceOf(InvalidSessionTokenError);
  });

  it('throws DocumentLinkNotFoundError when link does not exist', async () => {
    mockLinkRepo.findByToken.mockResolvedValue(null);
    const sessionToken = signToken('link-1', 'the-link-token', new Date(Date.now() + 60000));

    await expect(useCase.execute({ token: 'unknown', sessionToken })).rejects.toBeInstanceOf(
      DocumentLinkNotFoundError,
    );
  });

  it('throws DocumentLinkNotActiveError when link is revoked', async () => {
    mockLinkRepo.findByToken.mockResolvedValue(
      SharedDocumentLink.create({
        id: 'link-r',
        consultationId: 'consult-1',
        doctorId: 'doctor-1',
        patientId: 'patient-1',
        token: 'the-link-token',
        sections: { report: true, prescriptions: false, ehr: false },
        docSelection: null,
        status: 'revoked',
        failedAttempts: 0,
        lastCodeRequestedAt: null,
        createdAt: new Date(),
      }),
    );
    const sessionToken = signToken('link-1', 'the-link-token', new Date(Date.now() + 60000));

    await expect(useCase.execute({ token: 'the-link-token', sessionToken })).rejects.toBeInstanceOf(
      DocumentLinkNotActiveError,
    );
  });

  it('throws InvalidSessionTokenError for a tampered session token', async () => {
    const exp = new Date(Date.now() + 10 * 60 * 1000);
    const valid = signToken('link-1', 'the-link-token', exp);
    const tampered = valid.slice(0, -4) + 'XXXX';

    await expect(
      useCase.execute({ token: 'the-link-token', sessionToken: tampered }),
    ).rejects.toBeInstanceOf(InvalidSessionTokenError);
  });

  it('throws InvalidSessionTokenError for an expired session token', async () => {
    const exp = new Date(Date.now() - 1000); // already expired
    const sessionToken = signToken('link-1', 'the-link-token', exp);

    await expect(useCase.execute({ token: 'the-link-token', sessionToken })).rejects.toBeInstanceOf(
      InvalidSessionTokenError,
    );
  });

  it('throws InvalidSessionTokenError when token does not match link', async () => {
    const exp = new Date(Date.now() + 60000);
    // Sign for a different link/token combo
    const sessionToken = signToken('other-link', 'other-token', exp);

    await expect(useCase.execute({ token: 'the-link-token', sessionToken })).rejects.toBeInstanceOf(
      InvalidSessionTokenError,
    );
  });

  it('throws MissingHmacSecretError when AUTH_RESOLVE_SECRET is absent', async () => {
    const useCaseNoSecret = new DownloadDocumentUseCase(
      mockLinkRepo,
      mockConsultationRepo,
      mockPrescriptionRepo,
      mockEhrRepo,
      mockPatientRepo,
      mockDoctorProfileRepo,
      mockPdfGenerator as unknown as PdfGeneratorService,
      makeValidator(mockConfigNoSecret),
    );

    const exp = new Date(Date.now() + 10 * 60 * 1000);
    // Use the real secret to sign a valid token
    const sessionToken = signToken('link-1', 'the-link-token', exp);

    await expect(
      useCaseNoSecret.execute({ token: 'the-link-token', sessionToken }),
    ).rejects.toBeInstanceOf(MissingHmacSecretError);
  });
});
