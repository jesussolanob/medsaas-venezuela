import { TranscriptionFeatureDeniedError } from './transcription-feature-denied.error';
import { TranscriptionAudioInvalidError } from './transcription-audio-invalid.error';
import {
  TranscriptionProviderError,
  TranscriptionNotConfiguredError,
} from './transcription-provider-error';

describe('Transcription domain errors', () => {
  describe('TranscriptionFeatureDeniedError', () => {
    it('has code TRANSCRIPTION_FEATURE_DENIED', () => {
      const err = new TranscriptionFeatureDeniedError('plan_not_included');
      expect(err.code).toBe('TRANSCRIPTION_FEATURE_DENIED');
    });

    it('has httpStatus 403', () => {
      const err = new TranscriptionFeatureDeniedError('plan_not_included');
      expect(err.httpStatus).toBe(403);
    });

    it('emits a user-friendly message for plan_not_included', () => {
      const err = new TranscriptionFeatureDeniedError('plan_not_included');
      expect(err.message).toContain('plan no incluye');
    });

    it('emits a fail-closed message for plan_check_failed', () => {
      const err = new TranscriptionFeatureDeniedError('plan_check_failed');
      expect(err.message).toContain('verificar');
    });

    it('is an instance of Error', () => {
      expect(new TranscriptionFeatureDeniedError('plan_not_included')).toBeInstanceOf(Error);
    });
  });

  describe('TranscriptionAudioInvalidError', () => {
    it('has code TRANSCRIPTION_AUDIO_INVALID', () => {
      const err = new TranscriptionAudioInvalidError('Audio muy grande');
      expect(err.code).toBe('TRANSCRIPTION_AUDIO_INVALID');
    });

    it('has httpStatus 422', () => {
      const err = new TranscriptionAudioInvalidError('bad format');
      expect(err.httpStatus).toBe(422);
    });

    it('preserves the reason message', () => {
      const err = new TranscriptionAudioInvalidError('Formato no soportado');
      expect(err.message).toBe('Formato no soportado');
    });
  });

  describe('TranscriptionProviderError', () => {
    it('has code TRANSCRIPTION_PROVIDER_ERROR', () => {
      const err = new TranscriptionProviderError('Gemini 503');
      expect(err.code).toBe('TRANSCRIPTION_PROVIDER_ERROR');
    });

    it('has httpStatus 502', () => {
      const err = new TranscriptionProviderError('timeout');
      expect(err.httpStatus).toBe(502);
    });

    it('exposes a generic client-facing message (no internal detail)', () => {
      const err = new TranscriptionProviderError('very sensitive internal detail');
      expect(err.message).not.toContain('very sensitive internal detail');
      expect(err.message).toContain('temporalmente no disponible');
    });

    it('stores the internal detail separately for server-side logging', () => {
      const err = new TranscriptionProviderError('HTTP 503');
      expect(err.internalDetail).toBe('HTTP 503');
    });
  });

  describe('TranscriptionNotConfiguredError', () => {
    it('has code TRANSCRIPTION_NOT_CONFIGURED', () => {
      const err = new TranscriptionNotConfiguredError();
      expect(err.code).toBe('TRANSCRIPTION_NOT_CONFIGURED');
    });

    it('has httpStatus 500', () => {
      const err = new TranscriptionNotConfiguredError();
      expect(err.httpStatus).toBe(500);
    });

    it('has a generic message that does not mention the key name', () => {
      const err = new TranscriptionNotConfiguredError();
      expect(err.message).not.toContain('GEMINI_API_KEY');
      expect(err.message).toContain('configurado');
    });

    it('is an instance of Error', () => {
      expect(new TranscriptionNotConfiguredError()).toBeInstanceOf(Error);
    });
  });
});
