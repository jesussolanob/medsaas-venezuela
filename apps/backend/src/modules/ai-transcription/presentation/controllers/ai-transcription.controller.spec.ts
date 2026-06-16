import { Test, type TestingModule } from '@nestjs/testing';
import { AiTranscriptionController } from './ai-transcription.controller';
import { TranscribeAudioUseCase } from '../../application/use-cases/transcribe-audio.use-case';
import { TranscriptionFeatureDeniedError } from '../../domain/errors/transcription-feature-denied.error';
import { TranscriptionAudioInvalidError } from '../../domain/errors/transcription-audio-invalid.error';
import { TranscriptionProviderError } from '../../domain/errors/transcription-provider-error';
import type { CurrentUserPayload } from '../../../../presentation/decorators/current-user.decorator';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import { RolesGuard } from '../../../../presentation/guards/roles.guard';

const mockTranscribeAudioUseCase: jest.Mocked<Pick<TranscribeAudioUseCase, 'execute'>> = {
  execute: jest.fn(),
};

const mockDoctor: CurrentUserPayload = {
  sub: 'doctor-uuid-001',
  role: 'doctor',
  email: 'doctor@dev.local',
};

const mockAdmin: CurrentUserPayload = {
  sub: 'admin-uuid-001',
  role: 'super_admin',
  email: 'admin@dev.local',
};

/** Minimal Multer.File-like object for testing. */
interface MulterFileLike {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
  destination: string;
  filename: string;
  path: string;
  stream: null;
}

function makeAudioFile(overrides: Partial<MulterFileLike> = {}): MulterFileLike {
  return {
    fieldname: 'audio',
    originalname: 'consult.webm',
    encoding: '7bit',
    mimetype: 'audio/webm',
    buffer: Buffer.from('fake-audio-bytes'),
    size: 1024,
    destination: '',
    filename: '',
    path: '',
    stream: null,
    ...overrides,
  };
}

describe('AiTranscriptionController', () => {
  let controller: AiTranscriptionController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AiTranscriptionController],
      providers: [{ provide: TranscribeAudioUseCase, useValue: mockTranscribeAudioUseCase }],
    })
      .overrideGuard(AppAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get(AiTranscriptionController);
    jest.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // Happy path
  // -----------------------------------------------------------------------

  it('returns transcript and suggestions on valid audio upload', async () => {
    mockTranscribeAudioUseCase.execute.mockResolvedValue({
      transcript: 'Paciente refiere dolor abdominal.',
      suggestions: [{ block_key: 'chief_complaint', content: 'Dolor abdominal' }],
    });

    const file = makeAudioFile();
    const result = await controller.transcribe(
      file as unknown as Express.Multer.File,
      undefined,
      undefined,
      mockDoctor,
    );

    expect(result.success).toBe(true);
    expect(result.data.transcript).toBe('Paciente refiere dolor abdominal.');
    expect(result.data.suggestions).toHaveLength(1);
  });

  it('passes doctorId from authenticated user (never from body)', async () => {
    mockTranscribeAudioUseCase.execute.mockResolvedValue({ transcript: 'ok', suggestions: [] });

    const file = makeAudioFile();
    await controller.transcribe(
      file as unknown as Express.Multer.File,
      undefined,
      undefined,
      mockDoctor,
    );

    const call = mockTranscribeAudioUseCase.execute.mock.calls[0]![0]!;
    expect(call.doctorId).toBe('doctor-uuid-001');
  });

  it('passes isSuperAdmin=false for doctor role', async () => {
    mockTranscribeAudioUseCase.execute.mockResolvedValue({ transcript: 'ok', suggestions: [] });

    await controller.transcribe(
      makeAudioFile() as unknown as Express.Multer.File,
      undefined,
      undefined,
      mockDoctor,
    );

    const call = mockTranscribeAudioUseCase.execute.mock.calls[0]![0]!;
    expect(call.isSuperAdmin).toBe(false);
  });

  it('passes isSuperAdmin=true for super_admin role', async () => {
    mockTranscribeAudioUseCase.execute.mockResolvedValue({ transcript: 'ok', suggestions: [] });

    await controller.transcribe(
      makeAudioFile() as unknown as Express.Multer.File,
      undefined,
      undefined,
      mockAdmin,
    );

    const call = mockTranscribeAudioUseCase.execute.mock.calls[0]![0]!;
    expect(call.isSuperAdmin).toBe(true);
  });

  it('defaults language to es-VE when not provided', async () => {
    mockTranscribeAudioUseCase.execute.mockResolvedValue({ transcript: 'ok', suggestions: [] });

    await controller.transcribe(
      makeAudioFile() as unknown as Express.Multer.File,
      undefined,
      undefined,
      mockDoctor,
    );

    const call = mockTranscribeAudioUseCase.execute.mock.calls[0]![0]!;
    expect(call.language).toBe('es-VE');
  });

  it('defaults language to es-VE when an invalid language is provided', async () => {
    mockTranscribeAudioUseCase.execute.mockResolvedValue({ transcript: 'ok', suggestions: [] });

    await controller.transcribe(
      makeAudioFile() as unknown as Express.Multer.File,
      undefined,
      'fr-FR',
      mockDoctor,
    );

    const call = mockTranscribeAudioUseCase.execute.mock.calls[0]![0]!;
    expect(call.language).toBe('es-VE');
  });

  it('accepts a whitelisted language', async () => {
    mockTranscribeAudioUseCase.execute.mockResolvedValue({ transcript: 'ok', suggestions: [] });

    await controller.transcribe(
      makeAudioFile() as unknown as Express.Multer.File,
      undefined,
      'en-US',
      mockDoctor,
    );

    const call = mockTranscribeAudioUseCase.execute.mock.calls[0]![0]!;
    expect(call.language).toBe('en-US');
  });

  // -----------------------------------------------------------------------
  // available_blocks sanitization
  // -----------------------------------------------------------------------

  it('parses valid available_blocks JSON', async () => {
    mockTranscribeAudioUseCase.execute.mockResolvedValue({ transcript: 'ok', suggestions: [] });

    const blocks = JSON.stringify([
      { key: 'chief_complaint', label: 'Motivo de consulta' },
      { key: 'diagnosis', label: 'Diagnóstico' },
    ]);

    await controller.transcribe(
      makeAudioFile() as unknown as Express.Multer.File,
      blocks,
      undefined,
      mockDoctor,
    );

    const call = mockTranscribeAudioUseCase.execute.mock.calls[0]![0]!;
    expect(call.availableBlocks).toHaveLength(2);
    expect(call.availableBlocks[0]?.key).toBe('chief_complaint');
  });

  it('filters blocks with invalid key patterns', async () => {
    mockTranscribeAudioUseCase.execute.mockResolvedValue({ transcript: 'ok', suggestions: [] });

    const blocks = JSON.stringify([
      { key: 'valid_key', label: 'Valid' },
      { key: 'INVALID-KEY', label: 'Bad' },
      { key: '1nvalid', label: 'Also bad' },
    ]);

    await controller.transcribe(
      makeAudioFile() as unknown as Express.Multer.File,
      blocks,
      undefined,
      mockDoctor,
    );

    const call = mockTranscribeAudioUseCase.execute.mock.calls[0]![0]!;
    expect(call.availableBlocks).toHaveLength(1);
    expect(call.availableBlocks[0]?.key).toBe('valid_key');
  });

  it('truncates label to 80 chars and strips control characters', async () => {
    mockTranscribeAudioUseCase.execute.mockResolvedValue({ transcript: 'ok', suggestions: [] });

    const longLabel = 'A'.repeat(100);
    // Build a label with control chars via String.fromCodePoint to avoid hex literals in source
    const nul = String.fromCodePoint(0);
    const unitSeparator = String.fromCodePoint(31);
    const labelWithControl = `Normal${nul}${unitSeparator}text`;
    const blocks = JSON.stringify([
      { key: 'note', label: longLabel },
      { key: 'other', label: labelWithControl },
    ]);

    await controller.transcribe(
      makeAudioFile() as unknown as Express.Multer.File,
      blocks,
      undefined,
      mockDoctor,
    );

    const call = mockTranscribeAudioUseCase.execute.mock.calls[0]![0]!;
    expect(call.availableBlocks[0]?.label).toHaveLength(80);
    // After sanitization, no code point should be <= 31 (ASCII control chars)
    const sanitized: string = call.availableBlocks[1]?.label ?? '';
    const hasControlChar = [...sanitized].some((c) => (c.codePointAt(0) ?? 32) <= 31);
    expect(hasControlChar).toBe(false);
  });

  it('returns empty blocks on invalid JSON', async () => {
    mockTranscribeAudioUseCase.execute.mockResolvedValue({ transcript: 'ok', suggestions: [] });

    await controller.transcribe(
      makeAudioFile() as unknown as Express.Multer.File,
      'not-json',
      undefined,
      mockDoctor,
    );

    const call = mockTranscribeAudioUseCase.execute.mock.calls[0]![0]!;
    expect(call.availableBlocks).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // Audio validation errors
  // -----------------------------------------------------------------------

  it('throws TranscriptionAudioInvalidError when no file is provided', async () => {
    await expect(
      controller.transcribe(undefined, undefined, undefined, mockDoctor),
    ).rejects.toBeInstanceOf(TranscriptionAudioInvalidError);
  });

  it('throws TranscriptionAudioInvalidError when file has unsupported MIME type', async () => {
    const file = makeAudioFile({ mimetype: 'video/mp4' });

    await expect(
      controller.transcribe(
        file as unknown as Express.Multer.File,
        undefined,
        undefined,
        mockDoctor,
      ),
    ).rejects.toBeInstanceOf(TranscriptionAudioInvalidError);
  });

  it('normalizes codec-suffixed MIME types (audio/webm;codecs=opus)', async () => {
    mockTranscribeAudioUseCase.execute.mockResolvedValue({ transcript: 'ok', suggestions: [] });

    const file = makeAudioFile({ mimetype: 'audio/webm;codecs=opus' });
    const result = await controller.transcribe(
      file as unknown as Express.Multer.File,
      undefined,
      undefined,
      mockDoctor,
    );

    expect(result.success).toBe(true);
    const call = mockTranscribeAudioUseCase.execute.mock.calls[0]![0]!;
    expect(call.mimeType).toBe('audio/webm');
  });

  // -----------------------------------------------------------------------
  // Domain error propagation
  // -----------------------------------------------------------------------

  it('propagates TranscriptionFeatureDeniedError from use case', async () => {
    mockTranscribeAudioUseCase.execute.mockRejectedValue(
      new TranscriptionFeatureDeniedError('plan_not_included'),
    );

    await expect(
      controller.transcribe(
        makeAudioFile() as unknown as Express.Multer.File,
        undefined,
        undefined,
        mockDoctor,
      ),
    ).rejects.toBeInstanceOf(TranscriptionFeatureDeniedError);
  });

  it('propagates TranscriptionProviderError from use case', async () => {
    mockTranscribeAudioUseCase.execute.mockRejectedValue(
      new TranscriptionProviderError('Gemini 503'),
    );

    await expect(
      controller.transcribe(
        makeAudioFile() as unknown as Express.Multer.File,
        undefined,
        undefined,
        mockDoctor,
      ),
    ).rejects.toBeInstanceOf(TranscriptionProviderError);
  });
});
