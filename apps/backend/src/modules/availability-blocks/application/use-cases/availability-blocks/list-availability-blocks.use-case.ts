import { Inject, Injectable } from '@nestjs/common';
import {
  AVAILABILITY_BLOCK_REPOSITORY,
  type IAvailabilityBlockRepository,
} from '../../../domain/repositories/availability-block.repository';
import type { AvailabilityBlock } from '../../../domain/entities/availability-block.entity';

export interface ListBlocksInput {
  doctorId: string;
  from?: Date;
  to?: Date;
}

@Injectable()
export class ListAvailabilityBlocksUseCase {
  constructor(
    @Inject(AVAILABILITY_BLOCK_REPOSITORY)
    private readonly blockRepo: IAvailabilityBlockRepository,
  ) {}

  async execute(input: ListBlocksInput): Promise<AvailabilityBlock[]> {
    return this.blockRepo.findByDoctor(input.doctorId, {
      from: input.from,
      to: input.to,
    });
  }
}
