import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Lead, LeadStage } from '../../../domain/entities/lead.entity';
import { ILeadRepository, LEAD_REPOSITORY } from '../../../domain/repositories/lead.repository';

export interface CreateLeadInput {
  doctorId: string;
  name: string;
  phone?: string | null;
  channel?: string | null;
  stage?: LeadStage;
  message?: string | null;
  source?: string | null;
}

@Injectable()
export class CreateLeadUseCase {
  constructor(
    @Inject(LEAD_REPOSITORY)
    private readonly leadRepo: ILeadRepository,
  ) {}

  async execute(input: CreateLeadInput): Promise<Lead> {
    const now = new Date();
    const lead = Lead.create({
      id: randomUUID(),
      doctorId: input.doctorId,
      name: input.name,
      phone: input.phone ?? null,
      channel: input.channel ?? null,
      stage: input.stage ?? 'new',
      message: input.message ?? null,
      source: input.source ?? null,
      status: null,
      lastActivity: now,
      createdAt: now,
      updatedAt: now,
    });

    return this.leadRepo.create(lead);
  }
}
