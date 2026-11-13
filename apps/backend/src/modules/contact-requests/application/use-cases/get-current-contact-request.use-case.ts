import { Inject, Injectable } from '@nestjs/common';
import {
  CONTACT_REQUEST_REPOSITORY,
  type IContactRequestRepository,
} from '../../domain/repositories/icontact-request.repository';

export interface CurrentContactRequestOutput {
  id: string;
  channel: string;
  message: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Returns the current pending contact request for the doctor, or null if none.
 */
@Injectable()
export class GetCurrentContactRequestUseCase {
  constructor(
    @Inject(CONTACT_REQUEST_REPOSITORY)
    private readonly repo: IContactRequestRepository,
  ) {}

  async execute(doctorId: string): Promise<CurrentContactRequestOutput | null> {
    const request = await this.repo.findPendingByDoctorId(doctorId);
    if (!request) return null;

    return {
      id: request.id,
      channel: request.channel,
      message: request.message,
      status: request.status,
      createdAt: request.createdAt.toISOString(),
      updatedAt: request.updatedAt.toISOString(),
    };
  }
}
