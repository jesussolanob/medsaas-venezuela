import { Inject, Injectable } from '@nestjs/common';
import {
  DOCTOR_PROMPT_REPOSITORY,
  type IDoctorPromptRepository,
} from '../../domain/repositories/idoctor-prompt.repository';
import type { DoctorPrompt } from '../../domain/entities/doctor-prompt.entity';

/**
 * RecordPromptShownUseCase
 *
 * Called when a doctor sees the "Queremos conocerte" modal.
 * Increments shown_count and updates first_shown_at / last_shown_at.
 * Creates the row on first call (upsert).
 */
@Injectable()
export class RecordPromptShownUseCase {
  constructor(
    @Inject(DOCTOR_PROMPT_REPOSITORY)
    private readonly repo: IDoctorPromptRepository,
  ) {}

  async execute(doctorId: string, promptKey: string): Promise<DoctorPrompt> {
    return this.repo.recordShown(doctorId, promptKey, new Date());
  }
}
