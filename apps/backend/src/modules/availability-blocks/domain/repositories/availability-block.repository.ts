import type { AvailabilityBlock } from '../entities/availability-block.entity';

export const AVAILABILITY_BLOCK_REPOSITORY = Symbol('IAvailabilityBlockRepository');

export interface ListBlocksFilter {
  /** Inclusive start of the range filter. Optional. */
  from?: Date;
  /** Inclusive end of the range filter. Optional. */
  to?: Date;
}

export interface IAvailabilityBlockRepository {
  /** Returns all blocks for the given doctor, optionally filtered by date range. */
  findByDoctor(doctorId: string, filter?: ListBlocksFilter): Promise<AvailabilityBlock[]>;

  /** Returns blocks that overlap the given range for a specific doctor. */
  findOverlapping(doctorId: string, rangeStart: Date, rangeEnd: Date): Promise<AvailabilityBlock[]>;

  /** Persists a new block and returns the saved entity. */
  create(block: AvailabilityBlock): Promise<AvailabilityBlock>;

  /** Finds a block by id (any doctor). Returns null if not found. */
  findById(id: string): Promise<AvailabilityBlock | null>;

  /** Hard-deletes a block. */
  delete(id: string): Promise<void>;
}
