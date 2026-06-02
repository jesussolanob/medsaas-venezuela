import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { EhrRecord } from '../../../domain/entities/ehr-record.entity';
import { IEhrRepository, EHR_REPOSITORY } from '../../../domain/repositories/ehr.repository';

export interface CreateEhrRecordInput {
  doctorId: string;
  patientId: string;
  consultationId?: string | null;
  diagnosis?: string | null;
  treatmentPlan?: string | null;
}

/**
 * Creates a new EHR record linked to a patient (and optionally a consultation).
 *
 * SECURITY: doctorId is always taken from the authenticated user token — never
 * from the request body.
 */
@Injectable()
export class CreateEhrRecordUseCase {
  constructor(
    @Inject(EHR_REPOSITORY)
    private readonly repo: IEhrRepository,
  ) {}

  async execute(input: CreateEhrRecordInput): Promise<EhrRecord> {
    const now = new Date();
    const record = EhrRecord.create({
      id: randomUUID(),
      doctorId: input.doctorId,
      patientId: input.patientId,
      consultationId: input.consultationId ?? null,
      diagnosis: input.diagnosis ?? null,
      treatmentPlan: input.treatmentPlan ?? null,
      createdAt: now,
      updatedAt: now,
    });

    return this.repo.save(record);
  }
}
