import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  ITranscriptionPort,
  TranscriptionInput,
  TranscriptionOutput,
} from '../../application/ports/transcription.port';
import {
  TranscriptionNotConfiguredError,
  TranscriptionProviderError,
} from '../../domain/errors/transcription-provider-error';

/** Default Gemini model for audio tasks. Override via GEMINI_AUDIO_MODEL env var. */
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

/** Default fetch timeout in milliseconds. Override via GEMINI_TIMEOUT_MS env var. */
const DEFAULT_TIMEOUT_MS = 120_000;

/** Gemini v1beta base URL — no API key in path. */
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Max length for each block suggestion content (chars). */
const MAX_SUGGESTION_CONTENT_CHARS = 4000;

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

/**
 * GeminiTranscriptionAdapter
 *
 * Infrastructure adapter that implements ITranscriptionPort using the
 * Google Gemini generativeLanguage API (v1beta, generateContent).
 *
 * Security rules:
 *   - API key sent via `x-goog-api-key` request header — NEVER in the URL
 *     (prevents key leakage in Cloud Run access logs and stack traces).
 *   - Client-facing errors are always generic; internal details (HTTP status,
 *     network error messages) go only to the server logger.
 *   - NEVER logs audio bytes, transcript text, or any PHI.
 *   - Suggestions are filtered to the set of keys the caller sent, preventing
 *     prompt-injection from inserting foreign block keys.
 *   - Suggestion content is capped at MAX_SUGGESTION_CONTENT_CHARS.
 *   - Fetch is bounded by a configurable AbortSignal timeout.
 */
@Injectable()
export class GeminiTranscriptionAdapter implements ITranscriptionPort {
  private readonly logger = new Logger(GeminiTranscriptionAdapter.name);
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(private readonly config: ConfigService) {
    this.model = this.config.get<string>('GEMINI_AUDIO_MODEL') ?? DEFAULT_GEMINI_MODEL;
    const rawTimeout = Number(this.config.get<string>('GEMINI_TIMEOUT_MS'));
    this.timeoutMs =
      Number.isFinite(rawTimeout) && rawTimeout > 0 ? rawTimeout : DEFAULT_TIMEOUT_MS;
  }

  async transcribe(input: TranscriptionInput): Promise<TranscriptionOutput> {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      // Log server-side only — never expose which key is missing to the client.
      this.logger.warn('[GeminiTranscriptionAdapter] GEMINI_API_KEY is not set');
      throw new TranscriptionNotConfiguredError();
    }

    const prompt = this.buildPrompt(input);
    const base64 = input.audioBuffer.toString('base64');

    // Key goes in the header, NOT the URL (prevents log exposure in Cloud Run).
    const url = `${GEMINI_API_BASE}/${this.model}:generateContent`;

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        signal: AbortSignal.timeout(this.timeoutMs),
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                { inline_data: { mime_type: input.mimeType, data: base64 } },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 8192,
          },
        }),
      });
    } catch (err) {
      // Log internal detail; throw generic error to caller.
      const isTimeout = err instanceof Error && err.name === 'TimeoutError';
      const detail = isTimeout
        ? 'fetch timeout'
        : err instanceof Error
          ? err.message
          : 'network error';
      this.logger.warn(`[GeminiTranscriptionAdapter] fetch failed: ${detail}`);
      throw new TranscriptionProviderError(detail);
    }

    if (!res.ok) {
      // Log HTTP status only — response body may contain partial prompts or PHI echoes.
      this.logger.warn(`[GeminiTranscriptionAdapter] provider returned HTTP ${res.status}`);
      throw new TranscriptionProviderError(`HTTP ${res.status}`);
    }

    let data: GeminiGenerateContentResponse;
    try {
      data = (await res.json()) as GeminiGenerateContentResponse;
    } catch {
      this.logger.warn('[GeminiTranscriptionAdapter] failed to parse JSON response');
      throw new TranscriptionProviderError('invalid JSON response');
    }

    const fullText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    if (!fullText) {
      this.logger.warn('[GeminiTranscriptionAdapter] provider returned empty response');
      throw new TranscriptionProviderError('empty response');
    }

    const { transcript, suggestions } = this.parseGeminiResponse(fullText, input.availableBlocks);

    return { transcript, suggestions, model: this.model };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private buildPrompt(input: TranscriptionInput): string {
    const blocksHint =
      input.availableBlocks.length > 0
        ? `\n\nLos bloques disponibles en la plantilla del doctor son:\n${input.availableBlocks
            .map((b) => `  • "${b.key}" → ${b.label}`)
            .join(
              '\n',
            )}\n\nDespués de la transcripción, sugiere cómo distribuir el contenido entre estos bloques. Devuelve un JSON al final del mensaje con la siguiente estructura EXACTA:\n\`\`\`json\n{ "suggestions": [ { "block_key": "chief_complaint", "content": "..." }, ... ] }\n\`\`\``
        : '';

    return `Eres un asistente médico profesional. Vas a recibir el AUDIO de una consulta médica grabada por un especialista en Venezuela.

Tu trabajo:
1. Transcribir el audio palabra por palabra en español (Venezuela), preservando el contexto clínico.
2. Limpiar muletillas obvias ("eh", "umm", "este") pero NO inventar contenido que no esté en el audio.
3. Si hay términos médicos que no entiendes claramente, transcríbelos fonéticamente y agrega "[?]".
4. Identificar quién habla cuando sea claro (DOCTOR: / PACIENTE:) si hay diálogo.${blocksHint}

Idioma del audio: ${input.language}.

Devuelve PRIMERO la transcripción completa en texto plano (sin markdown). Si te pidieron sugerencias de bloques, después de la transcripción devuelve el bloque JSON marcado con \`\`\`json y \`\`\`.`;
  }

  /**
   * Parses the Gemini response, splitting the transcript from the optional
   * ```json ... ``` block containing block suggestions.
   *
   * @param allowedBlocks — suggestions whose block_key is NOT in this set are
   *   discarded (prompt-injection guard). When empty, no suggestions are returned.
   */
  private parseGeminiResponse(
    fullText: string,
    allowedBlocks: TranscriptionInput['availableBlocks'],
  ): { transcript: string; suggestions: TranscriptionOutput['suggestions'] } {
    const jsonMatch = fullText.match(/```json\s*([\s\S]*?)\s*```/);

    if (!jsonMatch || allowedBlocks.length === 0) {
      return { transcript: fullText.trim(), suggestions: [] };
    }

    const transcript = fullText.replace(jsonMatch[0] ?? '', '').trim();
    const allowedKeys = new Set(allowedBlocks.map((b) => b.key));
    const suggestions = this.parseSuggestions(jsonMatch[1] ?? '', allowedKeys);

    return { transcript, suggestions };
  }

  /**
   * Parses and validates the suggestions JSON blob returned by Gemini.
   *
   * - Discards suggestions whose block_key is not in allowedKeys.
   * - Truncates content to MAX_SUGGESTION_CONTENT_CHARS.
   */
  private parseSuggestions(
    jsonString: string,
    allowedKeys: Set<string>,
  ): TranscriptionOutput['suggestions'] {
    try {
      const parsed = JSON.parse(jsonString) as unknown;
      if (
        parsed !== null &&
        typeof parsed === 'object' &&
        'suggestions' in parsed &&
        Array.isArray((parsed as { suggestions: unknown }).suggestions)
      ) {
        return (parsed as { suggestions: unknown[] }).suggestions
          .filter(
            (s): s is { block_key: string; content: string } =>
              s !== null &&
              typeof s === 'object' &&
              typeof (s as Record<string, unknown>).block_key === 'string' &&
              typeof (s as Record<string, unknown>).content === 'string' &&
              // Only keep suggestions for keys the caller explicitly sent.
              allowedKeys.has((s as Record<string, unknown>).block_key as string),
          )
          .map((s) => ({
            block_key: s.block_key,
            content: s.content.slice(0, MAX_SUGGESTION_CONTENT_CHARS),
          }));
      }
    } catch {
      this.logger.warn('[GeminiTranscriptionAdapter] failed to parse suggestions JSON');
    }
    return [];
  }
}
