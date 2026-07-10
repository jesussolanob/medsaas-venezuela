import { ConfigService } from '@nestjs/config';
import { GetDocumentRenderDataUseCase } from './get-document-render-data.use-case';
import { VerifyCodeUseCase } from './verify-code.use-case';
import { SessionTokenValidatorService } from '../../../application/services/session-token-validator.service';
import { GetConsultationBlocksUseCase } from '../../../../consultation-blocks/application/use-cases/consultation-blocks/get-consultation-blocks.use-case';
import type { GetConsultationBlocksOutput } from '../../../../consultation-blocks/application/use-cases/consultation-blocks/get-consultation-blocks.use-case';
import { ConsultationBlock } from '../../../../consultation-blocks/domain/entities/consultation-block.entity';
import type { ISharedDocumentLinkRepository } from '../../../domain/repositories/shared-document-link.repository';
import type { IConsultationRepository } from '../../../../consultations/domain/repositories/consultation.repository';
import type { IPrescriptionRepository } from '../../../../prescriptions/domain/repositories/prescription.repository';
import type { IEhrRepository } from '../../../../ehr/domain/repositories/ehr.repository';
import type { IPatientRepository } from '../../../../patients/domain/repositories/patient.repository';
import type { IDoctorProfileRepository } from '../../../../doctor-settings/domain/repositories/doctor-profile.repository';
import type { IDoctorTemplateRepository } from '../../../../doctor-templates/domain/repositories/doctor-template.repository';
import type { IStoragePort } from '../../../../storage/application/ports/storage.port';
import { SharedDocumentLink } from '../../../domain/entities/shared-document-link.entity';
import { Consultation } from '../../../../consultations/domain/entities/consultation.entity';
import { Prescription } from '../../../../prescriptions/domain/entities/prescription.entity';
import { EhrRecord } from '../../../../ehr/domain/entities/ehr-record.entity';
import { DoctorTemplate } from '../../../../doctor-templates/domain/entities/doctor-template.entity';
import { DocumentLinkNotFoundError } from '../../../domain/errors/document-link-not-found.error';
import { DocumentLinkNotActiveError } from '../../../domain/errors/document-link-not-active.error';
import { InvalidSessionTokenError } from '../../../domain/errors/invalid-session-token.error';
import { MissingHmacSecretError } from '../../../domain/errors/missing-hmac-secret.error';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const TEST_SECRET = 'test-secret-render-data-spec';

const mockConfig = {
  get: jest.fn((key: string) => {
    if (key === 'AUTH_RESOLVE_SECRET') return TEST_SECRET;
    return undefined;
  }),
} as unknown as ConfigService;

const mockConfigNoSecret = {
  get: jest.fn(() => undefined),
} as unknown as ConfigService;

const makeValidator = (config: ConfigService) => new SessionTokenValidatorService(config);

/** Produce a valid session token via VerifyCodeUseCase.signSessionToken */
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
  save: jest.fn(),
  update: jest.fn(),
  updatePayment: jest.fn(),
  list: jest.fn(),
  findByPatient: jest.fn(),
  findByAppointmentId: jest.fn(),
  deleteById: jest.fn().mockResolvedValue(undefined),
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

// ---------------------------------------------------------------------------
// Entity factories
// ---------------------------------------------------------------------------

const makeBlock = (key: string, label: string): ConsultationBlock =>
  new ConsultationBlock({
    key,
    label,
    contentType: 'rich_text',
    enabled: true,
    sortOrder: 1,
    printable: true,
    sendToPatient: false,
    description: null,
    customDescription: null,
  });

const makeBlocksOutput = (blocks: ConsultationBlock[]): GetConsultationBlocksOutput => ({
  catalog: [],
  doctor_config: [],
  resolved: blocks,
  specialty_defaults: [],
  doctor_specialty: null,
});

const makeActiveLink = (): SharedDocumentLink =>
  SharedDocumentLink.create({
    id: 'link-1',
    consultationId: 'consult-1',
    doctorId: 'doctor-1',
    patientId: 'patient-1',
    token: 'the-link-token',
    sections: { report: true, prescriptions: false, ehr: false },
    docSelection: { types: ['recipe', 'informe'], informeBlockKeys: ['diagnosis'] },
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
    consultationCode: 'DLT-202607-001',
    consultationDate: new Date('2026-07-10'),
    chiefComplaint: 'headache',
    diagnosis: 'tension headache',
    treatment: 'ibuprofen',
    notes: null,
    paymentStatus: 'pending',
    paymentMethod: null,
    amount: null,
    paymentDate: null,
    blocksSnapshot: { diagnosis: 'tension headache' },
    createdAt: new Date(),
    updatedAt: new Date(),
  });

const makePrescription = (): Prescription =>
  Prescription.create({
    id: 'rx-1',
    doctorId: 'doctor-1',
    consultationId: 'consult-1',
    patientId: 'patient-1',
    medication: 'Ibuprofeno',
    dosage: '400 mg',
    frequency: 'cada 8h',
    duration: '5 días',
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

const makeEhrRecord = (): EhrRecord =>
  EhrRecord.create({
    id: 'ehr-1',
    doctorId: 'doctor-1',
    patientId: 'patient-1',
    consultationId: 'consult-1',
    diagnosis: 'tension headache',
    treatmentPlan: 'ibuprofen + rest',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

const makeTemplate = (): DoctorTemplate =>
  DoctorTemplate.create({
    id: 'tmpl-1',
    doctorId: 'doctor-1',
    templateType: 'informe',
    logoUrl: 'uploads/logos/doctor-1/logo.png',
    signatureUrl: 'uploads/signatures/doctor-1/sig.png',
    fontFamily: 'Helvetica',
    headerText: 'Delta Medical',
    footerText: 'Confidencial',
    showLogo: true,
    showSignature: true,
    primaryColor: '#1A73E8',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('GetDocumentRenderDataUseCase', () => {
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
    );

    // Default happy-path mocks
    mockLinkRepo.findByToken.mockResolvedValue(makeActiveLink());
    mockConsultationRepo.findById.mockResolvedValue(makeConsultation());
    mockPrescriptionRepo.findByConsultation.mockResolvedValue([makePrescription()]);
    mockEhrRepo.findByConsultation.mockResolvedValue(makeEhrRecord());
    mockPatientRepo.findById.mockResolvedValue({
      id: 'patient-1',
      doctorId: 'doctor-1',
      fullName: 'Ana Pérez',
      cedula: 'V-12345678',
    } as Parameters<typeof mockPatientRepo.findById>[0] extends never
      ? never
      : Awaited<ReturnType<typeof mockPatientRepo.findById>>);
    mockDoctorProfileRepo.findByDoctorId.mockResolvedValue({
      id: 'doctor-1',
      fullName: 'Dr. Juan García',
      professionalTitle: 'Médico Cirujano',
      specialty: 'Medicina Interna',
      licenseNumber: 'MPPS-12345',
      logoUrl: 'uploads/logos/doctor-1/logo.png',
      signatureUrl: 'uploads/signatures/doctor-1/sig.png',
    } as Awaited<ReturnType<typeof mockDoctorProfileRepo.findByDoctorId>>);
    mockDoctorTemplateRepo.findByDoctorAndType.mockResolvedValue(makeTemplate());
    mockPatientRepo.logReveal.mockResolvedValue();
    mockStorage.getSignedUrl.mockResolvedValue('https://storage.example.com/signed?token=abc');
    // Default: two resolved blocks
    mockGetConsultationBlocks.execute.mockResolvedValue(
      makeBlocksOutput([
        makeBlock('diagnosis', 'Diagnóstico'),
        makeBlock('treatment', 'Tratamiento'),
      ]),
    );
  });

  // -----------------------------------------------------------------------
  // Happy path
  // -----------------------------------------------------------------------

  it('returns full render data on valid session token', async () => {
    const exp = new Date(Date.now() + 10 * 60 * 1000);
    const sessionToken = signToken('link-1', 'the-link-token', exp);

    const result = await useCase.execute({ token: 'the-link-token', sessionToken });

    expect(result.consultation.id).toBe('consult-1');
    expect(result.consultation.consultationCode).toBe('DLT-202607-001');
    expect(result.consultation.blocksSnapshot).toEqual({ diagnosis: 'tension headache' });
    expect(result.patient.fullName).toBe('Ana Pérez');
    expect(result.doctor.fullName).toBe('Dr. Juan García');
    expect(result.prescriptions).toHaveLength(1);
    expect(result.prescriptions[0]?.medication).toBe('Ibuprofeno');
    expect(result.ehrRecord?.diagnosis).toBe('tension headache');
  });

  it('returns docSelection from the link', async () => {
    const sessionToken = signToken('link-1', 'the-link-token', new Date(Date.now() + 60_000));
    const result = await useCase.execute({ token: 'the-link-token', sessionToken });

    expect(result.docSelection).toEqual({
      types: ['recipe', 'informe'],
      informeBlockKeys: ['diagnosis'],
    });
    expect(result.sections).toEqual({ report: true, prescriptions: false, ehr: false });
  });

  it('returns docSelection as null for a legacy link without docSelection', async () => {
    mockLinkRepo.findByToken.mockResolvedValue(
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
      }),
    );
    const sessionToken = signToken('link-1', 'the-link-token', new Date(Date.now() + 60_000));
    const result = await useCase.execute({ token: 'the-link-token', sessionToken });

    expect(result.docSelection).toBeNull();
  });

  it('includes template config when doctor has an informe template', async () => {
    const sessionToken = signToken('link-1', 'the-link-token', new Date(Date.now() + 60_000));
    const result = await useCase.execute({ token: 'the-link-token', sessionToken });

    expect(result.templateConfig).not.toBeNull();
    expect(result.templateConfig?.headerText).toBe('Delta Medical');
    expect(result.templateConfig?.primaryColor).toBe('#1A73E8');
    // Signed URLs should be resolved
    expect(result.templateConfig?.logoUrl).toBe('https://storage.example.com/signed?token=abc');
  });

  it('returns null templateConfig when no informe template is configured', async () => {
    mockDoctorTemplateRepo.findByDoctorAndType.mockResolvedValue(null);
    const sessionToken = signToken('link-1', 'the-link-token', new Date(Date.now() + 60_000));
    const result = await useCase.execute({ token: 'the-link-token', sessionToken });

    expect(result.templateConfig).toBeNull();
  });

  it('resolves signed URLs for doctor logo and signature', async () => {
    const sessionToken = signToken('link-1', 'the-link-token', new Date(Date.now() + 60_000));
    const result = await useCase.execute({ token: 'the-link-token', sessionToken });

    expect(result.doctor.logoUrl).toBe('https://storage.example.com/signed?token=abc');
    expect(result.doctor.signatureUrl).toBe('https://storage.example.com/signed?token=abc');
  });

  it('returns null for logo/signature when doctor profile has no URL', async () => {
    mockDoctorProfileRepo.findByDoctorId.mockResolvedValue({
      id: 'doctor-1',
      fullName: 'Dr. Juan García',
      professionalTitle: null,
      specialty: null,
      licenseNumber: null,
      logoUrl: null,
      signatureUrl: null,
    } as Awaited<ReturnType<typeof mockDoctorProfileRepo.findByDoctorId>>);

    const sessionToken = signToken('link-1', 'the-link-token', new Date(Date.now() + 60_000));
    const result = await useCase.execute({ token: 'the-link-token', sessionToken });

    expect(result.doctor.logoUrl).toBeNull();
    expect(result.doctor.signatureUrl).toBeNull();
    expect(mockStorage.getSignedUrl).not.toHaveBeenCalledWith(null);
  });

  it('returns null for signed URL when storage.getSignedUrl throws', async () => {
    mockStorage.getSignedUrl.mockRejectedValue(new Error('GCS unavailable'));
    const sessionToken = signToken('link-1', 'the-link-token', new Date(Date.now() + 60_000));
    const result = await useCase.execute({ token: 'the-link-token', sessionToken });

    // Should not throw — storage errors are swallowed and return null
    expect(result.doctor.logoUrl).toBeNull();
  });

  it('returns null ehrRecord when no EHR record exists', async () => {
    mockEhrRepo.findByConsultation.mockResolvedValue(null);
    const sessionToken = signToken('link-1', 'the-link-token', new Date(Date.now() + 60_000));
    const result = await useCase.execute({ token: 'the-link-token', sessionToken });

    expect(result.ehrRecord).toBeNull();
  });

  it('returns empty prescriptions array when none exist', async () => {
    mockPrescriptionRepo.findByConsultation.mockResolvedValue([]);
    const sessionToken = signToken('link-1', 'the-link-token', new Date(Date.now() + 60_000));
    const result = await useCase.execute({ token: 'the-link-token', sessionToken });

    expect(result.prescriptions).toEqual([]);
  });

  it('fires audit log on successful render', async () => {
    const sessionToken = signToken('link-1', 'the-link-token', new Date(Date.now() + 60_000));
    await useCase.execute({ token: 'the-link-token', sessionToken });

    // Fire-and-forget: give microtasks time to flush
    await Promise.resolve();
    expect(mockPatientRepo.logReveal).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'doctor-1',
        actorRole: 'doctor',
        patientId: 'patient-1',
        fieldRevealed: expect.stringContaining('shared_document_render'),
      }),
    );
  });

  it('falls back to Dr./Dra. when doctor profile is not found', async () => {
    mockDoctorProfileRepo.findByDoctorId.mockResolvedValue(null);
    const sessionToken = signToken('link-1', 'the-link-token', new Date(Date.now() + 60_000));
    const result = await useCase.execute({ token: 'the-link-token', sessionToken });

    expect(result.doctor.fullName).toBe('Dr./Dra.');
  });

  it('falls back to Paciente when patient record is not found', async () => {
    mockPatientRepo.findById.mockResolvedValue(null);
    const sessionToken = signToken('link-1', 'the-link-token', new Date(Date.now() + 60_000));
    const result = await useCase.execute({ token: 'the-link-token', sessionToken });

    expect(result.patient.fullName).toBe('Paciente');
    expect(result.patient.cedula).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Error cases — same as download (same session token validation)
  // -----------------------------------------------------------------------

  it('throws DocumentLinkNotFoundError when link does not exist', async () => {
    mockLinkRepo.findByToken.mockResolvedValue(null);
    const sessionToken = signToken('link-1', 'the-link-token', new Date(Date.now() + 60_000));

    await expect(useCase.execute({ token: 'unknown', sessionToken })).rejects.toBeInstanceOf(
      DocumentLinkNotFoundError,
    );
  });

  it('throws DocumentLinkNotActiveError when link is revoked', async () => {
    mockLinkRepo.findByToken.mockResolvedValue(
      SharedDocumentLink.create({
        id: 'link-1',
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
    const sessionToken = signToken('link-1', 'the-link-token', new Date(Date.now() + 60_000));

    await expect(useCase.execute({ token: 'the-link-token', sessionToken })).rejects.toBeInstanceOf(
      DocumentLinkNotActiveError,
    );
  });

  it('throws InvalidSessionTokenError for empty sessionToken', async () => {
    await expect(
      useCase.execute({ token: 'the-link-token', sessionToken: '' }),
    ).rejects.toBeInstanceOf(InvalidSessionTokenError);
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
    const exp = new Date(Date.now() - 1000);
    const sessionToken = signToken('link-1', 'the-link-token', exp);

    await expect(useCase.execute({ token: 'the-link-token', sessionToken })).rejects.toBeInstanceOf(
      InvalidSessionTokenError,
    );
  });

  it('throws InvalidSessionTokenError when token does not match link', async () => {
    const exp = new Date(Date.now() + 60_000);
    const sessionToken = signToken('other-link', 'other-token', exp);

    await expect(useCase.execute({ token: 'the-link-token', sessionToken })).rejects.toBeInstanceOf(
      InvalidSessionTokenError,
    );
  });

  it('throws MissingHmacSecretError when AUTH_RESOLVE_SECRET is absent', async () => {
    const useCaseNoSecret = new GetDocumentRenderDataUseCase(
      mockLinkRepo,
      mockConsultationRepo,
      mockPrescriptionRepo,
      mockEhrRepo,
      mockPatientRepo,
      mockDoctorProfileRepo,
      mockDoctorTemplateRepo,
      mockStorage,
      makeValidator(mockConfigNoSecret),
      mockGetConsultationBlocks,
    );
    const exp = new Date(Date.now() + 60_000);
    const sessionToken = signToken('link-1', 'the-link-token', exp);

    await expect(
      useCaseNoSecret.execute({ token: 'the-link-token', sessionToken }),
    ).rejects.toBeInstanceOf(MissingHmacSecretError);
  });

  // -----------------------------------------------------------------------
  // Anti-IDOR: consultation not found for link (disappears after share)
  // -----------------------------------------------------------------------

  it('throws DocumentLinkNotFoundError when consultation is missing', async () => {
    mockConsultationRepo.findById.mockResolvedValue(null);
    const sessionToken = signToken('link-1', 'the-link-token', new Date(Date.now() + 60_000));

    await expect(useCase.execute({ token: 'the-link-token', sessionToken })).rejects.toBeInstanceOf(
      DocumentLinkNotFoundError,
    );
  });

  // -----------------------------------------------------------------------
  // Anti-IDOR: doctorId always comes from the link, never from input
  // -----------------------------------------------------------------------

  it('always fetches data using the doctorId from the link', async () => {
    const sessionToken = signToken('link-1', 'the-link-token', new Date(Date.now() + 60_000));
    await useCase.execute({ token: 'the-link-token', sessionToken });

    // All repo calls must use the link's doctorId ('doctor-1'), never anything else
    expect(mockConsultationRepo.findById).toHaveBeenCalledWith('consult-1', 'doctor-1');
    expect(mockPrescriptionRepo.findByConsultation).toHaveBeenCalledWith('consult-1', 'doctor-1');
    expect(mockEhrRepo.findByConsultation).toHaveBeenCalledWith('consult-1', 'doctor-1');
    expect(mockPatientRepo.findById).toHaveBeenCalledWith('patient-1', 'doctor-1');
    expect(mockDoctorProfileRepo.findByDoctorId).toHaveBeenCalledWith('doctor-1');
    expect(mockDoctorTemplateRepo.findByDoctorAndType).toHaveBeenCalledWith('doctor-1', 'informe');
  });

  // -----------------------------------------------------------------------
  // consultationBlocks (Ajuste 1)
  // -----------------------------------------------------------------------

  it('returns resolved consultation blocks mapped to key/label/printable/sortOrder', async () => {
    const sessionToken = signToken('link-1', 'the-link-token', new Date(Date.now() + 60_000));
    const result = await useCase.execute({ token: 'the-link-token', sessionToken });

    expect(result.consultationBlocks).toHaveLength(2);
    expect(result.consultationBlocks[0]).toEqual({
      key: 'diagnosis',
      label: 'Diagnóstico',
      printable: true,
      sortOrder: 1,
    });
    expect(result.consultationBlocks[1]).toEqual({
      key: 'treatment',
      label: 'Tratamiento',
      printable: true,
      sortOrder: 1,
    });
    // Blocks are fetched with the link's doctorId (anti-IDOR)
    expect(mockGetConsultationBlocks.execute).toHaveBeenCalledWith('doctor-1');
  });

  it('returns empty consultationBlocks array when doctor has no resolved blocks', async () => {
    mockGetConsultationBlocks.execute.mockResolvedValue(makeBlocksOutput([]));
    const sessionToken = signToken('link-1', 'the-link-token', new Date(Date.now() + 60_000));
    const result = await useCase.execute({ token: 'the-link-token', sessionToken });

    expect(result.consultationBlocks).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // docSelection.restContent (Ajuste 2)
  // -----------------------------------------------------------------------

  it('returns docSelection with restContent when link was shared with rest text', async () => {
    mockLinkRepo.findByToken.mockResolvedValue(
      SharedDocumentLink.create({
        id: 'link-1',
        consultationId: 'consult-1',
        doctorId: 'doctor-1',
        patientId: 'patient-1',
        token: 'the-link-token',
        sections: { report: false, prescriptions: false, ehr: false },
        docSelection: {
          types: ['rest'],
          informeBlockKeys: [],
          restContent: 'Reposo médico por 3 días',
        },
        status: 'active',
        failedAttempts: 0,
        lastCodeRequestedAt: null,
        createdAt: new Date(),
      }),
    );
    const sessionToken = signToken('link-1', 'the-link-token', new Date(Date.now() + 60_000));
    const result = await useCase.execute({ token: 'the-link-token', sessionToken });

    expect(result.docSelection).not.toBeNull();
    expect(result.docSelection?.types).toEqual(['rest']);
    expect(result.docSelection?.restContent).toBe('Reposo médico por 3 días');
  });

  it('returns docSelection with restContent as null when not provided', async () => {
    mockLinkRepo.findByToken.mockResolvedValue(
      SharedDocumentLink.create({
        id: 'link-1',
        consultationId: 'consult-1',
        doctorId: 'doctor-1',
        patientId: 'patient-1',
        token: 'the-link-token',
        sections: { report: true, prescriptions: false, ehr: false },
        docSelection: {
          types: ['informe'],
          informeBlockKeys: ['diagnosis'],
          restContent: null,
        },
        status: 'active',
        failedAttempts: 0,
        lastCodeRequestedAt: null,
        createdAt: new Date(),
      }),
    );
    const sessionToken = signToken('link-1', 'the-link-token', new Date(Date.now() + 60_000));
    const result = await useCase.execute({ token: 'the-link-token', sessionToken });

    expect(result.docSelection?.restContent).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Already-signed URL passthrough
  // -----------------------------------------------------------------------

  it('passes through absolute https:// URLs without calling storage.getSignedUrl', async () => {
    mockDoctorProfileRepo.findByDoctorId.mockResolvedValue({
      id: 'doctor-1',
      fullName: 'Dr. Juan García',
      professionalTitle: null,
      specialty: null,
      licenseNumber: null,
      logoUrl: 'https://cdn.example.com/logo.png',
      signatureUrl: 'https://cdn.example.com/sig.png',
    } as Awaited<ReturnType<typeof mockDoctorProfileRepo.findByDoctorId>>);

    const sessionToken = signToken('link-1', 'the-link-token', new Date(Date.now() + 60_000));
    const result = await useCase.execute({ token: 'the-link-token', sessionToken });

    expect(result.doctor.logoUrl).toBe('https://cdn.example.com/logo.png');
    expect(result.doctor.signatureUrl).toBe('https://cdn.example.com/sig.png');
    // Storage should only be called for the template paths (which are relative), not the profile
    expect(mockStorage.getSignedUrl).not.toHaveBeenCalledWith('https://cdn.example.com/logo.png');
  });
});
