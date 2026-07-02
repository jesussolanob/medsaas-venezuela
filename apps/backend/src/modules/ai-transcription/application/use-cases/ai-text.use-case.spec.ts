import { AiTextUseCase, buildBlockPrompt, stripHtml } from './ai-text.use-case';
import type { IAiTextGenerator } from '../ports/ai-text-generator.port';
import type { IAiRequestLogRepository } from '../../domain/repositories/ai-request-log.repository';
import type { IPlanFeaturesRepository } from '../../../doctor-settings/domain/repositories/plan-features.repository';
import type { IDoctorProfileRepository } from '../../../doctor-settings/domain/repositories/doctor-profile.repository';
import type { IPlanConfigRepository } from '../../../doctor-settings/domain/repositories/plan-config.repository';
import type { IPatientRepository } from '../../../patients/domain/repositories/patient.repository';
import type { IConsultationRepository } from '../../../consultations/domain/repositories/consultation.repository';
import { AiFeatureDeniedError } from '../../domain/errors/ai-feature-denied.error';
import { AiTextProviderError } from '../../domain/errors/ai-text-provider.error';
import { PatientNotFoundForAiError } from '../../domain/errors/patient-not-found-for-ai.error';
import { DoctorProfile } from '../../../doctor-settings/domain/entities/doctor-profile.entity';
import { Patient } from '../../../patients/domain/entities/patient.entity';
import { Consultation } from '../../../consultations/domain/entities/consultation.entity';
import type { AiTextInputDto } from '../dtos/ai-text.dto';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const DOCTOR_ID = 'doc-uuid-0001';
const PATIENT_ID = 'pat-uuid-0001';

function makeProfile(plan: string, subscriptionStatus: string): DoctorProfile {
  return DoctorProfile.create({
    id: DOCTOR_ID,
    fullName: 'Dr. Test',
    email: 'dr@test.com',
    specialty: null,
    professionalTitle: null,
    clinicId: null,
    clinicRole: null,
    paymentMethods: [],
    paymentDetails: {},
    allowsOnline: false,
    officeAddress: null,
    city: null,
    avatarUrl: null,
    plan,
    subscriptionStatus,
    logoUrl: null,
    signatureUrl: null,
    licenseNumber: null,
    phone: null,
    currencyMode: 'usd_bcv',
    customRate: null,
    customRateLabel: null,
    cedula: null,
    birthDate: null,
    onboardingCompleted: true,
  });
}

function makePatient(): Patient {
  return Patient.create({
    id: PATIENT_ID,
    doctorId: DOCTOR_ID,
    fullName: 'Juan Pérez',
    age: 35,
    sex: 'male',
    bloodType: 'O+',
    allergies: null,
    chronicConditions: null,
    source: 'manual',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
  });
}

function makeConsultation(
  overrides: Partial<{
    chiefComplaint: string | null;
    diagnosis: string | null;
    treatment: string | null;
    notes: string | null;
  }> = {},
): Consultation {
  return Consultation.create({
    id: 'consult-uuid-001',
    doctorId: DOCTOR_ID,
    patientId: PATIENT_ID,
    consultationCode: 'DLT-202501-001',
    consultationDate: new Date('2025-01-15'),
    paymentStatus: 'pending',
    chiefComplaint: overrides.chiefComplaint ?? 'Dolor de cabeza',
    diagnosis: overrides.diagnosis ?? 'Cefalea tensional',
    treatment: overrides.treatment ?? 'Ibuprofeno 400mg',
    notes: overrides.notes ?? null,
    createdAt: new Date('2025-01-15'),
    updatedAt: new Date('2025-01-15'),
  });
}

const PLUS_FEATURES_ASSISTANT = [
  { featureKey: 'ai_assistant', featureLabel: 'Asistente IA', enabled: true },
  { featureKey: 'ai_reports', featureLabel: 'Reportes IA', enabled: true },
];

const PLUS_FEATURES_REPORTS_ONLY = [
  { featureKey: 'ai_assistant', featureLabel: 'Asistente IA', enabled: false },
  { featureKey: 'ai_reports', featureLabel: 'Reportes IA', enabled: true },
];

const FREE_FEATURES = [
  { featureKey: 'ai_assistant', featureLabel: 'Asistente IA', enabled: false },
  { featureKey: 'ai_reports', featureLabel: 'Reportes IA', enabled: false },
];

const PLUS_CONFIG = {
  planKey: 'delta_plus',
  roleKey: 'doctor',
  isPermanent: false,
  isActive: true,
};

const FREE_CONFIG = {
  planKey: 'delta_free',
  roleKey: 'doctor',
  isPermanent: true,
  isActive: true,
};

const baseImproveBlockInput: AiTextInputDto = {
  actionInput: {
    action: 'improve_block',
    content: 'El paciente refiere dolor.',
    block_key: 'chief_complaint',
    block_label: 'Motivo de consulta',
  },
  doctorId: DOCTOR_ID,
  isSuperAdmin: false,
};

const baseSummarizeInput: AiTextInputDto = {
  actionInput: {
    action: 'summarize_report',
    legacy: {
      chief_complaint: 'Dolor de cabeza',
      diagnosis: 'Cefalea tensional',
      treatment: null,
      notes: null,
    },
    blocks_data: { prescription: 'Ibuprofeno 400mg' },
    blocks_meta: [{ key: 'prescription', label: 'Prescripción', printable: true }],
  },
  doctorId: DOCTOR_ID,
  isSuperAdmin: false,
};

const basePatientHistoryInput: AiTextInputDto = {
  actionInput: {
    action: 'patient_history',
    patientId: PATIENT_ID,
  },
  doctorId: DOCTOR_ID,
  isSuperAdmin: false,
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('AiTextUseCase', () => {
  let useCase: AiTextUseCase;
  let mockTextGenerator: jest.Mocked<IAiTextGenerator>;
  let mockLogRepo: jest.Mocked<IAiRequestLogRepository>;
  let mockFeaturesRepo: jest.Mocked<IPlanFeaturesRepository>;
  let mockProfileRepo: jest.Mocked<IDoctorProfileRepository>;
  let mockPlanConfigRepo: jest.Mocked<IPlanConfigRepository>;
  let mockPatientRepo: jest.Mocked<IPatientRepository>;
  let mockConsultationRepo: jest.Mocked<IConsultationRepository>;

  beforeEach(() => {
    mockTextGenerator = { generate: jest.fn().mockResolvedValue('Resultado mejorado.') };
    mockLogRepo = { save: jest.fn().mockResolvedValue(undefined) };
    mockFeaturesRepo = { findByPlan: jest.fn() };
    mockProfileRepo = {
      findByDoctorId: jest.fn(),
      update: jest.fn(),
      updateExchangeRate: jest.fn(),
    };
    mockPlanConfigRepo = { findByKey: jest.fn(), findPermanentPlanForRole: jest.fn() };
    mockPatientRepo = {
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
    mockConsultationRepo = {
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

    useCase = new AiTextUseCase(
      mockTextGenerator,
      mockLogRepo,
      mockFeaturesRepo,
      mockProfileRepo,
      mockPlanConfigRepo,
      mockPatientRepo,
      mockConsultationRepo,
    );
  });

  // =========================================================================
  // improve_block
  // =========================================================================

  describe('improve_block', () => {
    beforeEach(() => {
      mockProfileRepo.findByDoctorId.mockResolvedValue(makeProfile('delta_plus', 'active'));
      mockPlanConfigRepo.findByKey.mockResolvedValue(PLUS_CONFIG);
      mockFeaturesRepo.findByPlan.mockResolvedValue(PLUS_FEATURES_ASSISTANT);
    });

    it('returns improved text when ai_assistant feature is enabled', async () => {
      mockTextGenerator.generate.mockResolvedValue('Texto mejorado.');

      const result = await useCase.execute(baseImproveBlockInput);

      expect(result.result).toBe('Texto mejorado.');
    });

    it('calls text generator with a prompt containing the block label', async () => {
      await useCase.execute(baseImproveBlockInput);

      const [prompt] = mockTextGenerator.generate.mock.calls[0]!;
      expect(prompt).toContain('Motivo de consulta');
    });

    it('strips HTML tags from content before sending to AI', async () => {
      const inputWithHtml: AiTextInputDto = {
        ...baseImproveBlockInput,
        actionInput: {
          action: 'improve_block',
          content: '<p>El paciente refiere <strong>dolor</strong>.</p>',
          block_key: 'chief_complaint',
          block_label: 'Motivo de consulta',
        },
      };

      await useCase.execute(inputWithHtml);

      const [prompt] = mockTextGenerator.generate.mock.calls[0]!;
      expect(prompt).not.toContain('<p>');
      expect(prompt).not.toContain('<strong>');
      expect(prompt).toContain('El paciente refiere dolor.');
    });

    it('uses specific instruction for chief_complaint block key', async () => {
      await useCase.execute(baseImproveBlockInput);

      const [prompt] = mockTextGenerator.generate.mock.calls[0]!;
      expect(prompt).toContain('motivo de consulta');
    });

    it('uses default instruction for unknown block key', async () => {
      const unknownBlockInput: AiTextInputDto = {
        ...baseImproveBlockInput,
        actionInput: {
          action: 'improve_block',
          content: 'Contenido',
          block_key: 'unknown_block_xyz',
          block_label: 'Bloque Desconocido',
        },
      };

      await useCase.execute(unknownBlockInput);

      const [prompt] = mockTextGenerator.generate.mock.calls[0]!;
      expect(prompt).toContain('Bloque Desconocido');
    });

    it('checks ai_assistant feature (not ai_reports) for improve_block', async () => {
      await useCase.execute(baseImproveBlockInput);

      expect(mockFeaturesRepo.findByPlan).toHaveBeenCalledTimes(1);
      // Should pass with ai_assistant enabled
      expect(mockTextGenerator.generate).toHaveBeenCalledTimes(1);
    });

    it('throws AiFeatureDeniedError when ai_assistant is disabled', async () => {
      mockFeaturesRepo.findByPlan.mockResolvedValue(FREE_FEATURES);
      mockPlanConfigRepo.findByKey.mockResolvedValue(FREE_CONFIG);

      await expect(useCase.execute(baseImproveBlockInput)).rejects.toBeInstanceOf(
        AiFeatureDeniedError,
      );
    });

    it('writes audit log with feature=text_improve_block on success', async () => {
      await useCase.execute(baseImproveBlockInput);

      expect(mockLogRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          doctorId: DOCTOR_ID,
          feature: 'text_improve_block',
          status: 'success',
        }),
      );
    });

    it('writes error audit log when AI generator fails', async () => {
      mockTextGenerator.generate.mockRejectedValue(new AiTextProviderError('HTTP_503'));

      await expect(useCase.execute(baseImproveBlockInput)).rejects.toBeInstanceOf(
        AiTextProviderError,
      );

      expect(mockLogRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }));
    });
  });

  // =========================================================================
  // summarize_report
  // =========================================================================

  describe('summarize_report', () => {
    beforeEach(() => {
      mockProfileRepo.findByDoctorId.mockResolvedValue(makeProfile('delta_plus', 'active'));
      mockPlanConfigRepo.findByKey.mockResolvedValue(PLUS_CONFIG);
      mockFeaturesRepo.findByPlan.mockResolvedValue(PLUS_FEATURES_ASSISTANT);
    });

    it('returns summarized text when ai_reports feature is enabled', async () => {
      mockTextGenerator.generate.mockResolvedValue('Resumen del informe.');

      const result = await useCase.execute(baseSummarizeInput);

      expect(result.result).toBe('Resumen del informe.');
    });

    it('builds prompt containing legacy field content', async () => {
      await useCase.execute(baseSummarizeInput);

      const [prompt] = mockTextGenerator.generate.mock.calls[0]!;
      expect(prompt).toContain('Dolor de cabeza');
      expect(prompt).toContain('Cefalea tensional');
    });

    it('includes block label and stripped content in prompt', async () => {
      const inputWithHtmlBlock: AiTextInputDto = {
        ...baseSummarizeInput,
        actionInput: {
          action: 'summarize_report',
          legacy: {},
          blocks_data: { prescription: '<p>Ibuprofeno <strong>400mg</strong></p>' },
          blocks_meta: [{ key: 'prescription', label: 'Prescripción', printable: true }],
        },
      };

      await useCase.execute(inputWithHtmlBlock);

      const [prompt] = mockTextGenerator.generate.mock.calls[0]!;
      expect(prompt).toContain('Prescripción');
      expect(prompt).toContain('Ibuprofeno 400mg');
      expect(prompt).not.toContain('<p>');
    });

    it('skips blocks with empty content', async () => {
      const inputWithEmptyBlock: AiTextInputDto = {
        ...baseSummarizeInput,
        actionInput: {
          action: 'summarize_report',
          legacy: { chief_complaint: 'Fiebre' },
          blocks_data: { prescription: '', notes: null },
          blocks_meta: [
            { key: 'prescription', label: 'Prescripción' },
            { key: 'notes', label: 'Notas' },
          ],
        },
      };

      await useCase.execute(inputWithEmptyBlock);

      const [prompt] = mockTextGenerator.generate.mock.calls[0]!;
      expect(prompt).not.toContain('Prescripción');
      expect(prompt).not.toContain('Notas');
    });

    it('joins array block values with newlines', async () => {
      const inputWithArray: AiTextInputDto = {
        ...baseSummarizeInput,
        actionInput: {
          action: 'summarize_report',
          legacy: {},
          blocks_data: { tasks: ['Reposo', 'Hidratación'] },
          blocks_meta: [{ key: 'tasks', label: 'Tareas' }],
        },
      };

      await useCase.execute(inputWithArray);

      const [prompt] = mockTextGenerator.generate.mock.calls[0]!;
      expect(prompt).toContain('Reposo');
      expect(prompt).toContain('Hidratación');
    });

    it('checks ai_reports feature for summarize_report', async () => {
      // Only ai_reports enabled, ai_assistant disabled
      mockFeaturesRepo.findByPlan.mockResolvedValue(PLUS_FEATURES_REPORTS_ONLY);

      const result = await useCase.execute(baseSummarizeInput);

      expect(result.result).toBeTruthy();
    });

    it('throws AiFeatureDeniedError when ai_reports is disabled', async () => {
      mockFeaturesRepo.findByPlan.mockResolvedValue(FREE_FEATURES);
      mockPlanConfigRepo.findByKey.mockResolvedValue(FREE_CONFIG);

      await expect(useCase.execute(baseSummarizeInput)).rejects.toBeInstanceOf(
        AiFeatureDeniedError,
      );
    });

    it('writes audit log with feature=text_summarize_report', async () => {
      await useCase.execute(baseSummarizeInput);

      expect(mockLogRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ feature: 'text_summarize_report' }),
      );
    });
  });

  // =========================================================================
  // patient_history
  // =========================================================================

  describe('patient_history', () => {
    beforeEach(() => {
      mockProfileRepo.findByDoctorId.mockResolvedValue(makeProfile('delta_plus', 'active'));
      mockPlanConfigRepo.findByKey.mockResolvedValue(PLUS_CONFIG);
      mockFeaturesRepo.findByPlan.mockResolvedValue(PLUS_FEATURES_ASSISTANT);
      mockPatientRepo.findById.mockResolvedValue(makePatient());
      mockConsultationRepo.findByPatient.mockResolvedValue({
        items: [makeConsultation()],
        total: 1,
        page: 1,
        limit: 20,
      });
    });

    it('returns patient history summary on valid patient', async () => {
      mockTextGenerator.generate.mockResolvedValue('Resumen del historial.');

      const result = await useCase.execute(basePatientHistoryInput);

      expect(result.result).toBe('Resumen del historial.');
    });

    it('scopes patient lookup to authenticated doctorId (anti-IDOR)', async () => {
      await useCase.execute(basePatientHistoryInput);

      expect(mockPatientRepo.findById).toHaveBeenCalledWith(PATIENT_ID, DOCTOR_ID);
    });

    it('scopes consultation lookup to authenticated doctorId (anti-IDOR)', async () => {
      await useCase.execute(basePatientHistoryInput);

      expect(mockConsultationRepo.findByPatient).toHaveBeenCalledWith(PATIENT_ID, DOCTOR_ID, 1, 20);
    });

    it('throws PatientNotFoundForAiError when patient does not belong to doctor', async () => {
      mockPatientRepo.findById.mockResolvedValue(null);

      await expect(useCase.execute(basePatientHistoryInput)).rejects.toBeInstanceOf(
        PatientNotFoundForAiError,
      );
    });

    it('builds prompt containing number of consultations', async () => {
      await useCase.execute(basePatientHistoryInput);

      const [prompt] = mockTextGenerator.generate.mock.calls[0]!;
      expect(prompt).toContain('1 consultas');
    });

    it('includes consultation date and diagnosis in prompt', async () => {
      await useCase.execute(basePatientHistoryInput);

      const [prompt] = mockTextGenerator.generate.mock.calls[0]!;
      expect(prompt).toContain('2025-01-15');
      expect(prompt).toContain('Cefalea tensional');
    });

    it('handles empty consultation history gracefully', async () => {
      mockConsultationRepo.findByPatient.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 20,
      });

      const result = await useCase.execute(basePatientHistoryInput);

      expect(result.result).toBeTruthy();
      const [prompt] = mockTextGenerator.generate.mock.calls[0]!;
      expect(prompt).toContain('0 consultas');
    });

    it('checks ai_assistant feature for patient_history', async () => {
      await useCase.execute(basePatientHistoryInput);

      expect(mockFeaturesRepo.findByPlan).toHaveBeenCalledTimes(1);
    });

    it('throws AiFeatureDeniedError when ai_assistant is disabled for patient_history', async () => {
      mockFeaturesRepo.findByPlan.mockResolvedValue(FREE_FEATURES);
      mockPlanConfigRepo.findByKey.mockResolvedValue(FREE_CONFIG);

      await expect(useCase.execute(basePatientHistoryInput)).rejects.toBeInstanceOf(
        AiFeatureDeniedError,
      );
    });

    it('writes audit log with feature=text_patient_history', async () => {
      await useCase.execute(basePatientHistoryInput);

      expect(mockLogRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ feature: 'text_patient_history' }),
      );
    });
  });

  // =========================================================================
  // super_admin bypass
  // =========================================================================

  describe('super_admin bypass', () => {
    it('allows super_admin without checking plan for improve_block', async () => {
      const result = await useCase.execute({
        ...baseImproveBlockInput,
        isSuperAdmin: true,
      });

      expect(result.result).toBeTruthy();
      expect(mockProfileRepo.findByDoctorId).not.toHaveBeenCalled();
      expect(mockFeaturesRepo.findByPlan).not.toHaveBeenCalled();
    });

    it('allows super_admin without checking plan for summarize_report', async () => {
      const result = await useCase.execute({
        ...baseSummarizeInput,
        isSuperAdmin: true,
      });

      expect(result.result).toBeTruthy();
      expect(mockFeaturesRepo.findByPlan).not.toHaveBeenCalled();
    });

    it('allows super_admin without checking plan for patient_history', async () => {
      mockPatientRepo.findById.mockResolvedValue(makePatient());
      mockConsultationRepo.findByPatient.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 20,
      });

      const result = await useCase.execute({
        ...basePatientHistoryInput,
        isSuperAdmin: true,
      });

      expect(result.result).toBeTruthy();
      expect(mockFeaturesRepo.findByPlan).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Plan gate — lazy downgrade
  // =========================================================================

  describe('lazy downgrade', () => {
    it('downgrades expired subscription and denies when free plan lacks ai_assistant', async () => {
      mockProfileRepo.findByDoctorId.mockResolvedValue(makeProfile('delta_plus', 'past_due'));
      mockPlanConfigRepo.findByKey.mockResolvedValue(PLUS_CONFIG);
      mockPlanConfigRepo.findPermanentPlanForRole.mockResolvedValue(FREE_CONFIG);
      mockFeaturesRepo.findByPlan.mockResolvedValue(FREE_FEATURES);

      await expect(useCase.execute(baseImproveBlockInput)).rejects.toBeInstanceOf(
        AiFeatureDeniedError,
      );
      expect(mockFeaturesRepo.findByPlan).toHaveBeenCalledWith('delta_free');
    });

    it('denies when doctor profile is not found', async () => {
      mockProfileRepo.findByDoctorId.mockResolvedValue(null);

      const err = await useCase.execute(baseImproveBlockInput).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(AiFeatureDeniedError);
      expect((err as AiFeatureDeniedError).code).toBe('AI_FEATURE_DENIED');
      expect((err as AiFeatureDeniedError).httpStatus).toBe(403);
    });

    it('denies with plan_check_failed when profile repo throws (fail-closed)', async () => {
      mockProfileRepo.findByDoctorId.mockRejectedValue(new Error('DB connection lost'));

      const err = await useCase.execute(baseImproveBlockInput).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(AiFeatureDeniedError);
    });
  });

  // =========================================================================
  // Audit log resilience
  // =========================================================================

  describe('audit log resilience', () => {
    beforeEach(() => {
      mockProfileRepo.findByDoctorId.mockResolvedValue(makeProfile('delta_plus', 'active'));
      mockPlanConfigRepo.findByKey.mockResolvedValue(PLUS_CONFIG);
      mockFeaturesRepo.findByPlan.mockResolvedValue(PLUS_FEATURES_ASSISTANT);
    });

    it('does not throw when audit log save fails', async () => {
      mockLogRepo.save.mockRejectedValue(new Error('DB insert failed'));

      await expect(useCase.execute(baseImproveBlockInput)).resolves.toMatchObject({
        result: 'Resultado mejorado.',
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Unit tests for pure helpers
// ---------------------------------------------------------------------------

describe('stripHtml', () => {
  it('removes HTML tags', () => {
    expect(stripHtml('<p>Hello <strong>world</strong></p>')).toBe('Hello world');
  });

  it('replaces &nbsp; with space', () => {
    expect(stripHtml('a&nbsp;b')).toBe('a b');
  });

  it('returns plain text unchanged', () => {
    expect(stripHtml('plain text')).toBe('plain text');
  });

  it('trims surrounding whitespace', () => {
    expect(stripHtml('  text  ')).toBe('text');
  });
});

describe('buildBlockPrompt', () => {
  it('includes block label in the prompt', () => {
    const prompt = buildBlockPrompt('chief_complaint', 'Motivo de consulta', 'Dolor');
    expect(prompt).toContain('Motivo de consulta');
  });

  it('includes stripped content in the prompt', () => {
    const prompt = buildBlockPrompt('chief_complaint', 'Motivo', '<b>Dolor</b>');
    expect(prompt).toContain('Dolor');
    expect(prompt).not.toContain('<b>');
  });

  it('uses known instruction for diagnosis block', () => {
    const prompt = buildBlockPrompt('diagnosis', 'Diagnóstico', 'Hipertensión');
    expect(prompt).toContain('CIE-10');
  });

  it('uses known instruction for prescription block', () => {
    const prompt = buildBlockPrompt('prescription', 'Receta', 'Amoxicilina 500mg');
    expect(prompt).toContain('nombre genérico');
  });

  it('uses default instruction for unknown block key', () => {
    const prompt = buildBlockPrompt('custom_block', 'Mi bloque', 'contenido');
    expect(prompt).toContain('Mi bloque');
  });

  it('returns prompt in Spanish', () => {
    const prompt = buildBlockPrompt('chief_complaint', 'Motivo', 'contenido');
    expect(prompt).toContain('español (Venezuela)');
  });
});
