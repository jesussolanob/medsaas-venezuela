/**
 * ITranscriptionPort — application-layer port.
 *
 * Decouples the TranscribeAudioUseCase from the concrete AI provider (Gemini).
 * The concrete adapter lives in infrastructure/adapters/.
 *
 * Input: sanitized, validated audio buffer + optional context.
 * Output: transcript text + optional block suggestions + the model name used
 *         (for audit logging — never PHI).
 *
 * NEVER passes PHI (patient names, diagnoses, etc.) — audio bytes only.
 */
export interface TranscriptionBlock {
  key: string;
  label: string;
}

export interface BlockSuggestion {
  block_key: string;
  content: string;
}

export interface TranscriptionInput {
  audioBuffer: Buffer;
  /** Normalized MIME type (codec suffix stripped), e.g. 'audio/webm'. */
  mimeType: string;
  /** Sanitized list of available template blocks (max 20). */
  availableBlocks: TranscriptionBlock[];
  /** Whitelisted language code. Default: 'es-VE'. */
  language: string;
}

export interface TranscriptionOutput {
  transcript: string;
  suggestions: BlockSuggestion[];
  /** The model name actually used by the provider, e.g. 'gemini-2.5-flash'. */
  model: string;
}

export interface ITranscriptionPort {
  transcribe(input: TranscriptionInput): Promise<TranscriptionOutput>;
}

export const TRANSCRIPTION_PORT = 'TRANSCRIPTION_PORT' as const;
