import {
  Controller,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Body,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import { RolesGuard } from '../../../../presentation/guards/roles.guard';
import { Roles } from '../../../../presentation/decorators/roles.decorator';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../../presentation/decorators/current-user.decorator';
import { TranscribeAudioUseCase } from '../../application/use-cases/transcribe-audio.use-case';
import type { TranscribeAudioOutputDto } from '../../application/dtos/transcribe-audio.dto';
import { ALLOWED_LANGUAGES } from '../../application/dtos/transcribe-audio.dto';
import { TranscriptionAudioInvalidError } from '../../domain/errors/transcription-audio-invalid.error';
import { AiTextUseCase } from '../../application/use-cases/ai-text.use-case';
import type {
  AiTextOutputDto,
  AiTextActionInput,
  ImproveBlockMode,
} from '../../application/dtos/ai-text.dto';

/**
 * Removes ASCII control characters (U+0000–U+001F) from a string.
 * Used for label sanitization. Replaces each run with a single space.
 */
function stripControlChars(input: string): string {
  let result = '';
  for (const char of input) {
    const code = char.codePointAt(0) ?? 0;
    result += code <= 0x1f ? ' ' : char;
  }
  return result.trim();
}

/** Maximum audio upload size: 20 MB. */
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

/** Allowed audio MIME types (base types, without codec suffixes). */
const ALLOWED_MIME_BASE = new Set([
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
]);

/** Block key validation: only lowercase letters and underscores. */
const BLOCK_KEY_RE = /^[a-z_]+$/u;

/** Allowed values for the optional improve_block `mode` field. */
const ALLOWED_IMPROVE_MODES = new Set<ImproveBlockMode>([
  'improve',
  'formal',
  'shorten',
  'lengthen',
]);

interface TranscribeSuccessResponse {
  success: true;
  data: TranscribeAudioOutputDto;
}

interface AiTextSuccessResponse {
  success: true;
  data: AiTextOutputDto;
}

/**
 * AiTranscriptionController
 *
 * POST /api/ai/transcribe
 *
 * Accepts a multipart upload with field `audio` (required) and optional fields
 * `available_blocks` (JSON array) and `language` (string).
 *
 * Auth: AppAuthGuard (dev or Auth0 depending on AUTH_MODE) + RolesGuard.
 * Roles: doctor, super_admin.
 *
 * Plan gate (FAIL-CLOSED for PHI): TranscribeAudioUseCase enforces that the
 * doctor's current effective plan includes the `ai_transcription` feature.
 * super_admin bypasses the gate.
 */
/** Allowed action values for POST /api/ai/text. */
const ALLOWED_AI_TEXT_ACTIONS = new Set(['improve_block', 'summarize_report', 'patient_history']);

@Controller('ai')
@UseGuards(AppAuthGuard, RolesGuard)
@Roles('doctor', 'super_admin')
export class AiTranscriptionController {
  constructor(
    private readonly transcribeAudio: TranscribeAudioUseCase,
    private readonly aiText: AiTextUseCase,
  ) {}

  /**
   * POST /api/ai/transcribe
   *
   * Multipart fields:
   *   - audio         (required) — binary audio file; max 20 MB
   *   - available_blocks (optional) — JSON string: [{key:string, label:string}]
   *   - language      (optional) — 'es-VE'|'es-ES'|'en-US'|'pt-BR' (default 'es-VE')
   *
   * Response:
   *   { success: true, data: { transcript: string, suggestions: [...] } }
   */
  @Post('transcribe')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('audio', {
      limits: { fileSize: MAX_AUDIO_BYTES },
    }),
  )
  async transcribe(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('available_blocks') availableBlocksRaw: string | undefined,
    @Body('language') rawLanguage: string | undefined,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<TranscribeSuccessResponse> {
    // Validate audio presence. Size is already enforced by FileInterceptor limits.
    if (!file || !file.buffer) {
      throw new TranscriptionAudioInvalidError('Campo "audio" requerido.');
    }

    // Normalize and validate MIME type.
    const rawMime = file.mimetype ?? 'audio/webm';
    const mimeType = (rawMime.split(';')[0] ?? rawMime).trim();
    if (!ALLOWED_MIME_BASE.has(mimeType)) {
      throw new TranscriptionAudioInvalidError(`Formato de audio no soportado: ${rawMime}`);
    }

    // Sanitize available_blocks: filter invalid keys, truncate labels.
    const availableBlocks = this.sanitizeBlocks(availableBlocksRaw);

    // Whitelist language.
    const language = (ALLOWED_LANGUAGES as ReadonlyArray<string>).includes(rawLanguage ?? '')
      ? (rawLanguage as (typeof ALLOWED_LANGUAGES)[number])
      : 'es-VE';

    const result = await this.transcribeAudio.execute({
      audioBuffer: file.buffer,
      audioBytes: file.size,
      mimeType,
      availableBlocks,
      language,
      doctorId: user.sub,
      isSuperAdmin: user.role === 'super_admin',
    });

    return { success: true, data: result };
  }

  /**
   * POST /api/ai/text
   *
   * Accepts a JSON body with an `action` discriminator and action-specific fields.
   *
   * Actions:
   *   - improve_block   → { action, content, block_key, block_label }
   *   - summarize_report → { action, legacy, blocks_data, blocks_meta }
   *   - patient_history  → { action, patientId }
   *
   * Response: { success: true, data: { result: string } }
   */
  @Post('text')
  @HttpCode(HttpStatus.OK)
  async generateText(
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<AiTextSuccessResponse> {
    const action = body['action'];

    if (typeof action !== 'string' || !ALLOWED_AI_TEXT_ACTIONS.has(action)) {
      throw new BadRequestException(
        'Campo "action" inválido. Valores permitidos: improve_block, summarize_report, patient_history.',
      );
    }

    const actionInput = this.parseActionInput(action, body);

    const result = await this.aiText.execute({
      actionInput,
      doctorId: user.sub,
      isSuperAdmin: user.role === 'super_admin',
    });

    return { success: true, data: result };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Parses and validates the action-specific fields from the request body.
   * Throws BadRequestException for missing required fields.
   */
  private parseActionInput(action: string, body: Record<string, unknown>): AiTextActionInput {
    if (action === 'improve_block') {
      const content = body['content'];
      const block_key = body['block_key'];
      const block_label = body['block_label'];
      const rawMode = body['mode'];

      if (typeof content !== 'string' || !content.trim()) {
        throw new BadRequestException('Campo "content" es requerido para improve_block.');
      }
      if (typeof block_key !== 'string' || !block_key.trim()) {
        throw new BadRequestException('Campo "block_key" es requerido para improve_block.');
      }
      if (typeof block_label !== 'string' || !block_label.trim()) {
        throw new BadRequestException('Campo "block_label" es requerido para improve_block.');
      }

      // mode is optional; if provided it must be one of the allowed values.
      if (
        rawMode !== undefined &&
        (typeof rawMode !== 'string' || !ALLOWED_IMPROVE_MODES.has(rawMode as ImproveBlockMode))
      ) {
        throw new BadRequestException(
          'Campo "mode" inválido. Valores permitidos: improve, formal, shorten, lengthen.',
        );
      }

      const mode = rawMode !== undefined ? (rawMode as ImproveBlockMode) : undefined;

      return {
        action: 'improve_block',
        content: content.slice(0, 10_000),
        block_key: block_key.slice(0, 100),
        block_label: block_label.slice(0, 200),
        ...(mode !== undefined && { mode }),
      };
    }

    if (action === 'summarize_report') {
      const legacy = body['legacy'];
      const blocks_data = body['blocks_data'];
      const blocks_meta = body['blocks_meta'];

      if (legacy === null || typeof legacy !== 'object' || Array.isArray(legacy)) {
        throw new BadRequestException('Campo "legacy" debe ser un objeto para summarize_report.');
      }
      if (blocks_data === null || typeof blocks_data !== 'object' || Array.isArray(blocks_data)) {
        throw new BadRequestException(
          'Campo "blocks_data" debe ser un objeto para summarize_report.',
        );
      }
      if (!Array.isArray(blocks_meta)) {
        throw new BadRequestException(
          'Campo "blocks_meta" debe ser un array para summarize_report.',
        );
      }

      return {
        action: 'summarize_report',
        legacy: legacy as Record<string, string | null | undefined>,
        blocks_data: blocks_data as Record<string, unknown>,
        blocks_meta: (blocks_meta as unknown[])
          .filter(
            (m): m is { key: string; label: string } =>
              m !== null &&
              typeof m === 'object' &&
              typeof (m as Record<string, unknown>)['key'] === 'string' &&
              typeof (m as Record<string, unknown>)['label'] === 'string',
          )
          .slice(0, 50),
      };
    }

    // patient_history
    const patientId = body['patientId'];
    if (typeof patientId !== 'string' || !patientId.trim()) {
      throw new BadRequestException('Campo "patientId" es requerido para patient_history.');
    }

    return { action: 'patient_history', patientId };
  }

  /**
   * Sanitizes the available_blocks JSON string.
   *
   * - Parses JSON (silently ignores parse errors → returns []).
   * - Filters blocks with invalid key (not matching /^[a-z_]+$/).
   * - Truncates label to 80 chars and strips control characters.
   * - Limits to 20 blocks.
   */
  private sanitizeBlocks(raw: string | undefined): { key: string; label: string }[] {
    if (!raw) return [];

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];

      return (parsed as unknown[])
        .filter(
          (b): b is { key: string; label: string } =>
            b !== null &&
            typeof b === 'object' &&
            typeof (b as Record<string, unknown>).key === 'string' &&
            typeof (b as Record<string, unknown>).label === 'string' &&
            BLOCK_KEY_RE.test((b as Record<string, unknown>).key as string),
        )
        .slice(0, 20)
        .map((b) => ({
          key: b.key,
          label: stripControlChars(b.label.slice(0, 80)),
        }));
    } catch {
      return [];
    }
  }
}
