import { Inject, Injectable } from '@nestjs/common';
import { EhrRecord } from '../../../domain/entities/ehr-record.entity';
import { EhrRecordNotFoundError } from '../../../domain/errors/ehr-record-not-found.error';
import { EhrRecordNotOwnedError } from '../../../domain/errors/ehr-record-not-owned.error';
import { IEhrRepository, EHR_REPOSITORY } from '../../../domain/repositories/ehr.repository';

export interface GetEhrByIdInput {
  ehrId: string;
  doctorId: string;
}

/**
 * Returns a single EHR record by ID.
 *
 * SECURITY: ownership is enforced — a doctor can only access their own records.
 */
@Injectable()
export class GetEhrByIdUseCase {
  constructor(
    @Inject(EHR_REPOSITORY)
    private readonly repo: IEhrRepository,
  ) {}

  async execute(input: GetEhrByIdInput): Promise<EhrRecord> {
    const record = await this.repo.findById(input.ehrId, input.doctorId);
    if (!record) {
      throw new EhrRecordNotFoundError();
    }
    // Defense-in-depth: findById already scopes by doctorId, but we enforce
    // ownership explicitly so any future repo change cannot bypass this check.
    if (!record.canBeModifiedBy(input.doctorId)) {
      throw new EhrRecordNotOwnedError();
    }
    return record;
  }
}
