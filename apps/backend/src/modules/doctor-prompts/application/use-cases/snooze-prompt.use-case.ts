import { Inject, Injectable } from '@nestjs/common';
import {
  DOCTOR_PROMPT_REPOSITORY,
  type IDoctorPromptRepository,
} from '../../domain/repositories/idoctor-prompt.repository';
import type { DoctorPrompt } from '../../domain/entities/doctor-prompt.entity';

const DEFAULT_SNOOZE_DAYS = 1;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * SnoozePromptUseCase
 *
 * Called when a doctor clicks "Ahora no" on the "Queremos conocerte" modal.
 * Snoozes the prompt for meeting_prompt_snooze_days days (default: 1).
 */
@Injectable()
export class SnoozePromptUseCase {
  constructor(
    @Inject(DOCTOR_PROMPT_REPOSITORY)
    private readonly repo: IDoctorPromptRepository,
  ) {}

  async execute(doctorId: string, promptKey: string): Promise<DoctorPrompt> {
    const now = new Date();
    const settings = await this.repo.getSettings(['meeting_prompt_snooze_days']);
    const settingsMap = new Map(settings.map((s) => [s.key, s.value]));

    const snoozeDays = parseInt(
      settingsMap.get('meeting_prompt_snooze_days') ?? String(DEFAULT_SNOOZE_DAYS),
      10,
    );

    const snoozedUntil = new Date(now.getTime() + snoozeDays * MS_PER_DAY);

    return this.repo.recordSnooze(doctorId, promptKey, snoozedUntil, now);
  }
}
