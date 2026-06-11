import { DeleteAvailabilityBlockUseCase } from './delete-availability-block.use-case';
import type { IAvailabilityBlockRepository } from '../../../domain/repositories/availability-block.repository';
import { AvailabilityBlockNotFoundError } from '../../../domain/errors/availability-block-not-found.error';
import { AvailabilityBlock } from '../../../domain/entities/availability-block.entity';

const DOCTOR_ID = 'doctor-uuid-1';
const BLOCK_ID = 'block-001';

function makeBlock(doctorId = DOCTOR_ID): AvailabilityBlock {
  return AvailabilityBlock.create({
    id: BLOCK_ID,
    doctorId,
    startsAt: new Date('2026-06-15T13:00:00.000Z'),
    endsAt: new Date('2026-06-15T16:00:00.000Z'),
    reason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function makeRepo(): jest.Mocked<IAvailabilityBlockRepository> {
  return {
    findByDoctor: jest.fn(),
    findOverlapping: jest.fn(),
    create: jest.fn(),
    findById: jest.fn(),
    delete: jest.fn(),
  };
}

describe('DeleteAvailabilityBlockUseCase', () => {
  let useCase: DeleteAvailabilityBlockUseCase;
  let repo: jest.Mocked<IAvailabilityBlockRepository>;

  beforeEach(() => {
    repo = makeRepo();
    useCase = new DeleteAvailabilityBlockUseCase(repo);
  });

  it('deletes a block when the actor is the owner', async () => {
    repo.findById.mockResolvedValue(makeBlock(DOCTOR_ID));
    repo.delete.mockResolvedValue(undefined);

    await useCase.execute({ blockId: BLOCK_ID, actorId: DOCTOR_ID });

    expect(repo.delete).toHaveBeenCalledWith(BLOCK_ID);
  });

  it('throws AvailabilityBlockNotFoundError when block does not exist', async () => {
    repo.findById.mockResolvedValue(null);

    await expect(useCase.execute({ blockId: BLOCK_ID, actorId: DOCTOR_ID })).rejects.toBeInstanceOf(
      AvailabilityBlockNotFoundError,
    );

    expect(repo.delete).not.toHaveBeenCalled();
  });

  it('throws AvailabilityBlockNotFoundError when block belongs to another doctor (anti-IDOR)', async () => {
    repo.findById.mockResolvedValue(makeBlock('other-doctor-id'));

    await expect(useCase.execute({ blockId: BLOCK_ID, actorId: DOCTOR_ID })).rejects.toBeInstanceOf(
      AvailabilityBlockNotFoundError,
    );

    expect(repo.delete).not.toHaveBeenCalled();
  });
});
