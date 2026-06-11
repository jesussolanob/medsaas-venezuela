import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  AVAILABILITY_BLOCK_REPOSITORY,
  type IAvailabilityBlockRepository,
} from '../../../domain/repositories/availability-block.repository';
import { AvailabilityBlock } from '../../../domain/entities/availability-block.entity';
import { BlockEndsBeforeStartsError } from '../../../domain/errors/block-ends-before-starts.error';

export interface CreateBlockInput {
  doctorId: string;
  startsAt: Date;
  endsAt: Date;
  reason?: string | null;
}

@Injectable()
export class CreateAvailabilityBlockUseCase {
  constructor(
    @Inject(AVAILABILITY_BLOCK_REPOSITORY)
    private readonly blockRepo: IAvailabilityBlockRepository,
  ) {}

  async execute(input: CreateBlockInput): Promise<AvailabilityBlock> {
    // Domain invariant: ends_at must be strictly after starts_at
    if (input.endsAt <= input.startsAt) {
      throw new BlockEndsBeforeStartsError();
    }

    const now = new Date();
    const block = AvailabilityBlock.create({
      id: randomUUID(),
      doctorId: input.doctorId,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      reason: input.reason ?? null,
      createdAt: now,
      updatedAt: now,
    });

    return this.blockRepo.create(block);
  }
}
