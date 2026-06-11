import { ListAvailabilityBlocksUseCase } from './list-availability-blocks.use-case';
import type { IAvailabilityBlockRepository } from '../../../domain/repositories/availability-block.repository';
import { AvailabilityBlock } from '../../../domain/entities/availability-block.entity';

const DOCTOR_ID = 'doctor-uuid-1';

function makeBlock(id = 'block-001'): AvailabilityBlock {
  return AvailabilityBlock.create({
    id,
    doctorId: DOCTOR_ID,
    startsAt: new Date('2026-06-15T13:00:00.000Z'),
    endsAt: new Date('2026-06-15T16:00:00.000Z'),
    reason: null,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
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

describe('ListAvailabilityBlocksUseCase', () => {
  let useCase: ListAvailabilityBlocksUseCase;
  let repo: jest.Mocked<IAvailabilityBlockRepository>;

  beforeEach(() => {
    repo = makeRepo();
    useCase = new ListAvailabilityBlocksUseCase(repo);
  });

  it('returns blocks for the given doctor without date filter', async () => {
    const blocks = [makeBlock('b-1'), makeBlock('b-2')];
    repo.findByDoctor.mockResolvedValue(blocks);

    const result = await useCase.execute({ doctorId: DOCTOR_ID });

    expect(result).toHaveLength(2);
    expect(repo.findByDoctor).toHaveBeenCalledWith(DOCTOR_ID, { from: undefined, to: undefined });
  });

  it('passes date filter through to the repository', async () => {
    const from = new Date('2026-06-01T00:00:00.000Z');
    const to = new Date('2026-06-30T23:59:59.000Z');
    repo.findByDoctor.mockResolvedValue([]);

    await useCase.execute({ doctorId: DOCTOR_ID, from, to });

    expect(repo.findByDoctor).toHaveBeenCalledWith(DOCTOR_ID, { from, to });
  });

  it('returns empty array when doctor has no blocks', async () => {
    repo.findByDoctor.mockResolvedValue([]);

    const result = await useCase.execute({ doctorId: DOCTOR_ID });

    expect(result).toEqual([]);
  });
});
