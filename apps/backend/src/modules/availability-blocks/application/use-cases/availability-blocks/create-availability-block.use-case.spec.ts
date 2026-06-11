import { CreateAvailabilityBlockUseCase } from './create-availability-block.use-case';
import type { IAvailabilityBlockRepository } from '../../../domain/repositories/availability-block.repository';
import { BlockEndsBeforeStartsError } from '../../../domain/errors/block-ends-before-starts.error';
import { AvailabilityBlock } from '../../../domain/entities/availability-block.entity';

const DOCTOR_ID = 'doctor-uuid-1';

function makeRepo(): jest.Mocked<IAvailabilityBlockRepository> {
  return {
    findByDoctor: jest.fn(),
    findOverlapping: jest.fn(),
    create: jest.fn(),
    findById: jest.fn(),
    delete: jest.fn(),
  };
}

function makeSavedBlock(startsAt: Date, endsAt: Date): AvailabilityBlock {
  return AvailabilityBlock.create({
    id: 'saved-id',
    doctorId: DOCTOR_ID,
    startsAt,
    endsAt,
    reason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('CreateAvailabilityBlockUseCase', () => {
  let useCase: CreateAvailabilityBlockUseCase;
  let repo: jest.Mocked<IAvailabilityBlockRepository>;

  beforeEach(() => {
    repo = makeRepo();
    useCase = new CreateAvailabilityBlockUseCase(repo);
  });

  it('creates a block and returns the saved entity', async () => {
    const startsAt = new Date('2026-06-20T13:00:00.000Z');
    const endsAt = new Date('2026-06-20T16:00:00.000Z');
    repo.create.mockResolvedValue(makeSavedBlock(startsAt, endsAt));

    const result = await useCase.execute({ doctorId: DOCTOR_ID, startsAt, endsAt });

    expect(result.doctorId).toBe(DOCTOR_ID);
    expect(result.startsAt).toEqual(startsAt);
    expect(result.endsAt).toEqual(endsAt);
    expect(repo.create).toHaveBeenCalledTimes(1);
  });

  it('passes reason to the repository', async () => {
    const startsAt = new Date('2026-06-20T08:00:00.000Z');
    const endsAt = new Date('2026-06-20T18:00:00.000Z');
    const saved = makeSavedBlock(startsAt, endsAt);
    repo.create.mockResolvedValue(saved);

    await useCase.execute({ doctorId: DOCTOR_ID, startsAt, endsAt, reason: 'Vacation' });

    const passedBlock = repo.create.mock.calls[0]?.[0];
    expect(passedBlock?.reason).toBe('Vacation');
  });

  it('throws BlockEndsBeforeStartsError when ends_at <= starts_at', async () => {
    const startsAt = new Date('2026-06-20T16:00:00.000Z');
    const endsAt = new Date('2026-06-20T13:00:00.000Z');

    await expect(useCase.execute({ doctorId: DOCTOR_ID, startsAt, endsAt })).rejects.toBeInstanceOf(
      BlockEndsBeforeStartsError,
    );

    expect(repo.create).not.toHaveBeenCalled();
  });

  it('throws BlockEndsBeforeStartsError when ends_at equals starts_at', async () => {
    const same = new Date('2026-06-20T13:00:00.000Z');

    await expect(
      useCase.execute({ doctorId: DOCTOR_ID, startsAt: same, endsAt: same }),
    ).rejects.toBeInstanceOf(BlockEndsBeforeStartsError);
  });

  it('creates a full-day block (00:00–23:59:59)', async () => {
    const startsAt = new Date('2026-06-21T00:00:00.000Z');
    const endsAt = new Date('2026-06-21T23:59:59.000Z');
    repo.create.mockResolvedValue(makeSavedBlock(startsAt, endsAt));

    const result = await useCase.execute({ doctorId: DOCTOR_ID, startsAt, endsAt });

    expect(result.isFullDay()).toBe(true);
  });
});
