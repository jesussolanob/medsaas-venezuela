import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  AI_TEXT_GENERATOR_PORT,
  type IAiTextGenerator,
} from '../../../ai-transcription/application/ports/ai-text-generator.port';
import { SUPER_ADMIN_GUIDE } from '../../guides/super-admin-guide.content';
import { SPECIALIST_GUIDE } from '../../guides/specialist-guide.content';
import { PATIENT_GUIDE } from '../../guides/patient-guide.content';
import { buildHelpPrompt } from '../build-help-prompt';
import { HelpChatProviderError } from '../../domain/errors/help-chat-provider.error';
import type { HelpChatInput, HelpChatOutput } from '../dtos/help-chat.dto';

/** Selects the user guide based on the authenticated user's role. */
function selectGuide(role: string): string {
  switch (role) {
    case 'super_admin':
      return SUPER_ADMIN_GUIDE;
    case 'patient':
      return PATIENT_GUIDE;
    case 'doctor':
    default:
      // Unknown or unmapped roles fall back to the specialist guide.
      return SPECIALIST_GUIDE;
  }
}

/**
 * HelpChatUseCase
 *
 * Receives a role and conversation history, selects the appropriate role-specific
 * guide, builds the prompt and delegates text generation to the AI provider.
 *
 * No persistence — history is stateless (caller owns the context).
 * No PHI is stored or logged here.
 */
@Injectable()
export class HelpChatUseCase {
  private readonly logger = new Logger(HelpChatUseCase.name);

  constructor(
    @Inject(AI_TEXT_GENERATOR_PORT)
    private readonly aiTextGenerator: IAiTextGenerator,
  ) {}

  async execute(input: HelpChatInput): Promise<HelpChatOutput> {
    const guide = selectGuide(input.role);
    const prompt = buildHelpPrompt(guide, input.messages);

    let reply: string;
    try {
      reply = await this.aiTextGenerator.generate(prompt);
    } catch (err) {
      // Log the technical reason (no PII, no prompt content, no user messages).
      const detail = err instanceof Error ? err.message : 'unknown_provider_error';
      this.logger.warn(`AI provider failure — technical reason: ${detail}`, HelpChatUseCase.name);
      // Wrap into a typed domain error (generic public message, no internal detail leaked).
      throw new HelpChatProviderError(detail);
    }

    return { reply: reply.trim() };
  }
}
