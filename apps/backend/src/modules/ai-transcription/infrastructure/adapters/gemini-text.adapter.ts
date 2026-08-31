import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IAiTextGenerator } from '../../application/ports/ai-text-generator.port';
import { AiTextProviderError } from '../../domain/errors/ai-text-provider.error';

/** Gemini model for text generation tasks. Falls back to primary if not set. */
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

/**
 * Fallback model used when the primary returns 429 (rate limit).
 * `gemini-flash-latest` is a rolling alias that always resolves to a current
 * Flash model, so it does not 404 when a specific version is retired
 * (the old `gemini-1.5-flash` was retired → 404).
 */
const FALLBACK_GEMINI_MODEL = 'gemini-flash-latest';

/** Default fetch timeout in milliseconds. Override via GEMINI_TIMEOUT_MS env var. */
const DEFAULT_TIMEOUT_MS = 60_000;

/** Gemini v1beta base URL. */
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

/**
 * GeminiTextAdapter
 *
 * Infrastructure adapter implementing IAiTextGenerator using the Google Gemini
 * generativeLanguage API (v1beta, generateContent).
 *
 * Security rules:
 *   - API key sent via `x-goog-api-key` request header — NEVER in the URL
 *     (prevents key leakage in Cloud Run access logs and stack traces).
 *   - Client-facing errors are always generic; internal details go only to logger.
 *   - NEVER logs prompt content, which may contain clinical data (PHI).
 *   - Falls back to FALLBACK_GEMINI_MODEL on HTTP 429 (quota exhausted).
 *   - Fetch is bounded by a configurable AbortSignal timeout.
 */
@Injectable()
export class GeminiTextAdapter implements IAiTextGenerator {
  private readonly logger = new Logger(GeminiTextAdapter.name);
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(private readonly config: ConfigService) {
    this.model = this.config.get<string>('GEMINI_AUDIO_MODEL') ?? DEFAULT_GEMINI_MODEL;
    const rawTimeout = Number(this.config.get<string>('GEMINI_TIMEOUT_MS'));
    this.timeoutMs =
      Number.isFinite(rawTimeout) && rawTimeout > 0 ? rawTimeout : DEFAULT_TIMEOUT_MS;
  }

  async generate(prompt: string): Promise<string> {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      this.logger.warn('[GeminiTextAdapter] GEMINI_API_KEY is not set');
      throw new AiTextProviderError('missing_api_key');
    }

    // Se intenta con el modelo primario y se cae al de respaldo cuando el error
    // es reintentable (429 cuota, 503 saturado).
    const result = await this.callGemini(apiKey, this.model, prompt);
    if (result.retryable) {
      this.logger.warn(
        `[GeminiTextAdapter] ${this.model} no disponible — reintentando con ${FALLBACK_GEMINI_MODEL}`,
      );
      const fallbackResult = await this.callGemini(apiKey, FALLBACK_GEMINI_MODEL, prompt);
      if (fallbackResult.retryable) {
        throw new AiTextProviderError('ai_unavailable');
      }
      return fallbackResult.text ?? '';
    }

    return result.text ?? '';
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async callGemini(
    apiKey: string,
    model: string,
    prompt: string,
  ): Promise<{ text?: string; retryable?: boolean }> {
    const url = `${GEMINI_API_BASE}/${model}:generateContent`;

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
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            // gemini-2.5-flash is a "thinking" model: reasoning tokens count against
            // this budget. 2048 was too low — thinking consumed it and the visible
            // answer got truncated mid-sentence. 8192 leaves ample room for the reply
            // (matches the transcription adapter).
            maxOutputTokens: 8192,
          },
        }),
      });
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === 'TimeoutError';
      const detail = isTimeout
        ? 'fetch_timeout'
        : err instanceof Error
          ? err.message
          : 'network_error';
      this.logger.warn(`[GeminiTextAdapter] fetch failed: ${detail}`);
      throw new AiTextProviderError(detail);
    }

    // 429 = cuota agotada. 503 = el modelo está SATURADO, que en Gemini es
    // frecuente y transitorio. Los dos se tratan igual porque los dos se
    // resuelven reintentando con el modelo alternativo.
    //
    // Antes el 503 caía en el `if (!res.ok)` de abajo y lanzaba en el acto, sin
    // reintentar: en producción eso dejaba al especialista con "Error al conectar
    // con la IA" cada vez que Gemini estaba ocupado, aunque el modelo de respaldo
    // hubiera respondido.
    if (res.status === 429 || res.status === 503) {
      this.logger.warn(`[GeminiTextAdapter] ${model} devolvió ${res.status} (reintentable)`);
      return { retryable: true };
    }

    if (!res.ok) {
      this.logger.warn(`[GeminiTextAdapter] provider returned HTTP ${res.status}`);
      throw new AiTextProviderError(`HTTP_${res.status}`);
    }

    let data: GeminiGenerateContentResponse;
    try {
      data = (await res.json()) as GeminiGenerateContentResponse;
    } catch {
      this.logger.warn('[GeminiTextAdapter] failed to parse JSON response');
      throw new AiTextProviderError('invalid_json_response');
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    if (!text) {
      this.logger.warn('[GeminiTextAdapter] provider returned empty response');
      throw new AiTextProviderError('empty_response');
    }

    return { text };
  }
}
