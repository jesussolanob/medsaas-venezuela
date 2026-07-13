import { ConfigService } from '@nestjs/config';
import { ShareConsultationUseCase } from './share-consultation.use-case';
import type { ISharedDocumentLinkRepository } from '../../../domain/repositories/shared-document-link.repository';
import type { IDocumentAccessCodeRepository } from '../../../domain/repositories/document-access-code.repository';
import type { IConsultationRepository } from '../../../../consultations/domain/repositories/consultation.repository';
import type { IPatientRepository } from '../../../../patients/domain/repositories/patient.repository';
import type { MailerService } from '../../../../email/application/services/mailer.service';
import { SharedDocumentLink } from '../../../domain/entities/shared-document-link.entity';
import { DocumentAccessCode } from '../../../domain/entities/document-access-code.entity';
import { Consultation } from '../../../../consultations/domain/entities/consultation.entity';
import { NoSectionsSelectedError } from '../../../domain/errors/no-sections-selected.error';
import { ConsultationNotOwnedError } from '../../../domain/errors/consultation-not-owned.error';
import { PatientCedulaRequiredForSharingError } from '../../../domain/errors/patient-cedula-required.error';

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

const mockConsultationRepo = {
  findById: jest.fn(),
  findByCode: jest.fn(),
  countByDoctorAndMonth: jest.fn(),
  getMaxSequenceForMonth: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  updatePayment: jest.fn(),
  updatePaymentDetails: jest.fn(),
  approveWithExtras: jest.fn(),
  findExtraItems: jest.fn(),
  list: jest.fn(),
  findByPatient: jest.fn(),
  findByAppointmentId: jest.fn(),
  deleteById: jest.fn().mockResolvedValue(undefined),
  listWithAppointment: jest.fn(),
} as jest.Mocked<IConsultationRepository>;

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

const makeConsultation = (override: Partial<{ doctorId: string }> = {}): Consultation =>
  Consultation.create({
    id: 'consult-1',
    doctorId: override.doctorId ?? 'doctor-1',
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

const makeLink = (): SharedDocumentLink =>
  SharedDocumentLink.create({
    id: 'link-1',
    consultationId: 'consult-1',
    doctorId: 'doctor-1',
    patientId: 'patient-1',
    token: 'abc-token-long',
    sections: { report: true, prescriptions: false, ehr: false },
    docSelection: null,
    status: 'active',
    failedAttempts: 0,
    lastCodeRequestedAt: null,
    createdAt: new Date(),
  });

const makeCode = (): DocumentAccessCode =>
  DocumentAccessCode.create({
    id: 'code-1',
    linkId: 'link-1',
    code: '123456',
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    usedAt: null,
    failedAttempts: 0,
    createdAt: new Date(),
  });

// Minimal patient stub. Defaults to a patient WITH a cédula (required to share)
// and no email (notification skipped). Override fields per-test as needed.
const makePatient = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'patient-1',
    doctorId: 'doctor-1',
    fullName: 'Test Patient',
    cedula: 'V-12345678',
    email: null,
    ...overrides,
  }) as Parameters<typeof mockPatientRepo.findById>[0] extends never
    ? never
    : Awaited<ReturnType<typeof mockPatientRepo.findById>>;

describe('ShareConsultationUseCase', () => {
  let useCase: ShareConsultationUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    useCase = new ShareConsultationUseCase(
      mockLinkRepo,
      mockCodeRepo,
      mockConsultationRepo,
      mockPatientRepo,
      mockMailer as unknown as MailerService,
      mockConfig,
    );

    mockLinkRepo.save.mockResolvedValue(makeLink());
    mockCodeRepo.save.mockResolvedValue(makeCode());
    mockConsultationRepo.findById.mockResolvedValue(makeConsultation());
    // Patient has a cédula (required to share) but no email → notification skipped.
    mockPatientRepo.findById.mockResolvedValue(makePatient());
  });

  it('returns url, code, expiresAt on success', async () => {
    const result = await useCase.execute({
      consultationId: 'consult-1',
      doctorId: 'doctor-1',
      dto: { sections: { report: true, prescriptions: false, ehr: false } },
      doctorName: 'Dr. Test',
    });

    expect(result.url).toMatch(/^http:\/\/localhost:3000\/documents\//);
    expect(result.code).toMatch(/^\d{6}$/);
    expect(result.expiresAt).toBeInstanceOf(Date);
  });

  it('throws ConsultationNotOwnedError when consultation not found', async () => {
    mockConsultationRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({
        consultationId: 'consult-1',
        doctorId: 'doctor-1',
        dto: { sections: { report: true, prescriptions: false, ehr: false } },
        doctorName: 'Dr. Test',
      }),
    ).rejects.toBeInstanceOf(ConsultationNotOwnedError);
  });

  it('throws ConsultationNotOwnedError when doctor does not own the consultation', async () => {
    mockConsultationRepo.findById.mockResolvedValue(makeConsultation({ doctorId: 'other-doctor' }));

    await expect(
      useCase.execute({
        consultationId: 'consult-1',
        doctorId: 'doctor-1',
        dto: { sections: { report: true, prescriptions: false, ehr: false } },
        doctorName: 'Dr. Test',
      }),
    ).rejects.toBeInstanceOf(ConsultationNotOwnedError);
  });

  it('throws PatientCedulaRequiredForSharingError when patient has no cédula', async () => {
    mockPatientRepo.findById.mockResolvedValue(makePatient({ cedula: null }));

    await expect(
      useCase.execute({
        consultationId: 'consult-1',
        doctorId: 'doctor-1',
        dto: { sections: { report: true, prescriptions: false, ehr: false } },
        doctorName: 'Dr. Test',
      }),
    ).rejects.toBeInstanceOf(PatientCedulaRequiredForSharingError);

    // No link/code should be persisted when the precondition fails.
    expect(mockLinkRepo.save).not.toHaveBeenCalled();
    expect(mockCodeRepo.save).not.toHaveBeenCalled();
  });

  it('throws PatientCedulaRequiredForSharingError when patient record is missing', async () => {
    mockPatientRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({
        consultationId: 'consult-1',
        doctorId: 'doctor-1',
        dto: { sections: { report: true, prescriptions: false, ehr: false } },
        doctorName: 'Dr. Test',
      }),
    ).rejects.toBeInstanceOf(PatientCedulaRequiredForSharingError);
  });

  it('throws NoSectionsSelectedError when all sections are false', async () => {
    await expect(
      useCase.execute({
        consultationId: 'consult-1',
        doctorId: 'doctor-1',
        dto: { sections: { report: false, prescriptions: false, ehr: false } },
        doctorName: 'Dr. Test',
      }),
    ).rejects.toBeInstanceOf(NoSectionsSelectedError);
  });

  it('persists link and code', async () => {
    await useCase.execute({
      consultationId: 'consult-1',
      doctorId: 'doctor-1',
      dto: { sections: { report: true, prescriptions: true, ehr: true } },
      doctorName: 'Dr. Test',
    });

    expect(mockLinkRepo.save).toHaveBeenCalledTimes(1);
    expect(mockCodeRepo.save).toHaveBeenCalledTimes(1);
  });

  it('persists docSelection when provided in dto', async () => {
    await useCase.execute({
      consultationId: 'consult-1',
      doctorId: 'doctor-1',
      dto: {
        sections: { report: true, prescriptions: false, ehr: false },
        doc_selection: {
          types: ['recipe', 'informe'],
          informeBlockKeys: ['diagnosis', 'treatment'],
        },
      },
      doctorName: 'Dr. Test',
    });

    const savedLink = mockLinkRepo.save.mock.calls[0]?.[0] as SharedDocumentLink;
    expect(savedLink.docSelection).toEqual({
      types: ['recipe', 'informe'],
      informeBlockKeys: ['diagnosis', 'treatment'],
      restContent: null,
    });
  });

  it('persists docSelection as null when not provided', async () => {
    await useCase.execute({
      consultationId: 'consult-1',
      doctorId: 'doctor-1',
      dto: { sections: { report: true, prescriptions: false, ehr: false } },
      doctorName: 'Dr. Test',
    });

    const savedLink = mockLinkRepo.save.mock.calls[0]?.[0] as SharedDocumentLink;
    expect(savedLink.docSelection).toBeNull();
  });

  it('persists docSelection with restContent when rest type is shared', async () => {
    await useCase.execute({
      consultationId: 'consult-1',
      doctorId: 'doctor-1',
      dto: {
        sections: { report: false, prescriptions: false, ehr: true },
        doc_selection: {
          types: ['rest'],
          informeBlockKeys: [],
          restContent: 'Reposo médico por 5 días',
        },
      },
      doctorName: 'Dr. Test',
    });

    const savedLink = mockLinkRepo.save.mock.calls[0]?.[0] as SharedDocumentLink;
    expect(savedLink.docSelection).toEqual({
      types: ['rest'],
      informeBlockKeys: [],
      restContent: 'Reposo médico por 5 días',
    });
  });

  it('does NOT throw when email fails (fire-and-forget)', async () => {
    mockPatientRepo.findById.mockResolvedValue(makePatient({ email: 'test@test.com' }));
    mockMailer.sendTemplate.mockRejectedValue(new Error('SMTP error'));

    // Should not throw even if email fails
    await expect(
      useCase.execute({
        consultationId: 'consult-1',
        doctorId: 'doctor-1',
        dto: { sections: { report: true, prescriptions: false, ehr: false } },
        doctorName: 'Dr. Test',
      }),
    ).resolves.toBeDefined();
  });
});
