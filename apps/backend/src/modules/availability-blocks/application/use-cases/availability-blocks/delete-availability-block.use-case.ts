import { Inject, Injectable } from '@nestjs/common';
import {
  AVAILABILITY_BLOCK_REPOSITORY,
  type IAvailabilityBlockRepository,
} from '../../../domain/repositories/availability-block.repository';
import { AvailabilityBlockNotFoundError } from '../../../domain/errors/availability-block-not-found.error';

export interface DeleteBlockInput {
  blockId: string;
  /** Actor's doctor id — used for anti-IDOR ownership check. */
  actorId: string;
}

@Injectable()
export class DeleteAvailabilityBlockUseCase {
  constructor(
    @Inject(AVAILABILITY_BLOCK_REPOSITORY)
    private readonly blockRepo: IAvailabilityBlockRepository,
  ) {}

  async execute(input: DeleteBlockInput): Promise<void> {
    const block = await this.blockRepo.findById(input.blockId);

    // Return 404 for both "not found" and "wrong owner" — prevents enumeration
    if (!block || !block.isOwnedBy(input.actorId)) {
      throw new AvailabilityBlockNotFoundError();
    }

    await this.blockRepo.delete(input.blockId);
  }
}
