import {
  Controller,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Body,
  HttpCode,
  HttpStatus,
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

interface TranscribeSuccessResponse {
  success: true;
  data: TranscribeAudioOutputDto;
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
@Controller('ai')
@UseGuards(AppAuthGuard, RolesGuard)
@Roles('doctor', 'super_admin')
export class AiTranscriptionController {
  constructor(private readonly transcribeAudio: TranscribeAudioUseCase) {}

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

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

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
