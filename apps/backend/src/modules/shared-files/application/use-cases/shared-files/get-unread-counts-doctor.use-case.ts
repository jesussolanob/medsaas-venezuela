import { Inject, Injectable } from '@nestjs/common';
import {
  SHARED_FILE_REPOSITORY,
  type ISharedFileRepository,
  type UnreadCountsResult,
} from '../../../domain/repositories/shared-file.repository';

export interface GetUnreadCountsDoctorInput {
  doctorId: string;
}

/**
 * Returns a map of patientId → number of unread items (created_by='patient',
 * read_by_doctor=false) for the given doctor. Used for badge counts in the
 * patient list sidebar.
 */
@Injectable()
export class GetUnreadCountsDoctorUseCase {
  constructor(
    @Inject(SHARED_FILE_REPOSITORY)
    private readonly sharedFileRepo: ISharedFileRepository,
  ) {}

  async execute(input: GetUnreadCountsDoctorInput): Promise<UnreadCountsResult> {
    return this.sharedFileRepo.getUnreadCountsByDoctor(input.doctorId);
  }
}
