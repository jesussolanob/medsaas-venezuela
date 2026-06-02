import { Inject, Injectable } from '@nestjs/common';
import { EhrRecord } from '../../../domain/entities/ehr-record.entity';
import { EhrRecordNotFoundError } from '../../../domain/errors/ehr-record-not-found.error';
import { EhrRecordNotOwnedError } from '../../../domain/errors/ehr-record-not-owned.error';
import { IEhrRepository, EHR_REPOSITORY } from '../../../domain/repositories/ehr.repository';

export interface UpdateEhrRecordInput {
  ehrId: string;
  doctorId: string;
  diagnosis?: string | null;
  treatmentPlan?: string | null;
}

/**
 * Updates clinical fields on an existing EHR record.
 *
 * SECURITY: ownership is enforced — only the owning doctor can modify a record.
 */
@Injectable()
export class UpdateEhrRecordUseCase {
  constructor(
    @Inject(EHR_REPOSITORY)
    private readonly repo: IEhrRepository,
  ) {}

  async execute(input: UpdateEhrRecordInput): Promise<EhrRecord> {
    const record = await this.repo.findById(input.ehrId, input.doctorId);
    if (!record) {
      throw new EhrRecordNotFoundError();
    }
    // Defense-in-depth ownership check (see GetEhrByIdUseCase for rationale).
    if (!record.canBeModifiedBy(input.doctorId)) {
      throw new EhrRecordNotOwnedError();
    }

    return this.repo.update(input.ehrId, input.doctorId, {
      diagnosis: input.diagnosis,
      treatmentPlan: input.treatmentPlan,
    });
  }
}
