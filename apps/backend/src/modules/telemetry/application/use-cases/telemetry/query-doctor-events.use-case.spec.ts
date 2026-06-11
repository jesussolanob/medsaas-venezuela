import { QueryDoctorEventsUseCase } from './query-doctor-events.use-case';
import type { IActionEventRepository } from '../../../domain/repositories/action-event.repository';
import type { ActionEvent } from '../../../domain/entities/action-event.entity';

const DOCTOR_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

function makeRepo(
  overrides: Partial<IActionEventRepository> = {},
): jest.Mocked<IActionEventRepository> {
  return {
    bulkInsert: jest.fn(),
    findByDoctor: jest.fn().mockResolvedValue({
      items: [] as ActionEvent[],
      total: 0,
      limit: 50,
      offset: 0,
    }),
    ...overrides,
  } as jest.Mocked<IActionEventRepository>;
}

describe('QueryDoctorEventsUseCase', () => {
  let useCase: QueryDoctorEventsUseCase;
  let repo: jest.Mocked<IActionEventRepository>;

  beforeEach(() => {
    repo = makeRepo();
    useCase = new QueryDoctorEventsUseCase(repo);
  });

  it('delegates to repository with correct filters', async () => {
    const dto = {
      doctorId: DOCTOR_ID,
      from: '2026-06-01T00:00:00.000Z',
      to: '2026-06-30T23:59:59.000Z',
      limit: 20,
      offset: 40,
    };

    await useCase.execute(dto);

    expect(repo.findByDoctor).toHaveBeenCalledWith({
      doctorId: DOCTOR_ID,
      from: new Date('2026-06-01T00:00:00.000Z'),
      to: new Date('2026-06-30T23:59:59.000Z'),
      limit: 20,
      offset: 40,
    });
  });

  it('passes undefined for from/to when not provided', async () => {
    const dto = { doctorId: DOCTOR_ID, limit: 50, offset: 0 };

    await useCase.execute(dto);

    expect(repo.findByDoctor).toHaveBeenCalledWith({
      doctorId: DOCTOR_ID,
      from: undefined,
      to: undefined,
      limit: 50,
      offset: 0,
    });
  });

  it('returns the result from the repository', async () => {
    const mockResult = {
      items: [] as ActionEvent[],
      total: 42,
      limit: 50,
      offset: 0,
    };
    repo = makeRepo({ findByDoctor: jest.fn().mockResolvedValue(mockResult) });
    useCase = new QueryDoctorEventsUseCase(repo);

    const result = await useCase.execute({ doctorId: DOCTOR_ID, limit: 50, offset: 0 });

    expect(result).toEqual(mockResult);
  });

  it('passes only from when to is omitted', async () => {
    const dto = {
      doctorId: DOCTOR_ID,
      from: '2026-06-01T00:00:00.000Z',
      limit: 50,
      offset: 0,
    };

    await useCase.execute(dto);

    const call = repo.findByDoctor.mock.calls[0]!;
    expect(call[0]!.from).toEqual(new Date('2026-06-01T00:00:00.000Z'));
    expect(call[0]!.to).toBeUndefined();
  });
});
