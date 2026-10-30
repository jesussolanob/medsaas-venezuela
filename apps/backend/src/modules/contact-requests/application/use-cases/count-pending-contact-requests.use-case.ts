import { Inject, Injectable } from '@nestjs/common';
import {
  CONTACT_REQUEST_REPOSITORY,
  type IContactRequestRepository,
} from '../../domain/repositories/icontact-request.repository';

/**
 * Returns the total number of pending contact requests.
 * Used by the admin bell/badge indicator.
 */
@Injectable()
export class CountPendingContactRequestsUseCase {
  constructor(
    @Inject(CONTACT_REQUEST_REPOSITORY)
    private readonly repo: IContactRequestRepository,
  ) {}

  async execute(): Promise<number> {
    return this.repo.countPending();
  }
}
