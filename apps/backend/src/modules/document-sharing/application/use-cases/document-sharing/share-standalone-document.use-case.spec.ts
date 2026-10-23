import { ConfigService } from '@nestjs/config';
import { ShareStandaloneDocumentUseCase } from './share-standalone-document.use-case';
import type { ISharedDocumentLinkRepository } from '../../../domain/repositories/shared-document-link.repository';
import type { IDocumentAccessCodeRepository } from '../../../domain/repositories/document-access-code.repository';
import type { IStandaloneDocumentRepository } from '../../../../standalone-documents/domain/repositories/istandalone-document.repository';
import type { IPatientRepository } from '../../../../patients/domain/repositories/patient.repository';
import type { MailerService } from '../../../../email/application/services/mailer.service';
import { SharedDocumentLink } from '../../../domain/entities/shared-document-link.entity';
import { DocumentAccessCode } from '../../../domain/entities/document-access-code.entity';
import { StandaloneDocument } from '../../../../standalone-documents/domain/entities/standalone-document.entity';
import { DocumentLinkNotFoundError } from '../../../domain/errors/document-link-not-found.error';
import { StandaloneDocumentNotIssuedError } from '../../../../standalone-documents/domain/errors/standalone-document-not-issued.error';
import { PatientCedulaRequiredForSharingError } from '../../../domain/errors/patient-cedula-required.error';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

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

const mockStandaloneDocRepo: jest.Mocked<IStandaloneDocumentRepository> = {
  list: jest.fn(),
  findById: jest.fn(),
  findByIdWithPatient: jest.fn(),
  create: jest.fn(),
  updateContent: jest.fn(),
  persistIssued: jest.fn(),
  persistVoided: jest.fn(),
  delete: jest.fn(),
  getMaxSequenceForMonth: jest.fn(),
  revokeActiveLinksForDocument: jest.fn(),
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

const mockMailer: jest.Mocked<Pick<MailerService, 'sendTemplate'>> = {
  sendTemplate: jest.fn(),
};

const mockConfig = {
  get: jest.fn((key: string) => {
    if (key === 'APP_BASE_URL') return 'http://localhost:3000';
    return undefined;
  }),
} as unknown as ConfigService;

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

const makeIssuedDoc = (
  override: Partial<{ doctorId: string; status: string; type: string }> = {},
): StandaloneDocument =>
  StandaloneDocument.create({
    id: 'doc-1',
    doctorId: override.doctorId ?? 'doctor-1',
    patientId: 'patient-1',
    type: (override.type ?? 'recipe') as 'recipe' | 'paraclinical' | 'reposo',
    code: 'REC-202610-0001',
    status: (override.status ?? 'issued') as 'draft' | 'issued' | 'voided',
    content: {
      medications: [
        { name: 'Ibuprofeno', dose: '400mg', frequency: 'c/8h', duration: '5d', indications: '' },
      ],
      notes: '',
    },
    voidReason: null,
    issuedAt: new Date('2026-10-22T10:00:00Z'),
    voidedAt: null,
    createdAt: new Date('2026-10-22T09:00:00Z'),
    updatedAt: new Date('2026-10-22T10:00:00Z'),
  });

const makePatientWithCedula = (override: Record<string, unknown> = {}) =>
  ({
    id: 'patient-1',
    doctorId: 'doctor-1',
    fullName: 'Ana Pérez',
    cedula: 'V-12345678',
    email: null,
    ...override,
  }) as Awaited<ReturnType<typeof mockPatientRepo.findById>>;

const makeSavedLink = (): SharedDocumentLink =>
  SharedDocumentLink.createForStandaloneDocument({
    id: 'link-1',
    standaloneDocumentId: 'doc-1',
    doctorId: 'doctor-1',
    patientId: 'patient-1',
    token: 'some-token',
    docSelection: { types: ['recipe'], informeBlockKeys: [] },
    status: 'active',
    failedAttempts: 0,
    lastCodeRequestedAt: null,
    createdAt: new Date(),
  });

const makeSavedCode = (): DocumentAccessCode =>
  DocumentAccessCode.create({
    id: 'code-1',
    linkId: 'link-1',
    code: '123456',
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    usedAt: null,
    failedAttempts: 0,
    createdAt: new Date(),
  });

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('ShareStandaloneDocumentUseCase', () => {
  let useCase: ShareStandaloneDocumentUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    useCase = new ShareStandaloneDocumentUseCase(
      mockLinkRepo,
      mockCodeRepo,
      mockStandaloneDocRepo,
      mockPatientRepo,
      mockMailer as unknown as MailerService,
      mockConfig,
    );

    mockStandaloneDocRepo.findById.mockResolvedValue(makeIssuedDoc());
    mockPatientRepo.findById.mockResolvedValue(makePatientWithCedula());
    mockLinkRepo.save.mockResolvedValue(makeSavedLink());
    mockCodeRepo.save.mockResolvedValue(makeSavedCode());
  });

  // -----------------------------------------------------------------------
  // Happy path
  // -----------------------------------------------------------------------

  it('returns url, code, expiresAt on success (recipe)', async () => {
    const result = await useCase.execute({
      standaloneDocumentId: 'doc-1',
      doctorId: 'doctor-1',
      doctorName: 'Dr. García',
    });

    expect(result.url).toMatch(/^http:\/\/localhost:3000\/documents\//);
    expect(result.code).toMatch(/^\d{6}$/);
    expect(result.expiresAt).toBeInstanceOf(Date);
  });

  it('persists link with standaloneDocumentId and no consultationId', async () => {
    await useCase.execute({
      standaloneDocumentId: 'doc-1',
      doctorId: 'doctor-1',
      doctorName: 'Dr. García',
    });

    const savedLink = mockLinkRepo.save.mock.calls[0]?.[0] as SharedDocumentLink;
    expect(savedLink.standaloneDocumentId).toBe('doc-1');
    expect(savedLink.consultationId).toBeNull();
  });

  it('persists docSelection with type=recipe for recipe document', async () => {
    await useCase.execute({
      standaloneDocumentId: 'doc-1',
      doctorId: 'doctor-1',
      doctorName: 'Dr. García',
    });

    const savedLink = mockLinkRepo.save.mock.calls[0]?.[0] as SharedDocumentLink;
    expect(savedLink.docSelection?.types).toEqual(['recipe']);
    expect(savedLink.docSelection?.informeBlockKeys).toEqual([]);
  });

  it('persists docSelection with type=paraclinical for paraclinical document', async () => {
    mockStandaloneDocRepo.findById.mockResolvedValue(makeIssuedDoc({ type: 'paraclinical' }));

    await useCase.execute({
      standaloneDocumentId: 'doc-1',
      doctorId: 'doctor-1',
      doctorName: 'Dr. García',
    });

    const savedLink = mockLinkRepo.save.mock.calls[0]?.[0] as SharedDocumentLink;
    expect(savedLink.docSelection?.types).toEqual(['paraclinical']);
  });

  it('persists docSelection with type=rest for reposo document', async () => {
    mockStandaloneDocRepo.findById.mockResolvedValue(makeIssuedDoc({ type: 'reposo' }));

    await useCase.execute({
      standaloneDocumentId: 'doc-1',
      doctorId: 'doctor-1',
      doctorName: 'Dr. García',
    });

    const savedLink = mockLinkRepo.save.mock.calls[0]?.[0] as SharedDocumentLink;
    expect(savedLink.docSelection?.types).toEqual(['rest']);
  });

  it('persists link + code exactly once each', async () => {
    await useCase.execute({
      standaloneDocumentId: 'doc-1',
      doctorId: 'doctor-1',
      doctorName: 'Dr. García',
    });

    expect(mockLinkRepo.save).toHaveBeenCalledTimes(1);
    expect(mockCodeRepo.save).toHaveBeenCalledTimes(1);
  });

  it('does NOT throw when email sending fails (fire-and-forget)', async () => {
    mockPatientRepo.findById.mockResolvedValue(makePatientWithCedula({ email: 'ana@test.com' }));
    mockMailer.sendTemplate.mockRejectedValue(new Error('SMTP error'));

    await expect(
      useCase.execute({ standaloneDocumentId: 'doc-1', doctorId: 'doctor-1', doctorName: 'Dr.' }),
    ).resolves.toBeDefined();
  });

  // -----------------------------------------------------------------------
  // Error — document not found / wrong doctor (anti-IDOR)
  // -----------------------------------------------------------------------

  it('throws DocumentLinkNotFoundError when document not found', async () => {
    mockStandaloneDocRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({ standaloneDocumentId: 'doc-1', doctorId: 'doctor-1', doctorName: 'Dr.' }),
    ).rejects.toBeInstanceOf(DocumentLinkNotFoundError);

    expect(mockLinkRepo.save).not.toHaveBeenCalled();
  });

  it('throws DocumentLinkNotFoundError when document belongs to another doctor', async () => {
    mockStandaloneDocRepo.findById.mockResolvedValue(makeIssuedDoc({ doctorId: 'other-doctor' }));

    await expect(
      useCase.execute({ standaloneDocumentId: 'doc-1', doctorId: 'doctor-1', doctorName: 'Dr.' }),
    ).rejects.toBeInstanceOf(DocumentLinkNotFoundError);

    expect(mockLinkRepo.save).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Error — document not issued (409)
  // -----------------------------------------------------------------------

  it('throws StandaloneDocumentNotIssuedError when document is in draft status', async () => {
    mockStandaloneDocRepo.findById.mockResolvedValue(makeIssuedDoc({ status: 'draft' }));

    await expect(
      useCase.execute({ standaloneDocumentId: 'doc-1', doctorId: 'doctor-1', doctorName: 'Dr.' }),
    ).rejects.toBeInstanceOf(StandaloneDocumentNotIssuedError);

    expect(mockLinkRepo.save).not.toHaveBeenCalled();
  });

  it('throws StandaloneDocumentNotIssuedError when document is voided', async () => {
    mockStandaloneDocRepo.findById.mockResolvedValue(makeIssuedDoc({ status: 'voided' }));

    await expect(
      useCase.execute({ standaloneDocumentId: 'doc-1', doctorId: 'doctor-1', doctorName: 'Dr.' }),
    ).rejects.toBeInstanceOf(StandaloneDocumentNotIssuedError);

    expect(mockLinkRepo.save).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Error — patient missing cédula (422)
  // -----------------------------------------------------------------------

  it('throws PatientCedulaRequiredForSharingError when patient has no cédula', async () => {
    mockPatientRepo.findById.mockResolvedValue(makePatientWithCedula({ cedula: null }));

    await expect(
      useCase.execute({ standaloneDocumentId: 'doc-1', doctorId: 'doctor-1', doctorName: 'Dr.' }),
    ).rejects.toBeInstanceOf(PatientCedulaRequiredForSharingError);

    expect(mockLinkRepo.save).not.toHaveBeenCalled();
  });

  it('throws PatientCedulaRequiredForSharingError when patient record is missing', async () => {
    mockPatientRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({ standaloneDocumentId: 'doc-1', doctorId: 'doctor-1', doctorName: 'Dr.' }),
    ).rejects.toBeInstanceOf(PatientCedulaRequiredForSharingError);

    expect(mockLinkRepo.save).not.toHaveBeenCalled();
  });
});
