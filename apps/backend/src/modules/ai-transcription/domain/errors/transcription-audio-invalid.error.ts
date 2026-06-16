import { DomainError } from '../../../../domain/errors/domain.error';

/**
 * Thrown when the uploaded audio file fails validation
 * (missing, oversized, or unsupported MIME type).
 */
export class TranscriptionAudioInvalidError extends DomainError {
  readonly code = 'TRANSCRIPTION_AUDIO_INVALID';
  override readonly httpStatus = 422;

  constructor(reason: string) {
    super(reason);
  }
}
