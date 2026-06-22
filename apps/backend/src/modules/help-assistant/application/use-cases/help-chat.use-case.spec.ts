import { Test, type TestingModule } from '@nestjs/testing';
import { HelpChatUseCase } from './help-chat.use-case';
import { AI_TEXT_GENERATOR_PORT } from '../../../ai-transcription/application/ports/ai-text-generator.port';
import type { IAiTextGenerator } from '../../../ai-transcription/application/ports/ai-text-generator.port';
import { HelpChatProviderError } from '../../domain/errors/help-chat-provider.error';
import { SUPER_ADMIN_GUIDE } from '../../guides/super-admin-guide.content';
import { SPECIALIST_GUIDE } from '../../guides/specialist-guide.content';
import { PATIENT_GUIDE } from '../../guides/patient-guide.content';
import type { ChatMessage } from '../dtos/help-chat.dto';

const SAMPLE_MESSAGES: ChatMessage[] = [{ role: 'user', content: '¿Cómo funciona la agenda?' }];

describe('HelpChatUseCase', () => {
  let useCase: HelpChatUseCase;
  let mockAiGenerator: jest.Mocked<IAiTextGenerator>;

  beforeEach(async () => {
    mockAiGenerator = {
      generate: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HelpChatUseCase,
        {
          provide: AI_TEXT_GENERATOR_PORT,
          useValue: mockAiGenerator,
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

    await useCase.execute({ role: 'super_admin', messages: SAMPLE_MESSAGES });

    const calledPrompt = mockAiGenerator.generate.mock.calls[0]?.[0] ?? '';
    // The super admin guide contains a distinctive string
    expect(calledPrompt).toContain(SUPER_ADMIN_GUIDE.trim().slice(0, 80));
  });

  it('should select SPECIALIST_GUIDE for role "doctor"', async () => {
    mockAiGenerator.generate.mockResolvedValue('Respuesta del asistente.');

    await useCase.execute({ role: 'doctor', messages: SAMPLE_MESSAGES });

    const calledPrompt = mockAiGenerator.generate.mock.calls[0]?.[0] ?? '';
    expect(calledPrompt).toContain(SPECIALIST_GUIDE.trim().slice(0, 80));
  });

  it('should select PATIENT_GUIDE for role "patient"', async () => {
    mockAiGenerator.generate.mockResolvedValue('Respuesta del asistente.');

    await useCase.execute({ role: 'patient', messages: SAMPLE_MESSAGES });

    const calledPrompt = mockAiGenerator.generate.mock.calls[0]?.[0] ?? '';
    expect(calledPrompt).toContain(PATIENT_GUIDE.trim().slice(0, 80));
  });

  it('should fall back to SPECIALIST_GUIDE for an unknown role', async () => {
    mockAiGenerator.generate.mockResolvedValue('Respuesta del asistente.');

    await useCase.execute({ role: 'assistant', messages: SAMPLE_MESSAGES });

    const calledPrompt = mockAiGenerator.generate.mock.calls[0]?.[0] ?? '';
    expect(calledPrompt).toContain(SPECIALIST_GUIDE.trim().slice(0, 80));
  });

  it('should fall back to SPECIALIST_GUIDE for an empty role string', async () => {
    mockAiGenerator.generate.mockResolvedValue('Respuesta del asistente.');

    await useCase.execute({ role: '', messages: SAMPLE_MESSAGES });

    const calledPrompt = mockAiGenerator.generate.mock.calls[0]?.[0] ?? '';
    expect(calledPrompt).toContain(SPECIALIST_GUIDE.trim().slice(0, 80));
  });

  // ---------------------------------------------------------------------------
  // Prompt content
  // ---------------------------------------------------------------------------

  it('should call generate with a prompt that contains the conversation message', async () => {
    mockAiGenerator.generate.mockResolvedValue('Aquí va la respuesta.');

    await useCase.execute({
      role: 'doctor',
      messages: [{ role: 'user', content: '¿Dónde está la agenda?' }],
    });

    const calledPrompt = mockAiGenerator.generate.mock.calls[0]?.[0] ?? '';
    expect(calledPrompt).toContain('¿Dónde está la agenda?');
  });

  it('should call generate exactly once per execute call', async () => {
    mockAiGenerator.generate.mockResolvedValue('Respuesta.');

    await useCase.execute({ role: 'doctor', messages: SAMPLE_MESSAGES });

    expect(mockAiGenerator.generate).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // Output
  // ---------------------------------------------------------------------------

  it('should return the trimmed reply from the AI provider', async () => {
    mockAiGenerator.generate.mockResolvedValue('  La agenda está en el menú.  ');

    const result = await useCase.execute({ role: 'doctor', messages: SAMPLE_MESSAGES });

    expect(result.reply).toBe('La agenda está en el menú.');
  });

  it('should return an empty string reply when provider returns empty', async () => {
    mockAiGenerator.generate.mockResolvedValue('   ');

    const result = await useCase.execute({ role: 'doctor', messages: SAMPLE_MESSAGES });

    expect(result.reply).toBe('');
  });

  // ---------------------------------------------------------------------------
  // Error handling
  // ---------------------------------------------------------------------------

  it('should throw HelpChatProviderError when AI provider rejects with an Error', async () => {
    const providerErr = new Error('fetch_timeout');
    mockAiGenerator.generate.mockRejectedValue(providerErr);

    await expect(
      useCase.execute({ role: 'doctor', messages: SAMPLE_MESSAGES }),
    ).rejects.toBeInstanceOf(HelpChatProviderError);
  });

  it('should throw HelpChatProviderError when AI provider rejects with a non-Error value', async () => {
    mockAiGenerator.generate.mockRejectedValue('string_error');

    await expect(
      useCase.execute({ role: 'doctor', messages: SAMPLE_MESSAGES }),
    ).rejects.toBeInstanceOf(HelpChatProviderError);
  });

  it('should preserve internalDetail from the provider error', async () => {
    const providerErr = new Error('rate_limited_on_both_models');
    mockAiGenerator.generate.mockRejectedValue(providerErr);

    let caught: HelpChatProviderError | null = null;
    try {
      await useCase.execute({ role: 'doctor', messages: SAMPLE_MESSAGES });
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

    let caught: HelpChatProviderError | null = null;
    try {
      await useCase.execute({ role: 'doctor', messages: SAMPLE_MESSAGES });
    } catch (err) {
      if (err instanceof HelpChatProviderError) {
        caught = err;
      }
    }

    expect(caught?.message).not.toContain('missing_api_key');
    expect(caught?.message).toBeTruthy();
  });
});
