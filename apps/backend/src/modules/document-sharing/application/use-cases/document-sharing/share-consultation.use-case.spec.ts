import { ConfigService } from '@nestjs/config';
import { ShareConsultationUseCase } from './share-consultation.use-case';
import type { ISharedDocumentLinkRepository } from '../../../domain/repositories/shared-document-link.repository';
import type { IDocumentAccessCodeRepository } from '../../../domain/repositories/document-access-code.repository';
import type { IConsultationRepository } from '../../../../consultations/domain/repositories/consultation.repository';
import type { IPatientRepository } from '../../../../patients/domain/repositories/patient.repository';
import type { IDoctorProfileRepository } from '../../../../doctor-settings/domain/repositories/doctor-profile.repository';
import type { MailerService } from '../../../../email/application/services/mailer.service';
import type { IDoctorDocumentFileRepository } from '../../../../doctor-document-files/domain/repositories/doctor-document-file.repository';
import { SharedDocumentLink } from '../../../domain/entities/shared-document-link.entity';
import { DocumentAccessCode } from '../../../domain/entities/document-access-code.entity';
import { Consultation } from '../../../../consultations/domain/entities/consultation.entity';
import { NoShareContentError } from '../../../domain/errors/no-share-content.error';
import { TooManyAttachmentsError } from '../../../domain/errors/too-many-attachments.error';
import { AttachmentTotalSizeExceededError } from '../../../domain/errors/attachment-total-size-exceeded.error';
import { InvalidAttachmentMimeTypeError } from '../../../domain/errors/invalid-attachment-mime-type.error';
import { LibraryFileNotAvailableError } from '../../../domain/errors/library-file-not-available.error';
import { ConsultationNotOwnedError } from '../../../domain/errors/consultation-not-owned.error';
import { PatientCedulaRequiredForSharingError } from '../../../domain/errors/patient-cedula-required.error';
import { DoctorDocumentFileInvalidPathError } from '../../../../doctor-document-files/domain/errors/doctor-document-file-invalid-path.error';

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
  applyNoShowFee: jest.fn(),
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
  appendAllergyNote: jest.fn().mockResolvedValue(false),
} as jest.Mocked<IPatientRepository>;

const mockDoctorProfileRepo: jest.Mocked<Pick<IDoctorProfileRepository, 'findByDoctorId'>> = {
  findByDoctorId: jest.fn(),
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

const mockDocFileRepo: jest.Mocked<IDoctorDocumentFileRepository> = {
  findAllByDoctor: jest.fn(),
  findById: jest.fn(),
  findByIdsAndDoctor: jest.fn(),
  countActiveByDoctor: jest.fn(),
  save: jest.fn(),
  rename: jest.fn(),
  softDelete: jest.fn(),
};

const makeLink = (): SharedDocumentLink =>
  SharedDocumentLink.create({
    id: 'link-1',
    consultationId: 'consult-1',
    doctorId: 'doctor-1',
    patientId: 'patient-1',
    token: 'abc-token-long',
    sections: { report: true, prescriptions: false, ehr: false },
    docSelection: null,
    attachments: null,
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
      mockDoctorProfileRepo as unknown as IDoctorProfileRepository,
      mockMailer as unknown as MailerService,
      mockConfig,
      mockDocFileRepo,
    );

    mockLinkRepo.save.mockResolvedValue(makeLink());
    mockCodeRepo.save.mockResolvedValue(makeCode());
    mockConsultationRepo.findById.mockResolvedValue(makeConsultation());
    // Patient has a cédula (required to share) but no email → notification skipped.
    mockPatientRepo.findById.mockResolvedValue(makePatient());
    // Doctor profile: title + name for email display name.
    mockDoctorProfileRepo.findByDoctorId.mockResolvedValue({
      fullName: 'Ana Romero',
      professionalTitle: 'Dra.',
      email: 'ana.romero@clinic.com',
    } as Awaited<ReturnType<typeof mockDoctorProfileRepo.findByDoctorId>>);
  });

  it('returns url, code, expiresAt on success', async () => {
    const result = await useCase.execute({
      consultationId: 'consult-1',
      doctorId: 'doctor-1',
      dto: { sections: { report: true, prescriptions: false, ehr: false } },
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
      }),
    ).rejects.toBeInstanceOf(PatientCedulaRequiredForSharingError);
  });

  it('throws NoShareContentError when all sections are false and no attachments', async () => {
    await expect(
      useCase.execute({
        consultationId: 'consult-1',
        doctorId: 'doctor-1',
        dto: { sections: { report: false, prescriptions: false, ehr: false } },
      }),
    ).rejects.toBeInstanceOf(NoShareContentError);
  });

  it('persists link and code', async () => {
    await useCase.execute({
      consultationId: 'consult-1',
      doctorId: 'doctor-1',
      dto: { sections: { report: true, prescriptions: true, ehr: true } },
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
      }),
    ).resolves.toBeDefined();
  });

  it('sends email with doctor display name built from profile (professionalTitle + fullName)', async () => {
    mockPatientRepo.findById.mockResolvedValue(makePatient({ email: 'patient@test.com' }));
    mockMailer.sendTemplate.mockResolvedValue({ id: 'msg-1' });

    await useCase.execute({
      consultationId: 'consult-1',
      doctorId: 'doctor-1',
      dto: { sections: { report: true, prescriptions: false, ehr: false } },
    });

    // Allow fire-and-forget to settle
    await new Promise((r) => setImmediate(r));

    expect(mockMailer.sendTemplate).toHaveBeenCalledWith(
      'shared_documents_code',
      'patient@test.com',
      expect.objectContaining({ doctorName: 'Dra. Ana Romero' }),
      expect.anything(),
    );
  });

  it('falls back to profile email when doctor fullName is absent', async () => {
    mockDoctorProfileRepo.findByDoctorId.mockResolvedValue({
      fullName: '',
      professionalTitle: null,
      email: 'fallback@clinic.com',
    } as Awaited<ReturnType<typeof mockDoctorProfileRepo.findByDoctorId>>);
    mockPatientRepo.findById.mockResolvedValue(makePatient({ email: 'patient@test.com' }));
    mockMailer.sendTemplate.mockResolvedValue({ id: 'msg-1' });

    await useCase.execute({
      consultationId: 'consult-1',
      doctorId: 'doctor-1',
      dto: { sections: { report: true, prescriptions: false, ehr: false } },
    });

    await new Promise((r) => setImmediate(r));

    expect(mockMailer.sendTemplate).toHaveBeenCalledWith(
      'shared_documents_code',
      'patient@test.com',
      expect.objectContaining({ doctorName: 'fallback@clinic.com' }),
      expect.anything(),
    );
  });

  it('falls back to "Su especialista" when profile is null', async () => {
    mockDoctorProfileRepo.findByDoctorId.mockResolvedValue(null);
    mockPatientRepo.findById.mockResolvedValue(makePatient({ email: 'patient@test.com' }));
    mockMailer.sendTemplate.mockResolvedValue({ id: 'msg-1' });

    await useCase.execute({
      consultationId: 'consult-1',
      doctorId: 'doctor-1',
      dto: { sections: { report: true, prescriptions: false, ehr: false } },
    });

    await new Promise((r) => setImmediate(r));

    expect(mockMailer.sendTemplate).toHaveBeenCalledWith(
      'shared_documents_code',
      'patient@test.com',
      expect.objectContaining({ doctorName: 'Su especialista' }),
      expect.anything(),
    );
  });

  // ---------------------------------------------------------------------------
  // Attachment resolution tests
  // ---------------------------------------------------------------------------

  it('succeeds with only attachments (no doc types) when doc_selection types empty', async () => {
    mockDocFileRepo.findByIdsAndDoctor.mockResolvedValue([
      {
        id: 'file-1',
        doctorId: 'doctor-1',
        name: 'Análisis.pdf',
        storagePath: 'document/doctor-1/analisis.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 100_000,
        createdAt: new Date(),
        isOwnedBy: (id: string) => id === 'doctor-1',
        isDeleted: () => false,
      } as unknown as Parameters<typeof mockDocFileRepo.findByIdsAndDoctor>[0] extends never
        ? never
        : Awaited<ReturnType<typeof mockDocFileRepo.findByIdsAndDoctor>>[0],
    ]);

    const result = await useCase.execute({
      consultationId: 'consult-1',
      doctorId: 'doctor-1',
      dto: {
        sections: { report: false, prescriptions: false, ehr: false },
        attachments: { libraryFileIds: ['file-1'], uploads: [] },
      },
    });

    expect(result.url).toMatch(/^http:\/\/localhost:3000\/documents\//);
    // The saved link should contain the attachment snapshot
    const savedLink = mockLinkRepo.save.mock.calls[0]?.[0] as SharedDocumentLink;
    expect(savedLink.attachments).toHaveLength(1);
    expect(savedLink.attachments?.[0]).toMatchObject({
      name: 'Análisis.pdf',
      storagePath: 'document/doctor-1/analisis.pdf',
      mimeType: 'application/pdf',
      source: 'library',
      libraryFileId: 'file-1',
    });
  });

  it('throws NoShareContentError when no sections AND no attachments', async () => {
    await expect(
      useCase.execute({
        consultationId: 'consult-1',
        doctorId: 'doctor-1',
        dto: {
          sections: { report: false, prescriptions: false, ehr: false },
          doc_selection: { types: [], informeBlockKeys: [] },
        },
      }),
    ).rejects.toBeInstanceOf(NoShareContentError);

    expect(mockLinkRepo.save).not.toHaveBeenCalled();
  });

  it('resolves upload attachment without calling docFileRepo', async () => {
    await useCase.execute({
      consultationId: 'consult-1',
      doctorId: 'doctor-1',
      dto: {
        sections: { report: false, prescriptions: false, ehr: false },
        attachments: {
          libraryFileIds: [],
          uploads: [
            {
              name: 'Examen.pdf',
              filePath: 'document/doctor-1/exam.pdf',
              mimeType: 'application/pdf',
              sizeBytes: 50_000,
            },
          ],
        },
      },
    });

    // docFileRepo should NOT be called for upload-only attachments
    expect(mockDocFileRepo.findByIdsAndDoctor).not.toHaveBeenCalled();

    const savedLink = mockLinkRepo.save.mock.calls[0]?.[0] as SharedDocumentLink;
    expect(savedLink.attachments).toHaveLength(1);
    expect(savedLink.attachments?.[0]).toMatchObject({
      name: 'Examen.pdf',
      storagePath: 'document/doctor-1/exam.pdf',
      source: 'upload',
    });
  });

  it('throws DoctorDocumentFileInvalidPathError for upload with invalid path', async () => {
    await expect(
      useCase.execute({
        consultationId: 'consult-1',
        doctorId: 'doctor-1',
        dto: {
          sections: { report: false, prescriptions: false, ehr: false },
          attachments: {
            libraryFileIds: [],
            uploads: [
              {
                name: 'Malicious.pdf',
                // path belongs to another doctor
                filePath: 'document/other-doctor/secret.pdf',
                mimeType: 'application/pdf',
                sizeBytes: 50_000,
              },
            ],
          },
        },
      }),
    ).rejects.toBeInstanceOf(DoctorDocumentFileInvalidPathError);
  });

  it('throws DoctorDocumentFileInvalidPathError for path traversal attempt', async () => {
    await expect(
      useCase.execute({
        consultationId: 'consult-1',
        doctorId: 'doctor-1',
        dto: {
          sections: { report: false, prescriptions: false, ehr: false },
          attachments: {
            libraryFileIds: [],
            uploads: [
              {
                name: 'Traversal.pdf',
                filePath: 'document/doctor-1/../../../etc/passwd',
                mimeType: 'application/pdf',
                sizeBytes: 50_000,
              },
            ],
          },
        },
      }),
    ).rejects.toBeInstanceOf(DoctorDocumentFileInvalidPathError);
  });

  it('throws LibraryFileNotAvailableError when library file IDs are not found (anti-IDOR)', async () => {
    // Repo returns fewer files than requested — some were deleted or belong to another doctor
    mockDocFileRepo.findByIdsAndDoctor.mockResolvedValue([]);

    await expect(
      useCase.execute({
        consultationId: 'consult-1',
        doctorId: 'doctor-1',
        dto: {
          sections: { report: false, prescriptions: false, ehr: false },
          attachments: { libraryFileIds: ['file-1', 'file-2'], uploads: [] },
        },
      }),
    ).rejects.toBeInstanceOf(LibraryFileNotAvailableError);
  });

  it('throws InvalidAttachmentMimeTypeError for disallowed MIME in upload', async () => {
    await expect(
      useCase.execute({
        consultationId: 'consult-1',
        doctorId: 'doctor-1',
        dto: {
          sections: { report: false, prescriptions: false, ehr: false },
          attachments: {
            libraryFileIds: [],
            uploads: [
              {
                name: 'Video.mp4',
                filePath: 'document/doctor-1/video.mp4',
                mimeType: 'video/mp4',
                sizeBytes: 50_000,
              },
            ],
          },
        },
      }),
    ).rejects.toBeInstanceOf(InvalidAttachmentMimeTypeError);
  });

  it('throws TooManyAttachmentsError when more than 10 attachments provided', async () => {
    // 11 upload attachments (above the limit of 10)
    const uploads = Array.from({ length: 11 }, (_, i) => ({
      name: `File${i}.pdf`,
      filePath: `document/doctor-1/file${i}.pdf`,
      mimeType: 'application/pdf' as const,
      sizeBytes: 100,
    }));

    await expect(
      useCase.execute({
        consultationId: 'consult-1',
        doctorId: 'doctor-1',
        dto: {
          sections: { report: false, prescriptions: false, ehr: false },
          attachments: { libraryFileIds: [], uploads },
        },
      }),
    ).rejects.toBeInstanceOf(TooManyAttachmentsError);
  });

  it('throws AttachmentTotalSizeExceededError when total declared size exceeds 25 MB', async () => {
    // 5 files × 6 MB each = 30 MB > 25 MB limit
    const uploads = Array.from({ length: 5 }, (_, i) => ({
      name: `BigFile${i}.pdf`,
      filePath: `document/doctor-1/big${i}.pdf`,
      mimeType: 'application/pdf' as const,
      sizeBytes: 6 * 1024 * 1024, // 6 MB each
    }));

    await expect(
      useCase.execute({
        consultationId: 'consult-1',
        doctorId: 'doctor-1',
        dto: {
          sections: { report: false, prescriptions: false, ehr: false },
          attachments: { libraryFileIds: [], uploads },
        },
      }),
    ).rejects.toBeInstanceOf(AttachmentTotalSizeExceededError);
  });

  it('throws DoctorDocumentFileInvalidPathError for path containing %', async () => {
    await expect(
      useCase.execute({
        consultationId: 'consult-1',
        doctorId: 'doctor-1',
        dto: {
          sections: { report: false, prescriptions: false, ehr: false },
          attachments: {
            libraryFileIds: [],
            uploads: [
              {
                name: 'Encoded.pdf',
                filePath: 'document/doctor-1/%2e%2e/secret.pdf',
                mimeType: 'application/pdf',
                sizeBytes: 1000,
              },
            ],
          },
        },
      }),
    ).rejects.toBeInstanceOf(DoctorDocumentFileInvalidPathError);
  });

  it('persists null attachments when no attachments provided', async () => {
    await useCase.execute({
      consultationId: 'consult-1',
      doctorId: 'doctor-1',
      dto: { sections: { report: true, prescriptions: false, ehr: false } },
    });

    const savedLink = mockLinkRepo.save.mock.calls[0]?.[0] as SharedDocumentLink;
    expect(savedLink.attachments).toBeNull();
  });
});
