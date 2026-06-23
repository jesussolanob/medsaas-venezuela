import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  AI_TEXT_GENERATOR_PORT,
  type IAiTextGenerator,
} from '../../../ai-transcription/application/ports/ai-text-generator.port';
import { GetDoctorFeaturesV2UseCase } from '../../../doctor-settings/application/use-cases/doctor-settings/get-doctor-features-v2.use-case';
import { SUPER_ADMIN_GUIDE } from '../../guides/super-admin-guide.content';
import { SPECIALIST_GUIDE } from '../../guides/specialist-guide.content';
import { PATIENT_GUIDE } from '../../guides/patient-guide.content';
import { buildHelpPrompt } from '../build-help-prompt';
import { getPlanLabel, getFeatureLabel } from '../feature-labels';
import { HelpChatProviderError } from '../../domain/errors/help-chat-provider.error';
import type { HelpChatInput, HelpChatOutput } from '../dtos/help-chat.dto';

/**
 * Feature keys that are always available to doctors regardless of the plan
 * features map (they have no featureKey in the features table).
 */
const ALWAYS_AVAILABLE_DOCTOR_FEATURES: string[] = ['offices', 'templates'];

/** Labels for always-available features. */
const ALWAYS_AVAILABLE_LABELS: Record<string, string> = {
  offices: 'Consultorios',
  templates: 'Plantillas',
};

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
 * Builds a human-readable context string describing the doctor's plan and
 * which modules are available or unavailable.
 *
 * @param planLabel   - Human-readable plan name (e.g. 'Delta Free').
 * @param available   - Labels of enabled modules.
 * @param unavailable - Labels of disabled modules.
 * @returns A plain-text block to embed in the prompt.
 */
function buildContextText(planLabel: string, available: string[], unavailable: string[]): string {
  const availableList = available.length > 0 ? available.join(', ') : 'ninguno';
  const unavailableList = unavailable.length > 0 ? unavailable.join(', ') : 'ninguno';

  return [
    `Plan actual del usuario: ${planLabel}.`,
    `Módulos DISPONIBLES en su plan: ${availableList}.`,
    `Módulos NO disponibles en su plan (requieren mejorar el plan): ${unavailableList}.`,
  ].join('\n');
}

/**
 * HelpChatUseCase
 *
 * Receives a userId, role and conversation history. For doctor users it resolves
 * the effective plan via GetDoctorFeaturesV2UseCase and injects a plan-awareness
 * context block into the prompt so the assistant can restrict guidance to modules
 * actually available on the user's plan.
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
    private readonly getDoctorFeaturesV2: GetDoctorFeaturesV2UseCase,
  ) {}

  async execute(input: HelpChatInput): Promise<HelpChatOutput> {
    const guide = selectGuide(input.role);
    const userContext = await this.buildUserContext(input.role, input.userId);
    const prompt = buildHelpPrompt(guide, input.messages, userContext);

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

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Builds the plan-awareness context string for doctor users.
   *
   * Returns undefined for non-doctor roles (super_admin, patient) — those roles
   * do not have a subscription plan that governs feature access.
   *
   * If the plan resolution fails for any reason, logs a warning (no PII) and
   * returns undefined so the assistant continues with the general guide only.
   */
  private async buildUserContext(role: string, userId: string): Promise<string | undefined> {
    if (role !== 'doctor') {
      return undefined;
    }

    try {
      const result = await this.getDoctorFeaturesV2.execute(userId);

      const planLabel = getPlanLabel(result.effective_plan_key);

      const available: string[] = [];
      const unavailable: string[] = [];

      for (const [featureKey, enabled] of Object.entries(result.features)) {
        const label = getFeatureLabel(featureKey);
        if (enabled) {
          available.push(label);
        } else {
          unavailable.push(label);
        }
      }

      // Always-available features (no featureKey in the DB) are appended to available.
      for (const key of ALWAYS_AVAILABLE_DOCTOR_FEATURES) {
        const label = ALWAYS_AVAILABLE_LABELS[key] ?? key;
        available.push(label);
      }

      return buildContextText(planLabel, available, unavailable);
    } catch (err) {
      // Non-critical — fallback to general guide without plan context.
      const detail = err instanceof Error ? err.message : 'unknown_error';
      this.logger.warn(
        `Plan feature resolution failed — chat will proceed without plan context. reason=${detail}`,
        HelpChatUseCase.name,
      );
      return undefined;
    }
  }
}
