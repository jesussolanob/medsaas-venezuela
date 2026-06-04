import { Inject, Injectable } from '@nestjs/common';
import { ILeadRepository, LEAD_REPOSITORY } from '../../../domain/repositories/lead.repository';
import { LeadNotFoundError } from '../../../domain/errors/lead-not-found.error';
import type { Lead } from '../../../domain/entities/lead.entity';

export interface UpdateLeadInput {
  leadId: string;
  doctorId: string;
  name?: string;
  phone?: string | null;
  channel?: string | null;
  message?: string | null;
}

@Injectable()
export class UpdateLeadUseCase {
  constructor(
    @Inject(LEAD_REPOSITORY)
    private readonly leadRepo: ILeadRepository,
  ) {}

  async execute(input: UpdateLeadInput): Promise<Lead> {
    const existing = await this.leadRepo.findByIdForDoctor(input.leadId, input.doctorId);
    if (!existing) {
      throw new LeadNotFoundError();
    }

    const fields: {
      name?: string;
      phone?: string | null;
      channel?: string | null;
      message?: string | null;
    } = {};
    if (input.name !== undefined) fields.name = input.name;
    if (input.phone !== undefined) fields.phone = input.phone;
    if (input.channel !== undefined) fields.channel = input.channel;
    if (input.message !== undefined) fields.message = input.message;

    return this.leadRepo.save(input.leadId, input.doctorId, fields);
  }
}
