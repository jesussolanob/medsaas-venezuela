import { UpdateDoctorScheduleUseCase } from './update-doctor-schedule.use-case';
import type { IDoctorScheduleRepository } from '../../../domain/repositories/doctor-schedule.repository';

const DOCTOR_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

const SCHEDULE_PARAMS = {
  workDays: [1, 2, 3, 4, 5],
  startTime: '09:00',
  endTime: '18:00',
  slotDurationMinutes: 30,
  breakStart: '13:00',
  breakEnd: '14:00',
};

describe('UpdateDoctorScheduleUseCase', () => {
  let useCase: UpdateDoctorScheduleUseCase;
  let mockRepo: jest.Mocked<IDoctorScheduleRepository>;
  let mockRedis: { scan: jest.Mock; del: jest.Mock };

  beforeEach(() => {
    mockRepo = {
      findByDoctorId: jest.fn(),
      upsert: jest.fn(),
    };
    mockRedis = {
      scan: jest.fn(),
      del: jest.fn(),
    };
    // Return single-page empty scan by default (no cached keys)
    mockRedis.scan.mockResolvedValue(['0', []]);

    useCase = new UpdateDoctorScheduleUseCase(mockRepo, mockRedis as never);
  });

  it('upserts the schedule and returns saved params', async () => {
    mockRepo.upsert.mockResolvedValue(SCHEDULE_PARAMS);

    const result = await useCase.execute(DOCTOR_ID, SCHEDULE_PARAMS);

    expect(result).toEqual(SCHEDULE_PARAMS);
    expect(mockRepo.upsert).toHaveBeenCalledWith(DOCTOR_ID, SCHEDULE_PARAMS);
  });

  it('invalidates Redis slot cache for the doctor', async () => {
    mockRepo.upsert.mockResolvedValue(SCHEDULE_PARAMS);
    // Simulate two pages: first has two keys, second is the final page
    mockRedis.scan
      .mockResolvedValueOnce([
        '42',
        [`slots:${DOCTOR_ID}:2026-06-02`, `slots:${DOCTOR_ID}:2026-06-03`],
      ])
      .mockResolvedValueOnce(['0', []]);

    await useCase.execute(DOCTOR_ID, SCHEDULE_PARAMS);

    expect(mockRedis.scan).toHaveBeenCalledWith('0', 'MATCH', `slots:${DOCTOR_ID}:*`, 'COUNT', 100);
    expect(mockRedis.del).toHaveBeenCalledWith(
      `slots:${DOCTOR_ID}:2026-06-02`,
      `slots:${DOCTOR_ID}:2026-06-03`,
    );
  });

  it('does not call DEL when no slot cache keys exist', async () => {
    mockRepo.upsert.mockResolvedValue(SCHEDULE_PARAMS);
    mockRedis.scan.mockResolvedValue(['0', []]); // no keys

    await useCase.execute(DOCTOR_ID, SCHEDULE_PARAMS);

    expect(mockRedis.del).not.toHaveBeenCalled();
  });

  it('still returns saved schedule when Redis SCAN throws (Redis unavailable)', async () => {
    mockRepo.upsert.mockResolvedValue(SCHEDULE_PARAMS);
    mockRedis.scan.mockRejectedValue(new Error('ECONNREFUSED'));

    // The upsert already succeeded — a Redis failure must not propagate
    const result = await useCase.execute(DOCTOR_ID, SCHEDULE_PARAMS);

    expect(result).toEqual(SCHEDULE_PARAMS);
    expect(mockRepo.upsert).toHaveBeenCalledWith(DOCTOR_ID, SCHEDULE_PARAMS);
  });
});
