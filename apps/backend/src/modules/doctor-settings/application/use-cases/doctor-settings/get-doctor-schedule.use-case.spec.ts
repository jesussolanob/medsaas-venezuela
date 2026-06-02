import { GetDoctorScheduleUseCase } from './get-doctor-schedule.use-case';
import type { IDoctorScheduleRepository } from '../../../domain/repositories/doctor-schedule.repository';
import { DEFAULT_SCHEDULE } from '../../../domain/value-objects/doctor-schedule.vo';

const DOCTOR_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

describe('GetDoctorScheduleUseCase', () => {
  let useCase: GetDoctorScheduleUseCase;
  let mockRepo: jest.Mocked<IDoctorScheduleRepository>;

  beforeEach(() => {
    mockRepo = {
      findByDoctorId: jest.fn(),
      upsert: jest.fn(),
    };
    useCase = new GetDoctorScheduleUseCase(mockRepo);
  });

  it('returns stored schedule when one exists', async () => {
    const stored = {
      workDays: [1, 2, 3],
      startTime: '09:00',
      endTime: '18:00',
      slotDurationMinutes: 45,
      breakStart: '12:00',
      breakEnd: '13:00',
    };
    mockRepo.findByDoctorId.mockResolvedValue(stored);

    const result = await useCase.execute(DOCTOR_ID);

    expect(result).toEqual(stored);
    expect(mockRepo.findByDoctorId).toHaveBeenCalledWith(DOCTOR_ID);
  });

  it('returns default schedule (Mon–Fri, 08:00–17:00, 30 min) when no schedule exists', async () => {
    mockRepo.findByDoctorId.mockResolvedValue(null);

    const result = await useCase.execute(DOCTOR_ID);

    expect(result.workDays).toEqual(DEFAULT_SCHEDULE.workDays);
    expect(result.startTime).toBe(DEFAULT_SCHEDULE.startTime);
    expect(result.endTime).toBe(DEFAULT_SCHEDULE.endTime);
    expect(result.slotDurationMinutes).toBe(DEFAULT_SCHEDULE.slotDurationMinutes);
    expect(result.breakStart).toBeNull();
    expect(result.breakEnd).toBeNull();
  });
});
