import { Inject, Injectable } from '@nestjs/common';
import { ILeadRepository, LEAD_REPOSITORY } from '../../../domain/repositories/lead.repository';
import type { Lead, LeadStage } from '../../../domain/entities/lead.entity';

export interface ListLeadsInput {
  doctorId: string;
  stage?: LeadStage;
}

@Injectable()
export class ListLeadsUseCase {
  constructor(
    @Inject(LEAD_REPOSITORY)
    private readonly leadRepo: ILeadRepository,
  ) {}

  async execute(input: ListLeadsInput): Promise<Lead[]> {
    return this.leadRepo.list({ doctorId: input.doctorId, stage: input.stage });
  }
}
