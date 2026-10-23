/**
 * GetDocumentRenderDataUseCase — standalone document branch specs.
 *
 * These tests cover the early-return path when link.standaloneDocumentId is set.
 * The consultation path is fully covered by get-document-render-data.use-case.spec.ts
 * which must continue to pass UNCHANGED (regression guard).
 */
import { ConfigService } from '@nestjs/config';
import { GetDocumentRenderDataUseCase } from './get-document-render-data.use-case';
import { VerifyCodeUseCase } from './verify-code.use-case';
import { SessionTokenValidatorService } from '../../../application/services/session-token-validator.service';
import { GetConsultationBlocksUseCase } from '../../../../consultation-blocks/application/use-cases/consultation-blocks/get-consultation-blocks.use-case';
import type { GetConsultationBlocksOutput } from '../../../../consultation-blocks/application/use-cases/consultation-blocks/get-consultation-blocks.use-case';
import type { ISharedDocumentLinkRepository } from '../../../domain/repositories/shared-document-link.repository';
import type { IConsultationRepository } from '../../../../consultations/domain/repositories/consultation.repository';
import type { IPrescriptionRepository } from '../../../../prescriptions/domain/repositories/prescription.repository';
import type { IEhrRepository } from '../../../../ehr/domain/repositories/ehr.repository';
import type { IPatientRepository } from '../../../../patients/domain/repositories/patient.repository';
import type { IDoctorProfileRepository } from '../../../../doctor-settings/domain/repositories/doctor-profile.repository';
import type { IDoctorTemplateRepository } from '../../../../doctor-templates/domain/repositories/doctor-template.repository';
import type { IStoragePort } from '../../../../storage/application/ports/storage.port';
import type { IStandaloneDocumentRepository } from '../../../../standalone-documents/domain/repositories/istandalone-document.repository';
import { SharedDocumentLink } from '../../../domain/entities/shared-document-link.entity';
import { StandaloneDocument } from '../../../../standalone-documents/domain/entities/standalone-document.entity';
import { DocumentLinkNotFoundError } from '../../../domain/errors/document-link-not-found.error';
import { DocumentLinkNotActiveError } from '../../../domain/errors/document-link-not-active.error';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_SECRET = 'test-secret-standalone-render';

const mockConfig = {
  get: jest.fn((key: string) => {
    if (key === 'AUTH_RESOLVE_SECRET') return TEST_SECRET;
    return undefined;
  }),
} as unknown as ConfigService;

const makeValidator = (config: ConfigService) => new SessionTokenValidatorService(config);

/** Sign a session token using the VerifyCodeUseCase helper (same approach as main spec). */
const signToken = (linkId: string, token: string, exp: Date): string => {
  const uc = new VerifyCodeUseCase(
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
  return uc.signSessionToken(linkId, token, exp);
};

// ---------------------------------------------------------------------------
// Mock repositories
// ---------------------------------------------------------------------------

const mockLinkRepo: jest.Mocked<ISharedDocumentLinkRepository> = {
  save: jest.fn(),
  findByToken: jest.fn(),
  findById: jest.fn(),
  incrementLinkFailedAttempts: jest.fn(),
  updateLastCodeRequestedAt: jest.fn(),
};

const mockConsultationRepo: jest.Mocked<IConsultationRepository> = {
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
};

const mockPrescriptionRepo: jest.Mocked<IPrescriptionRepository> = {
  findById: jest.fn(),
  findByPatient: jest.fn(),
  findByConsultation: jest.fn(),
  save: jest.fn(),
};

const mockEhrRepo: jest.Mocked<IEhrRepository> = {
  findById: jest.fn(),
  findByPatient: jest.fn(),
  findByConsultation: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
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

const mockDoctorProfileRepo: jest.Mocked<IDoctorProfileRepository> = {
  findByDoctorId: jest.fn(),
  update: jest.fn(),
  updateExchangeRate: jest.fn(),
  markOnboardingCompleted: jest.fn().mockResolvedValue(undefined),
  updateBlocksLayout: jest.fn().mockResolvedValue(undefined),
  countUpcomingAppointments: jest.fn().mockResolvedValue(0),
  deactivateOwnAccount: jest.fn().mockResolvedValue(undefined),
  findPlanSnapshot: jest.fn().mockResolvedValue(null),
  scheduleOwnAccountDeactivation: jest.fn().mockResolvedValue(undefined),
  applyExpiredScheduledDeactivations: jest.fn().mockResolvedValue(0),
};

const mockDoctorTemplateRepo: jest.Mocked<IDoctorTemplateRepository> = {
  listByDoctor: jest.fn(),
  findByDoctorAndType: jest.fn(),
  upsert: jest.fn(),
};

const mockStorage: jest.Mocked<IStoragePort> = {
  upload: jest.fn(),
  getSignedUrl: jest.fn(),
};

const mockGetConsultationBlocks = {
  execute: jest.fn(),
} as unknown as jest.Mocked<GetConsultationBlocksUseCase>;

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
};

// ---------------------------------------------------------------------------
// Entity factories
// ---------------------------------------------------------------------------

const makeStandaloneLink = (
  override: Partial<{ type: string; status: string }> = {},
): SharedDocumentLink =>
  SharedDocumentLink.createForStandaloneDocument({
    id: 'link-standalone-1',
    standaloneDocumentId: 'doc-1',
    doctorId: 'doctor-1',
    patientId: 'patient-1',
    token: 'standalone-token',
    docSelection: {
      types: [(override.type ?? 'recipe') as string],
      informeBlockKeys: [],
    },
    status: (override.status ?? 'active') as 'active' | 'revoked',
    failedAttempts: 0,
    lastCodeRequestedAt: null,
    createdAt: new Date('2026-10-22T10:00:00Z'),
  });

const makeRecipeDoc = (): StandaloneDocument =>
  StandaloneDocument.create({
    id: 'doc-1',
    doctorId: 'doctor-1',
    patientId: 'patient-1',
    type: 'recipe',
    code: 'REC-202610-0001',
    status: 'issued',
    content: {
      medications: [
        {
          name: 'Ibuprofeno',
          dose: '400mg',
          route: 'oral',
          frequency: 'c/8h',
          duration: '5 días',
          presentation: 'tabletas',
          indications: 'Tomar con comida',
        },
        {
          name: 'Omeprazol',
          dose: '20mg',
          route: 'oral',
          frequency: 'c/12h',
          duration: '10 días',
          presentation: 'cápsulas',
          indications: '',
        },
      ],
      notes: '',
    },
    voidReason: null,
    issuedAt: new Date('2026-10-22T10:00:00Z'),
    voidedAt: null,
    createdAt: new Date('2026-10-22T09:00:00Z'),
    updatedAt: new Date('2026-10-22T10:00:00Z'),
  });

const makeParaclinicalDoc = (): StandaloneDocument =>
  StandaloneDocument.create({
    id: 'doc-1',
    doctorId: 'doctor-1',
    patientId: 'patient-1',
    type: 'paraclinical',
    code: 'PAR-202610-0001',
    status: 'issued',
    content: {
      items: [
        { exam_name: 'Hemograma completo', notes: 'Urgente' },
        { exam_name: 'Glicemia en ayunas', notes: '' },
      ],
    },
    voidReason: null,
    issuedAt: new Date('2026-10-22T10:00:00Z'),
    voidedAt: null,
    createdAt: new Date('2026-10-22T09:00:00Z'),
    updatedAt: new Date('2026-10-22T10:00:00Z'),
  });

const makeReposoDoc = (): StandaloneDocument =>
  StandaloneDocument.create({
    id: 'doc-1',
    doctorId: 'doctor-1',
    patientId: 'patient-1',
    type: 'reposo',
    code: 'REP-202610-0001',
    status: 'issued',
    content: {
      diagnosis: 'Gastroenteritis aguda',
      days: 3,
      from: '2026-10-22',
      to: '2026-10-24',
      comments: 'Reposo absoluto',
    },
    voidReason: null,
    issuedAt: new Date('2026-10-22T10:00:00Z'),
    voidedAt: null,
    createdAt: new Date('2026-10-22T09:00:00Z'),
    updatedAt: new Date('2026-10-22T10:00:00Z'),
  });

const makeBlocksOutput = (): GetConsultationBlocksOutput => ({
  catalog: [],
  doctor_config: [],
  resolved: [],
  specialty_defaults: [],
  doctor_specialty: null,
  layout: 'tabs',
});

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('GetDocumentRenderDataUseCase — standalone document branch', () => {
  let useCase: GetDocumentRenderDataUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    useCase = new GetDocumentRenderDataUseCase(
      mockLinkRepo,
      mockConsultationRepo,
      mockPrescriptionRepo,
      mockEhrRepo,
      mockPatientRepo,
      mockDoctorProfileRepo,
      mockDoctorTemplateRepo,
      mockStorage,
      makeValidator(mockConfig),
      mockGetConsultationBlocks,
      mockStandaloneDocRepo, // 11th optional param
    );

    // Happy-path defaults
    mockLinkRepo.findByToken.mockResolvedValue(makeStandaloneLink());
    mockStandaloneDocRepo.findByIdWithPatient.mockResolvedValue({
      document: makeRecipeDoc(),
      patient: {
        id: 'patient-1',
        fullName: 'Ana Pérez',
        cedula: 'V-12345678',
        age: 30,
      },
    });
    mockDoctorProfileRepo.findByDoctorId.mockResolvedValue({
      id: 'doctor-1',
      fullName: 'Dr. García',
      professionalTitle: 'Médico Cirujano',
      specialty: 'Medicina Interna',
      licenseNumber: 'MPPS-12345',
      logoUrl: null,
      signatureUrl: null,
    } as Awaited<ReturnType<typeof mockDoctorProfileRepo.findByDoctorId>>);
    mockDoctorTemplateRepo.findByDoctorAndType.mockResolvedValue(null);
    mockPatientRepo.logReveal.mockResolvedValue();
    mockStorage.getSignedUrl.mockResolvedValue('https://storage.example.com/signed?token=abc');
    mockGetConsultationBlocks.execute.mockResolvedValue(makeBlocksOutput());
  });

  // -----------------------------------------------------------------------
  // General standalone path
  // -----------------------------------------------------------------------

  it('does NOT call consultationRepo when link is for a standalone document', async () => {
    const exp = new Date(Date.now() + 60_000);
    const sessionToken = signToken('link-standalone-1', 'standalone-token', exp);
    await useCase.execute({ token: 'standalone-token', sessionToken });

    expect(mockConsultationRepo.findById).not.toHaveBeenCalled();
    expect(mockPrescriptionRepo.findByConsultation).not.toHaveBeenCalled();
    expect(mockEhrRepo.findByPatient).not.toHaveBeenCalled();
  });

  it('uses standaloneDocRepo.findByIdWithPatient with doctorId from link (anti-IDOR)', async () => {
    const exp = new Date(Date.now() + 60_000);
    const sessionToken = signToken('link-standalone-1', 'standalone-token', exp);
    await useCase.execute({ token: 'standalone-token', sessionToken });

    expect(mockStandaloneDocRepo.findByIdWithPatient).toHaveBeenCalledWith('doc-1', 'doctor-1');
  });

  it('throws DocumentLinkNotFoundError when standalone document is not found', async () => {
    mockStandaloneDocRepo.findByIdWithPatient.mockResolvedValue(null);
    const sessionToken = signToken(
      'link-standalone-1',
      'standalone-token',
      new Date(Date.now() + 60_000),
    );

    await expect(
      useCase.execute({ token: 'standalone-token', sessionToken }),
    ).rejects.toBeInstanceOf(DocumentLinkNotFoundError);
  });

  it('throws DocumentLinkNotActiveError when standalone link is revoked', async () => {
    mockLinkRepo.findByToken.mockResolvedValue(makeStandaloneLink({ status: 'revoked' }));
    const sessionToken = signToken(
      'link-standalone-1',
      'standalone-token',
      new Date(Date.now() + 60_000),
    );

    await expect(
      useCase.execute({ token: 'standalone-token', sessionToken }),
    ).rejects.toBeInstanceOf(DocumentLinkNotActiveError);
  });

  it('fires audit log on successful standalone render', async () => {
    const sessionToken = signToken(
      'link-standalone-1',
      'standalone-token',
      new Date(Date.now() + 60_000),
    );
    await useCase.execute({ token: 'standalone-token', sessionToken });

    await Promise.resolve(); // flush microtasks
    expect(mockPatientRepo.logReveal).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'doctor-1',
        actorRole: 'doctor',
        patientId: 'patient-1',
        fieldRevealed: expect.stringContaining('shared_document_render'),
      }),
    );
  });

  it('returns patient.fullName and patient.cedula from standalone detail', async () => {
    const sessionToken = signToken(
      'link-standalone-1',
      'standalone-token',
      new Date(Date.now() + 60_000),
    );
    const result = await useCase.execute({ token: 'standalone-token', sessionToken });

    expect(result.patient.fullName).toBe('Ana Pérez');
    expect(result.patient.cedula).toBe('V-12345678');
  });

  it('returns doctor profile from doctorProfileRepo', async () => {
    const sessionToken = signToken(
      'link-standalone-1',
      'standalone-token',
      new Date(Date.now() + 60_000),
    );
    const result = await useCase.execute({ token: 'standalone-token', sessionToken });

    expect(result.doctor.fullName).toBe('Dr. García');
  });

  it('returns ehrRecords as empty array for standalone documents', async () => {
    const sessionToken = signToken(
      'link-standalone-1',
      'standalone-token',
      new Date(Date.now() + 60_000),
    );
    const result = await useCase.execute({ token: 'standalone-token', sessionToken });

    expect(result.ehrRecords).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // Recipe render data shape
  // -----------------------------------------------------------------------

  it('builds correct render data shape for a recipe document', async () => {
    const sessionToken = signToken(
      'link-standalone-1',
      'standalone-token',
      new Date(Date.now() + 60_000),
    );
    const result = await useCase.execute({ token: 'standalone-token', sessionToken });

    // docSelection carries the type
    expect(result.docSelection?.types).toEqual(['recipe']);
    expect(result.docSelection?.informeBlockKeys).toEqual([]);

    // consultationCode = doc.code; consultationDate = doc.issuedAt
    expect(result.consultation.consultationCode).toBe('REC-202610-0001');
    expect(result.consultation.consultationDate).toBe('2026-10-22T10:00:00.000Z');

    // blocksSnapshot is null for recipe (prescriptions carry the data)
    expect(result.consultation.blocksSnapshot).toBeNull();
    expect(result.consultationBlocks).toEqual([]);
  });

  it('maps recipe medications to prescriptions (one row per medication)', async () => {
    const sessionToken = signToken(
      'link-standalone-1',
      'standalone-token',
      new Date(Date.now() + 60_000),
    );
    const result = await useCase.execute({ token: 'standalone-token', sessionToken });

    expect(result.prescriptions).toHaveLength(2);

    const first = result.prescriptions[0]!;
    expect(first.medication).toBe('Ibuprofeno');
    expect(first.dosage).toBe('400mg');
    expect(first.frequency).toBe('c/8h');
    expect(first.duration).toBe('5 días');
    // indications in standalone content maps to notes in the prescription row
    expect(first.notes).toBe('Tomar con comida');

    const second = result.prescriptions[1]!;
    expect(second.medication).toBe('Omeprazol');
    // empty indications → null notes
    expect(second.notes).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Paraclinical render data shape
  // -----------------------------------------------------------------------

  it('builds correct render data shape for a paraclinical document', async () => {
    mockLinkRepo.findByToken.mockResolvedValue(makeStandaloneLink({ type: 'paraclinical' }));
    mockStandaloneDocRepo.findByIdWithPatient.mockResolvedValue({
      document: makeParaclinicalDoc(),
      patient: { id: 'patient-1', fullName: 'Ana Pérez', cedula: 'V-12345678', age: 30 },
    });

    const sessionToken = signToken(
      'link-standalone-1',
      'standalone-token',
      new Date(Date.now() + 60_000),
    );
    const result = await useCase.execute({ token: 'standalone-token', sessionToken });

    expect(result.docSelection?.types).toEqual(['paraclinical']);
    expect(result.prescriptions).toEqual([]);

    // blocksSnapshot must have 'paraclinical' key with serialized items
    expect(result.consultation.blocksSnapshot).not.toBeNull();
    const snap = result.consultation.blocksSnapshot!;
    expect(Array.isArray(snap['paraclinical'])).toBe(true);
    const items = snap['paraclinical'] as string[];
    expect(items[0]).toBe('Hemograma completo — Urgente');
    expect(items[1]).toBe('Glicemia en ayunas'); // no notes → plain exam_name

    // Synthetic consultationBlock for 'paraclinical' must be present
    expect(result.consultationBlocks).toHaveLength(1);
    expect(result.consultationBlocks[0]?.key).toBe('paraclinical');
    expect(result.consultationBlocks[0]?.label).toBe('Exámenes solicitados');
    expect(result.consultationBlocks[0]?.printable).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Reposo render data shape
  // -----------------------------------------------------------------------

  it('builds correct render data shape for a reposo document', async () => {
    mockLinkRepo.findByToken.mockResolvedValue(makeStandaloneLink({ type: 'rest' }));
    mockStandaloneDocRepo.findByIdWithPatient.mockResolvedValue({
      document: makeReposoDoc(),
      patient: { id: 'patient-1', fullName: 'Ana Pérez', cedula: 'V-12345678', age: 30 },
    });

    const sessionToken = signToken(
      'link-standalone-1',
      'standalone-token',
      new Date(Date.now() + 60_000),
    );
    const result = await useCase.execute({ token: 'standalone-token', sessionToken });

    expect(result.docSelection?.types).toEqual(['rest']);
    expect(result.prescriptions).toEqual([]);
    expect(result.consultationBlocks).toEqual([]);

    // blocksSnapshot.reposo must match readRestFromSnapshot's expected shape
    const snap = result.consultation.blocksSnapshot!;
    expect(snap['reposo']).toMatchObject({
      diagnosis: 'Gastroenteritis aguda',
      days: 3,
      from: '2026-10-22',
      to: '2026-10-24',
      comments: 'Reposo absoluto',
    });

    // consultationCode = doc.code
    expect(result.consultation.consultationCode).toBe('REP-202610-0001');
  });
});
