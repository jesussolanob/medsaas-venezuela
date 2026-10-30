import { Inject, Injectable } from '@nestjs/common';
import {
  DOCTOR_PROMPT_REPOSITORY,
  type IDoctorPromptRepository,
} from '../../domain/repositories/idoctor-prompt.repository';
import type { DoctorPrompt } from '../../domain/entities/doctor-prompt.entity';

/**
 * DismissPromptUseCase
 *
 * Called when a doctor clicks "No me interesa" on the "Queremos conocerte" modal.
 * Permanently dismisses the prompt — it will never appear again.
 */
@Injectable()
export class DismissPromptUseCase {
  constructor(
    @Inject(DOCTOR_PROMPT_REPOSITORY)
    private readonly repo: IDoctorPromptRepository,
  ) {}

  async execute(doctorId: string, promptKey: string): Promise<DoctorPrompt> {
    return this.repo.recordDismiss(doctorId, promptKey, new Date());
  }
}
