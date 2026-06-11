import { QueryTelemetrySessionsUseCase } from './query-telemetry-sessions.use-case';
import type { ITelemetrySessionRepository } from '../../../domain/repositories/telemetry-session.repository';
import type { TelemetrySession } from '../../../domain/entities/telemetry-session.entity';

const DOCTOR_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

function makeRepo(
  overrides: Partial<ITelemetrySessionRepository> = {},
): jest.Mocked<ITelemetrySessionRepository> {
  return {
    findBySessionId: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    findAll: jest.fn().mockResolvedValue({
      items: [] as TelemetrySession[],
      total: 0,
      limit: 50,
      offset: 0,
    }),
    ...overrides,
  } as jest.Mocked<ITelemetrySessionRepository>;
}

describe('QueryTelemetrySessionsUseCase', () => {
  let useCase: QueryTelemetrySessionsUseCase;
  let repo: jest.Mocked<ITelemetrySessionRepository>;

  beforeEach(() => {
    repo = makeRepo();
    useCase = new QueryTelemetrySessionsUseCase(repo);
  });

  it('delegates to repository with correct filters including dates', async () => {
    const dto = {
      doctorId: DOCTOR_ID,
      from: '2026-06-01T00:00:00.000Z',
      to: '2026-06-30T23:59:59.000Z',
      limit: 20,
      offset: 40,
    };

    await useCase.execute(dto);

    expect(repo.findAll).toHaveBeenCalledWith({
      doctorId: DOCTOR_ID,
      from: new Date('2026-06-01T00:00:00.000Z'),
      to: new Date('2026-06-30T23:59:59.000Z'),
      limit: 20,
      offset: 40,
    });
  });

  it('passes undefined for from/to when not provided', async () => {
    const dto = { limit: 50, offset: 0 };

    await useCase.execute(dto);

    expect(repo.findAll).toHaveBeenCalledWith({
      doctorId: undefined,
      from: undefined,
      to: undefined,
      limit: 50,
      offset: 0,
    });
  });

  it('passes undefined for doctorId when not provided', async () => {
    await useCase.execute({ limit: 10, offset: 0 });

    const call = repo.findAll.mock.calls[0]![0]!;
    expect(call.doctorId).toBeUndefined();
  });

  it('returns the result from the repository unchanged', async () => {
    const mockResult = {
      items: [] as TelemetrySession[],
      total: 42,
      limit: 50,
      offset: 0,
    };
    repo = makeRepo({ findAll: jest.fn().mockResolvedValue(mockResult) });
    useCase = new QueryTelemetrySessionsUseCase(repo);

    const result = await useCase.execute({ limit: 50, offset: 0 });

    expect(result).toEqual(mockResult);
  });

  it('passes only from when to is omitted', async () => {
    const dto = {
      from: '2026-06-01T00:00:00.000Z',
      limit: 50,
      offset: 0,
    };

    await useCase.execute(dto);

    const call = repo.findAll.mock.calls[0]![0]!;
    expect(call.from).toEqual(new Date('2026-06-01T00:00:00.000Z'));
    expect(call.to).toBeUndefined();
  });

  it('applies doctorId filter when provided', async () => {
    await useCase.execute({ doctorId: DOCTOR_ID, limit: 10, offset: 0 });

    const call = repo.findAll.mock.calls[0]![0]!;
    expect(call.doctorId).toBe(DOCTOR_ID);
  });
});
