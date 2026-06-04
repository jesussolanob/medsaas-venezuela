import { Inject, Injectable } from '@nestjs/common';
import { ILeadRepository, LEAD_REPOSITORY } from '../../../domain/repositories/lead.repository';
import { LeadNotFoundError } from '../../../domain/errors/lead-not-found.error';
import type { Lead, LeadStage } from '../../../domain/entities/lead.entity';

export interface UpdateLeadStageInput {
  leadId: string;
  doctorId: string;
  stage: LeadStage;
}

@Injectable()
export class UpdateLeadStageUseCase {
  constructor(
    @Inject(LEAD_REPOSITORY)
    private readonly leadRepo: ILeadRepository,
  ) {}

  async execute(input: UpdateLeadStageInput): Promise<Lead> {
    const existing = await this.leadRepo.findByIdForDoctor(input.leadId, input.doctorId);
    if (!existing) {
      throw new LeadNotFoundError();
    }

    // Validates the target stage is a recognised value (throws LeadInvalidStageError otherwise).
    existing.moveToStage(input.stage);

    return this.leadRepo.save(input.leadId, input.doctorId, {
      stage: input.stage,
      lastActivity: new Date(),
    });
  }
}
