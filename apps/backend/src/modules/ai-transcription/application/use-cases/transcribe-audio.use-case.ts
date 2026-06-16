import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { TRANSCRIPTION_PORT, type ITranscriptionPort } from '../ports/transcription.port';
import {
  AI_REQUEST_LOG_REPOSITORY,
  type IAiRequestLogRepository,
} from '../../domain/repositories/ai-request-log.repository';
import {
  PLAN_FEATURES_REPOSITORY,
  type IPlanFeaturesRepository,
} from '../../../doctor-settings/domain/repositories/plan-features.repository';
import {
  DOCTOR_PROFILE_REPOSITORY,
  type IDoctorProfileRepository,
} from '../../../doctor-settings/domain/repositories/doctor-profile.repository';
import {
  PLAN_CONFIG_REPOSITORY,
  type IPlanConfigRepository,
} from '../../../doctor-settings/domain/repositories/plan-config.repository';
import { AiRequestLog } from '../../domain/entities/ai-request-log.entity';
import { TranscriptionFeatureDeniedError } from '../../domain/errors/transcription-feature-denied.error';
import type {
  TranscribeAudioInputDto,
  TranscribeAudioOutputDto,
} from '../dtos/transcribe-audio.dto';

const AI_TRANSCRIPTION_FEATURE = 'ai_transcription';
const DOCTOR_ROLE = 'doctor';

/**
 * TranscribeAudioUseCase
 *
 * Orchestrates:
 *   1. Plan-gate (FAIL-CLOSED) — deny if feature disabled or plan check fails.
 *   2. Transcription via ITranscriptionPort (Gemini adapter).
 *   3. Audit log (ai_request_log) — NEVER stores PHI.
 *
 * super_admin bypasses plan gate.
 */
@Injectable()
export class TranscribeAudioUseCase {
  private readonly logger = new Logger(TranscribeAudioUseCase.name);

  constructor(
    @Inject(TRANSCRIPTION_PORT)
    private readonly transcriptionPort: ITranscriptionPort,
    @Inject(AI_REQUEST_LOG_REPOSITORY)
    private readonly logRepo: IAiRequestLogRepository,
    @Inject(PLAN_FEATURES_REPOSITORY)
    private readonly featuresRepo: IPlanFeaturesRepository,
    @Inject(DOCTOR_PROFILE_REPOSITORY)
    private readonly profileRepo: IDoctorProfileRepository,
    @Inject(PLAN_CONFIG_REPOSITORY)
    private readonly planConfigRepo: IPlanConfigRepository,
  ) {}

  async execute(input: TranscribeAudioInputDto): Promise<TranscribeAudioOutputDto> {
    // 1. Plan gate — fail-closed; super_admin bypasses.
    if (!input.isSuperAdmin) {
      await this.assertPlanFeature(input.doctorId);
    }

    // 2. Transcribe via port.
    let status = 'success';
    let usedModel = '';

    try {
      const portOutput = await this.transcriptionPort.transcribe({
        audioBuffer: input.audioBuffer,
        mimeType: input.mimeType,
        availableBlocks: input.availableBlocks,
        language: input.language,
      });

      usedModel = portOutput.model;

      // 3. Audit log — write before returning.
      await this.writeAuditLog(input.doctorId, status, input.audioBytes, usedModel);

      return {
        transcript: portOutput.transcript,
        suggestions: portOutput.suggestions,
      };
    } catch (err) {
      status = 'error';
      await this.writeAuditLog(input.doctorId, status, input.audioBytes, usedModel);
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Asserts that the doctor's current effective plan includes ai_transcription.
   * FAIL-CLOSED: any exception during plan resolution → 403.
   */
  private async assertPlanFeature(doctorId: string): Promise<void> {
    try {
      const effectivePlan = await this.resolveEffectivePlan(doctorId);
      const features = await this.featuresRepo.findByPlan(effectivePlan);
      const feature = features.find((f) => f.featureKey === AI_TRANSCRIPTION_FEATURE);

      if (!feature || !feature.enabled) {
        throw new TranscriptionFeatureDeniedError('plan_not_included');
      }
    } catch (err) {
      if (err instanceof TranscriptionFeatureDeniedError) {
        throw err;
      }
      // Any unexpected error during plan check → deny access (fail-closed).
      this.logger.warn(
        `[TranscribeAudioUseCase][assertPlanFeature] plan check failed for doctor ${doctorId}`,
      );
      throw new TranscriptionFeatureDeniedError('plan_check_failed');
    }
  }

  /**
   * Resolves the effective plan key for the doctor, applying lazy-downgrade logic.
   * Mirrors the logic in GetDoctorFeaturesV2UseCase to avoid coupling.
   */
  private async resolveEffectivePlan(doctorId: string): Promise<string> {
    const profile = await this.profileRepo.findByDoctorId(doctorId);
    if (!profile) {
      // Doctor not found → deny (fail-closed).
      throw new TranscriptionFeatureDeniedError('plan_check_failed');
    }

    const storedPlan = profile.plan ?? 'delta_free';

    // Is it a permanent plan?
    const planConfig = await this.planConfigRepo.findByKey(storedPlan);
    if (planConfig?.isPermanent) {
      return storedPlan;
    }

    // Active / trial → no downgrade.
    const validStatuses = new Set(['active', 'trial', 'trialing']);
    if (profile.subscriptionStatus && validStatuses.has(profile.subscriptionStatus)) {
      return storedPlan;
    }

    // Expired/suspended → fall back to permanent plan for the role.
    const roleKey = planConfig?.roleKey ?? DOCTOR_ROLE;
    const permanentPlan = await this.planConfigRepo.findPermanentPlanForRole(roleKey);
    return permanentPlan?.planKey ?? 'delta_free';
  }

  /** Writes an audit log entry. Non-blocking — errors are swallowed. */
  private async writeAuditLog(
    doctorId: string,
    status: string,
    audioBytes: number,
    model: string,
  ): Promise<void> {
    try {
      const log = AiRequestLog.create({
        id: randomUUID(),
        doctorId,
        feature: 'transcription',
        status,
        audioBytes,
        model,
      });
      await this.logRepo.save(log);
    } catch {
      // Audit failures must never break the main flow.
      this.logger.warn('[TranscribeAudioUseCase][writeAuditLog] failed to persist audit log');
    }
  }
}
