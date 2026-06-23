import { Test, type TestingModule } from '@nestjs/testing';
import { HelpChatUseCase } from './help-chat.use-case';
import { AI_TEXT_GENERATOR_PORT } from '../../../ai-transcription/application/ports/ai-text-generator.port';
import type { IAiTextGenerator } from '../../../ai-transcription/application/ports/ai-text-generator.port';
import { GetDoctorFeaturesV2UseCase } from '../../../doctor-settings/application/use-cases/doctor-settings/get-doctor-features-v2.use-case';
import type { DoctorFeaturesV2Output } from '../../../doctor-settings/application/use-cases/doctor-settings/get-doctor-features-v2.use-case';
import { HelpChatProviderError } from '../../domain/errors/help-chat-provider.error';
import { SUPER_ADMIN_GUIDE } from '../../guides/super-admin-guide.content';
import { SPECIALIST_GUIDE } from '../../guides/specialist-guide.content';
import { PATIENT_GUIDE } from '../../guides/patient-guide.content';
import type { ChatMessage } from '../dtos/help-chat.dto';

const SAMPLE_MESSAGES: ChatMessage[] = [{ role: 'user', content: '¿Cómo funciona la agenda?' }];
const SAMPLE_DOCTOR_ID = 'doctor-uuid-1';

/** A delta_free feature map: only patients and consultations enabled. */
const DELTA_FREE_FEATURES: DoctorFeaturesV2Output = {
  plan_key: 'delta_free',
  effective_plan_key: 'delta_free',
  is_downgraded: false,
  features: {
    dashboard: true,
    agenda: false,
    patients: true,
    consultations: true,
    ehr: false,
    finances: false,
    billing: false,
    reports: false,
    crm: false,
    reminders: false,
    messages: false,
    invitations: false,
    settings: true,
    booking: false,
    ai_assistant: false,
    ai_transcription: false,
    ai_reports: false,
  },
};

/** A delta_plus feature map: all features enabled. */
const DELTA_PLUS_FEATURES: DoctorFeaturesV2Output = {
  plan_key: 'delta_plus',
  effective_plan_key: 'delta_plus',
  is_downgraded: false,
  features: {
    dashboard: true,
    agenda: true,
    patients: true,
    consultations: true,
    ehr: true,
    finances: true,
    billing: true,
    reports: true,
    crm: true,
    reminders: true,
    messages: true,
    invitations: true,
    settings: true,
    booking: true,
    ai_assistant: true,
    ai_transcription: true,
    ai_reports: true,
  },
};

describe('HelpChatUseCase', () => {
  let useCase: HelpChatUseCase;
  let mockAiGenerator: jest.Mocked<IAiTextGenerator>;
  let mockGetDoctorFeaturesV2: jest.Mocked<Pick<GetDoctorFeaturesV2UseCase, 'execute'>>;

  beforeEach(async () => {
    mockAiGenerator = {
      generate: jest.fn(),
    };

    mockGetDoctorFeaturesV2 = {
      execute: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HelpChatUseCase,
        {
          provide: AI_TEXT_GENERATOR_PORT,
          useValue: mockAiGenerator,
        },
        {
          provide: GetDoctorFeaturesV2UseCase,
          useValue: mockGetDoctorFeaturesV2,
        },
      ],
    }).compile();

    useCase = module.get<HelpChatUseCase>(HelpChatUseCase);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Guide selection by role
  // ---------------------------------------------------------------------------

  it('should select SUPER_ADMIN_GUIDE for role "super_admin"', async () => {
    mockAiGenerator.generate.mockResolvedValue('Respuesta del asistente.');

    await useCase.execute({ role: 'super_admin', userId: 'admin-1', messages: SAMPLE_MESSAGES });

    const calledPrompt = mockAiGenerator.generate.mock.calls[0]?.[0] ?? '';
    expect(calledPrompt).toContain(SUPER_ADMIN_GUIDE.trim().slice(0, 80));
  });

  it('should select SPECIALIST_GUIDE for role "doctor"', async () => {
    mockAiGenerator.generate.mockResolvedValue('Respuesta del asistente.');
    mockGetDoctorFeaturesV2.execute.mockResolvedValue(DELTA_FREE_FEATURES);

    await useCase.execute({ role: 'doctor', userId: SAMPLE_DOCTOR_ID, messages: SAMPLE_MESSAGES });

    const calledPrompt = mockAiGenerator.generate.mock.calls[0]?.[0] ?? '';
    expect(calledPrompt).toContain(SPECIALIST_GUIDE.trim().slice(0, 80));
  });

  it('should select PATIENT_GUIDE for role "patient"', async () => {
    mockAiGenerator.generate.mockResolvedValue('Respuesta del asistente.');

    await useCase.execute({ role: 'patient', userId: 'patient-1', messages: SAMPLE_MESSAGES });

    const calledPrompt = mockAiGenerator.generate.mock.calls[0]?.[0] ?? '';
    expect(calledPrompt).toContain(PATIENT_GUIDE.trim().slice(0, 80));
  });

  it('should fall back to SPECIALIST_GUIDE for an unknown role', async () => {
    mockAiGenerator.generate.mockResolvedValue('Respuesta del asistente.');
    mockGetDoctorFeaturesV2.execute.mockResolvedValue(DELTA_FREE_FEATURES);

    await useCase.execute({ role: 'assistant', userId: 'u-1', messages: SAMPLE_MESSAGES });

    const calledPrompt = mockAiGenerator.generate.mock.calls[0]?.[0] ?? '';
    expect(calledPrompt).toContain(SPECIALIST_GUIDE.trim().slice(0, 80));
  });

  it('should fall back to SPECIALIST_GUIDE for an empty role string', async () => {
    mockAiGenerator.generate.mockResolvedValue('Respuesta del asistente.');
    mockGetDoctorFeaturesV2.execute.mockResolvedValue(DELTA_FREE_FEATURES);

    await useCase.execute({ role: '', userId: 'u-1', messages: SAMPLE_MESSAGES });

    const calledPrompt = mockAiGenerator.generate.mock.calls[0]?.[0] ?? '';
    expect(calledPrompt).toContain(SPECIALIST_GUIDE.trim().slice(0, 80));
  });

  // ---------------------------------------------------------------------------
  // Plan-awareness — doctor with delta_free
  // ---------------------------------------------------------------------------

  it('should include "Delta Free" in the prompt when role is doctor with delta_free plan', async () => {
    mockAiGenerator.generate.mockResolvedValue('Respuesta.');
    mockGetDoctorFeaturesV2.execute.mockResolvedValue(DELTA_FREE_FEATURES);

    await useCase.execute({ role: 'doctor', userId: SAMPLE_DOCTOR_ID, messages: SAMPLE_MESSAGES });

    const calledPrompt = mockAiGenerator.generate.mock.calls[0]?.[0] ?? '';
    expect(calledPrompt).toContain('Delta Free');
  });

  it('should include CONTEXTO DEL USUARIO block when role is doctor', async () => {
    mockAiGenerator.generate.mockResolvedValue('Respuesta.');
    mockGetDoctorFeaturesV2.execute.mockResolvedValue(DELTA_FREE_FEATURES);

    await useCase.execute({ role: 'doctor', userId: SAMPLE_DOCTOR_ID, messages: SAMPLE_MESSAGES });

    const calledPrompt = mockAiGenerator.generate.mock.calls[0]?.[0] ?? '';
    expect(calledPrompt).toContain('===== CONTEXTO DEL USUARIO =====');
    expect(calledPrompt).toContain('===== FIN DEL CONTEXTO =====');
  });

  it('should list Pacientes in available modules for delta_free', async () => {
    mockAiGenerator.generate.mockResolvedValue('Respuesta.');
    mockGetDoctorFeaturesV2.execute.mockResolvedValue(DELTA_FREE_FEATURES);

    await useCase.execute({ role: 'doctor', userId: SAMPLE_DOCTOR_ID, messages: SAMPLE_MESSAGES });

    const calledPrompt = mockAiGenerator.generate.mock.calls[0]?.[0] ?? '';
    expect(calledPrompt).toContain('Pacientes');
  });

  it('should list Consultas in available modules for delta_free', async () => {
    mockAiGenerator.generate.mockResolvedValue('Respuesta.');
    mockGetDoctorFeaturesV2.execute.mockResolvedValue(DELTA_FREE_FEATURES);

    await useCase.execute({ role: 'doctor', userId: SAMPLE_DOCTOR_ID, messages: SAMPLE_MESSAGES });

    const calledPrompt = mockAiGenerator.generate.mock.calls[0]?.[0] ?? '';
    expect(calledPrompt).toContain('Consultas');
  });

  it('should always include Consultorios in available modules for doctor', async () => {
    mockAiGenerator.generate.mockResolvedValue('Respuesta.');
    mockGetDoctorFeaturesV2.execute.mockResolvedValue(DELTA_FREE_FEATURES);

    await useCase.execute({ role: 'doctor', userId: SAMPLE_DOCTOR_ID, messages: SAMPLE_MESSAGES });

    const calledPrompt = mockAiGenerator.generate.mock.calls[0]?.[0] ?? '';
    expect(calledPrompt).toContain('Consultorios');
  });

  it('should always include Plantillas in available modules for doctor', async () => {
    mockAiGenerator.generate.mockResolvedValue('Respuesta.');
    mockGetDoctorFeaturesV2.execute.mockResolvedValue(DELTA_FREE_FEATURES);

    await useCase.execute({ role: 'doctor', userId: SAMPLE_DOCTOR_ID, messages: SAMPLE_MESSAGES });

    const calledPrompt = mockAiGenerator.generate.mock.calls[0]?.[0] ?? '';
    expect(calledPrompt).toContain('Plantillas');
  });

  it('should list Agenda in unavailable modules for delta_free', async () => {
    mockAiGenerator.generate.mockResolvedValue('Respuesta.');
    mockGetDoctorFeaturesV2.execute.mockResolvedValue(DELTA_FREE_FEATURES);

    await useCase.execute({ role: 'doctor', userId: SAMPLE_DOCTOR_ID, messages: SAMPLE_MESSAGES });

    const calledPrompt = mockAiGenerator.generate.mock.calls[0]?.[0] ?? '';
    // Agenda disabled → appears in "NO disponibles"
    expect(calledPrompt).toContain('Módulos NO disponibles');
    expect(calledPrompt).toContain('Agenda');
  });

  it('should list Finanzas in unavailable modules for delta_free', async () => {
    mockAiGenerator.generate.mockResolvedValue('Respuesta.');
    mockGetDoctorFeaturesV2.execute.mockResolvedValue(DELTA_FREE_FEATURES);

    await useCase.execute({ role: 'doctor', userId: SAMPLE_DOCTOR_ID, messages: SAMPLE_MESSAGES });

    const calledPrompt = mockAiGenerator.generate.mock.calls[0]?.[0] ?? '';
    expect(calledPrompt).toContain('Finanzas');
  });

  it('should call getDoctorFeaturesV2.execute with the correct doctorId', async () => {
    mockAiGenerator.generate.mockResolvedValue('Respuesta.');
    mockGetDoctorFeaturesV2.execute.mockResolvedValue(DELTA_FREE_FEATURES);

    await useCase.execute({ role: 'doctor', userId: SAMPLE_DOCTOR_ID, messages: SAMPLE_MESSAGES });

    expect(mockGetDoctorFeaturesV2.execute).toHaveBeenCalledWith(SAMPLE_DOCTOR_ID);
  });

  it('should include delta_plus label for doctor with delta_plus plan', async () => {
    mockAiGenerator.generate.mockResolvedValue('Respuesta.');
    mockGetDoctorFeaturesV2.execute.mockResolvedValue(DELTA_PLUS_FEATURES);

    await useCase.execute({ role: 'doctor', userId: SAMPLE_DOCTOR_ID, messages: SAMPLE_MESSAGES });

    const calledPrompt = mockAiGenerator.generate.mock.calls[0]?.[0] ?? '';
    expect(calledPrompt).toContain('Delta Plus');
  });

  // ---------------------------------------------------------------------------
  // Plan-awareness — roles that do NOT call getDoctorFeaturesV2
  // ---------------------------------------------------------------------------

  it('should NOT call getDoctorFeaturesV2 when role is super_admin', async () => {
    mockAiGenerator.generate.mockResolvedValue('Respuesta.');

    await useCase.execute({ role: 'super_admin', userId: 'admin-1', messages: SAMPLE_MESSAGES });

    expect(mockGetDoctorFeaturesV2.execute).not.toHaveBeenCalled();
  });

  it('should NOT call getDoctorFeaturesV2 when role is patient', async () => {
    mockAiGenerator.generate.mockResolvedValue('Respuesta.');

    await useCase.execute({ role: 'patient', userId: 'patient-1', messages: SAMPLE_MESSAGES });

    expect(mockGetDoctorFeaturesV2.execute).not.toHaveBeenCalled();
  });

  it('should NOT include CONTEXTO DEL USUARIO block for super_admin', async () => {
    mockAiGenerator.generate.mockResolvedValue('Respuesta.');

    await useCase.execute({ role: 'super_admin', userId: 'admin-1', messages: SAMPLE_MESSAGES });

    const calledPrompt = mockAiGenerator.generate.mock.calls[0]?.[0] ?? '';
    expect(calledPrompt).not.toContain('===== CONTEXTO DEL USUARIO =====');
  });

  it('should NOT include CONTEXTO DEL USUARIO block for patient', async () => {
    mockAiGenerator.generate.mockResolvedValue('Respuesta.');

    await useCase.execute({ role: 'patient', userId: 'patient-1', messages: SAMPLE_MESSAGES });

    const calledPrompt = mockAiGenerator.generate.mock.calls[0]?.[0] ?? '';
    expect(calledPrompt).not.toContain('===== CONTEXTO DEL USUARIO =====');
  });

  // ---------------------------------------------------------------------------
  // Plan-awareness — getDoctorFeaturesV2 failure (fallback, chat must continue)
  // ---------------------------------------------------------------------------

  it('should continue without plan context when getDoctorFeaturesV2 throws', async () => {
    mockAiGenerator.generate.mockResolvedValue('Respuesta de fallback.');
    mockGetDoctorFeaturesV2.execute.mockRejectedValue(new Error('DB connection timeout'));

    const result = await useCase.execute({
      role: 'doctor',
      userId: SAMPLE_DOCTOR_ID,
      messages: SAMPLE_MESSAGES,
    });

    // Chat still works
    expect(result.reply).toBe('Respuesta de fallback.');
    // No context block in the prompt
    const calledPrompt = mockAiGenerator.generate.mock.calls[0]?.[0] ?? '';
    expect(calledPrompt).not.toContain('===== CONTEXTO DEL USUARIO =====');
  });

  it('should still call aiTextGenerator.generate when getDoctorFeaturesV2 throws', async () => {
    mockAiGenerator.generate.mockResolvedValue('Respuesta.');
    mockGetDoctorFeaturesV2.execute.mockRejectedValue(new Error('Timeout'));

    await useCase.execute({ role: 'doctor', userId: SAMPLE_DOCTOR_ID, messages: SAMPLE_MESSAGES });

    expect(mockAiGenerator.generate).toHaveBeenCalledTimes(1);
  });

  it('should NOT throw HelpChatProviderError when only getDoctorFeaturesV2 fails', async () => {
    mockAiGenerator.generate.mockResolvedValue('Respuesta.');
    mockGetDoctorFeaturesV2.execute.mockRejectedValue(new Error('Timeout'));

    await expect(
      useCase.execute({ role: 'doctor', userId: SAMPLE_DOCTOR_ID, messages: SAMPLE_MESSAGES }),
    ).resolves.toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // Prompt content
  // ---------------------------------------------------------------------------

  it('should call generate with a prompt that contains the conversation message', async () => {
    mockAiGenerator.generate.mockResolvedValue('Aquí va la respuesta.');
    mockGetDoctorFeaturesV2.execute.mockResolvedValue(DELTA_FREE_FEATURES);

    await useCase.execute({
      role: 'doctor',
      userId: SAMPLE_DOCTOR_ID,
      messages: [{ role: 'user', content: '¿Dónde está la agenda?' }],
    });

    const calledPrompt = mockAiGenerator.generate.mock.calls[0]?.[0] ?? '';
    expect(calledPrompt).toContain('¿Dónde está la agenda?');
  });

  it('should call generate exactly once per execute call', async () => {
    mockAiGenerator.generate.mockResolvedValue('Respuesta.');
    mockGetDoctorFeaturesV2.execute.mockResolvedValue(DELTA_FREE_FEATURES);

    await useCase.execute({ role: 'doctor', userId: SAMPLE_DOCTOR_ID, messages: SAMPLE_MESSAGES });

    expect(mockAiGenerator.generate).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // Output
  // ---------------------------------------------------------------------------

  it('should return the trimmed reply from the AI provider', async () => {
    mockAiGenerator.generate.mockResolvedValue('  La agenda está en el menú.  ');
    mockGetDoctorFeaturesV2.execute.mockResolvedValue(DELTA_FREE_FEATURES);

    const result = await useCase.execute({
      role: 'doctor',
      userId: SAMPLE_DOCTOR_ID,
      messages: SAMPLE_MESSAGES,
    });

    expect(result.reply).toBe('La agenda está en el menú.');
  });

  it('should return an empty string reply when provider returns empty', async () => {
    mockAiGenerator.generate.mockResolvedValue('   ');
    mockGetDoctorFeaturesV2.execute.mockResolvedValue(DELTA_FREE_FEATURES);

    const result = await useCase.execute({
      role: 'doctor',
      userId: SAMPLE_DOCTOR_ID,
      messages: SAMPLE_MESSAGES,
    });

    expect(result.reply).toBe('');
  });

  // ---------------------------------------------------------------------------
  // Error handling — AI provider failure
  // ---------------------------------------------------------------------------

  it('should throw HelpChatProviderError when AI provider rejects with an Error', async () => {
    const providerErr = new Error('fetch_timeout');
    mockAiGenerator.generate.mockRejectedValue(providerErr);
    mockGetDoctorFeaturesV2.execute.mockResolvedValue(DELTA_FREE_FEATURES);

    await expect(
      useCase.execute({ role: 'doctor', userId: SAMPLE_DOCTOR_ID, messages: SAMPLE_MESSAGES }),
    ).rejects.toBeInstanceOf(HelpChatProviderError);
  });

  it('should throw HelpChatProviderError when AI provider rejects with a non-Error value', async () => {
    mockAiGenerator.generate.mockRejectedValue('string_error');
    mockGetDoctorFeaturesV2.execute.mockResolvedValue(DELTA_FREE_FEATURES);

    await expect(
      useCase.execute({ role: 'doctor', userId: SAMPLE_DOCTOR_ID, messages: SAMPLE_MESSAGES }),
    ).rejects.toBeInstanceOf(HelpChatProviderError);
  });

  it('should preserve internalDetail from the provider error', async () => {
    const providerErr = new Error('rate_limited_on_both_models');
    mockAiGenerator.generate.mockRejectedValue(providerErr);
    mockGetDoctorFeaturesV2.execute.mockResolvedValue(DELTA_FREE_FEATURES);

    let caught: HelpChatProviderError | null = null;
    try {
      await useCase.execute({
        role: 'doctor',
        userId: SAMPLE_DOCTOR_ID,
        messages: SAMPLE_MESSAGES,
      });
    } catch (err) {
      if (err instanceof HelpChatProviderError) {
        caught = err;
      }
    }

    expect(caught).not.toBeNull();
    expect(caught?.internalDetail).toBe('rate_limited_on_both_models');
  });

  it('should have a generic public message in HelpChatProviderError (no internal detail)', async () => {
    mockAiGenerator.generate.mockRejectedValue(new Error('missing_api_key'));
    mockGetDoctorFeaturesV2.execute.mockResolvedValue(DELTA_FREE_FEATURES);

    let caught: HelpChatProviderError | null = null;
    try {
      await useCase.execute({
        role: 'doctor',
        userId: SAMPLE_DOCTOR_ID,
        messages: SAMPLE_MESSAGES,
      });
    } catch (err) {
      if (err instanceof HelpChatProviderError) {
        caught = err;
      }
    }

    expect(caught?.message).not.toContain('missing_api_key');
    expect(caught?.message).toBeTruthy();
  });
});
