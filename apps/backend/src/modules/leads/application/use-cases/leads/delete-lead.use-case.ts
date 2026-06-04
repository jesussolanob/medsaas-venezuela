import { Inject, Injectable } from '@nestjs/common';
import { ILeadRepository, LEAD_REPOSITORY } from '../../../domain/repositories/lead.repository';
import { LeadNotFoundError } from '../../../domain/errors/lead-not-found.error';

export interface DeleteLeadInput {
  leadId: string;
  doctorId: string;
}

@Injectable()
export class DeleteLeadUseCase {
  constructor(
    @Inject(LEAD_REPOSITORY)
    private readonly leadRepo: ILeadRepository,
  ) {}

  async execute(input: DeleteLeadInput): Promise<void> {
    const existing = await this.leadRepo.findByIdForDoctor(input.leadId, input.doctorId);
    if (!existing) {
      throw new LeadNotFoundError();
    }

    await this.leadRepo.delete(input.leadId, input.doctorId);
  }
}
