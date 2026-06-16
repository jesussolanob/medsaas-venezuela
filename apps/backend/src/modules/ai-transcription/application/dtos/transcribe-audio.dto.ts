/**
 * DTOs for the transcribe-audio use case.
 *
 * Note: multipart validation (file presence, size, MIME) is handled in the
 * controller layer via FileInterceptor + explicit checks. Zod validates only
 * the JSON-serialized fields available as form fields (available_blocks, language).
 */

/** Whitelisted language codes for transcription. */
export const ALLOWED_LANGUAGES = ['es-VE', 'es-ES', 'en-US', 'pt-BR'] as const;
export type AllowedLanguage = (typeof ALLOWED_LANGUAGES)[number];

export interface TranscribeAudioInputDto {
  /** Audio buffer extracted from the multipart upload. */
  audioBuffer: Buffer;
  /** Audio bytes count (for audit log). */
  audioBytes: number;
  /** Normalized MIME type (codec suffix stripped). */
  mimeType: string;
  /** Sanitized available template blocks. */
  availableBlocks: { key: string; label: string }[];
  /** Whitelisted language code. */
  language: AllowedLanguage;
  /** Authenticated doctor's profile id. */
  doctorId: string;
  /**
   * Whether the actor is super_admin (bypasses plan gate).
   * Only set by the presentation layer from user.role (identity resolved by the
   * auth guard); NEVER derived from client-supplied input.
   */
  isSuperAdmin: boolean;
}

export interface TranscribeAudioOutputDto {
  transcript: string;
  suggestions: { block_key: string; content: string }[];
}
