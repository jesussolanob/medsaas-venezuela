/**
 * IAiTextGenerator — application-layer port.
 *
 * Decouples AI text use cases from the concrete Gemini provider.
 * The concrete adapter lives in infrastructure/adapters/.
 *
 * Input: a fully-built prompt string (constructed by the use case).
 * Output: the generated text result.
 *
 * NEVER receives PHI directly — the caller is responsible for deciding
 * whether clinical content is included and what to log.
 */
export interface IAiTextGenerator {
  generate(prompt: string): Promise<string>;
}

export const AI_TEXT_GENERATOR_PORT = 'AI_TEXT_GENERATOR_PORT' as const;
