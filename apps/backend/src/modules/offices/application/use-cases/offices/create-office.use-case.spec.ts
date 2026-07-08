import {
  CreateOfficeUseCase,
  timesOverlap,
  assertNoScheduleConflict,
  assertNoSelfOverlap,
} from './create-office.use-case';
import type { IOfficeRepository } from '../../../domain/repositories/office.repository';
import { Office } from '../../../domain/entities/office.entity';
import { OfficeInvalidScheduleError } from '../../../domain/errors/office-invalid-schedule.error';
import { OfficeScheduleConflictError } from '../../../domain/errors/office-schedule-conflict.error';
import type { CreateOfficeDto } from '@delta/shared-types';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const now = new Date('2026-06-05T00:00:00Z');

function makeDto(overrides: Partial<CreateOfficeDto> = {}): CreateOfficeDto {
  return {
    name: 'Consultorio Principal',
    address: 'Av. Test 123',
    city: 'Caracas',
    phone: '+58 212 000 0000',
    schedule: [{ day: 0, enabled: true, start: '08:00', end: '17:00' }],
    slot_duration: 30,
    buffer_minutes: 10,
    modality: 'in_person',
    ...overrides,
  };
}

function savedOffice(input: CreateOfficeDto): Office {
  return Office.create({
    id: 'oooo-saved-001',
    doctorId: DOCTOR_ID,
    name: input.name,
    address: input.address,
    city: input.city,
    phone: input.phone,
    schedule: input.schedule,
    slotDuration: input.slot_duration,
    bufferMinutes: input.buffer_minutes,
    isActive: true,
    modality: input.modality ?? 'in_person',
    createdAt: now,
    updatedAt: now,
  });
}

describe('CreateOfficeUseCase', () => {
  let useCase: CreateOfficeUseCase;
  let mockRepo: jest.Mocked<IOfficeRepository>;

  beforeEach(() => {
    mockRepo = {
      listByDoctor: jest.fn(),
      findByIdForDoctor: jest.fn(),
      findActiveByDoctor: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    };
    useCase = new CreateOfficeUseCase(mockRepo);
  });

  it('creates an office with valid data', async () => {
    const dto = makeDto();
    const saved = savedOffice(dto);
    mockRepo.findActiveByDoctor.mockResolvedValue([]);
    mockRepo.create.mockResolvedValue(saved);

    const result = await useCase.execute(dto, DOCTOR_ID);

    expect(mockRepo.create).toHaveBeenCalledTimes(1);

    const createdOffice = mockRepo.create.mock.calls[0]![0] as Office;
    expect(createdOffice.doctorId).toBe(DOCTOR_ID);
    expect(createdOffice.name).toBe(dto.name);
    expect(createdOffice.isActive).toBe(true);
    expect(result).toBe(saved);
  });

  it('always assigns doctorId from the actor, not the DTO', async () => {
    const dto = makeDto();
    mockRepo.findActiveByDoctor.mockResolvedValue([]);
    mockRepo.create.mockResolvedValue(savedOffice(dto));

    await useCase.execute(dto, DOCTOR_ID);

    const createdOffice = mockRepo.create.mock.calls[0]![0] as Office;
    expect(createdOffice.doctorId).toBe(DOCTOR_ID);
  });

  it('always sets isActive=true on creation', async () => {
    const dto = makeDto();
    mockRepo.findActiveByDoctor.mockResolvedValue([]);
    mockRepo.create.mockResolvedValue(savedOffice(dto));

    await useCase.execute(dto, DOCTOR_ID);

    const createdOffice = mockRepo.create.mock.calls[0]![0] as Office;
    expect(createdOffice.isActive).toBe(true);
  });

  it('creates an office with an empty schedule', async () => {
    const dto = makeDto({ schedule: [] });
    const saved = savedOffice(dto);
    mockRepo.findActiveByDoctor.mockResolvedValue([]);
    mockRepo.create.mockResolvedValue(saved);

    const result = await useCase.execute(dto, DOCTOR_ID);

    expect(result).toBe(saved);
    expect(mockRepo.create).toHaveBeenCalledTimes(1);
  });

  it('throws OfficeInvalidScheduleError for invalid schedule entry (bad HH:MM)', async () => {
    const dto = makeDto({
      schedule: [{ day: 0, enabled: true, start: '8:00', end: '17:00' }], // bad format
    });

    await expect(useCase.execute(dto, DOCTOR_ID)).rejects.toBeInstanceOf(
      OfficeInvalidScheduleError,
    );
    expect(mockRepo.create).not.toHaveBeenCalled();
  });

  it('throws OfficeInvalidScheduleError when start >= end for enabled day', async () => {
    const dto = makeDto({
      schedule: [{ day: 0, enabled: true, start: '17:00', end: '08:00' }],
    });

    await expect(useCase.execute(dto, DOCTOR_ID)).rejects.toBeInstanceOf(
      OfficeInvalidScheduleError,
    );
  });

  it('does not throw for disabled day with inverted times (disabled days exempt)', async () => {
    const dto = makeDto({
      schedule: [{ day: 0, enabled: false, start: '17:00', end: '08:00' }],
    });
    mockRepo.findActiveByDoctor.mockResolvedValue([]);
    mockRepo.create.mockResolvedValue(savedOffice(dto));

    // DaySchedule.hasValidWindow() returns true for disabled days
    await expect(useCase.execute(dto, DOCTOR_ID)).resolves.toBeDefined();
  });

  it('generates a unique id for each office', async () => {
    const dto = makeDto();
    mockRepo.findActiveByDoctor.mockResolvedValue([]);
    mockRepo.create.mockResolvedValue(savedOffice(dto));

    await useCase.execute(dto, DOCTOR_ID);
    await useCase.execute(dto, DOCTOR_ID);

    const id1 = (mockRepo.create.mock.calls[0]![0] as Office).id;

    const id2 = (mockRepo.create.mock.calls[1]![0] as Office).id;
    expect(id1).not.toBe(id2);
  });

  describe('schedule conflict detection', () => {
    const makeActiveOffice = (schedule: Office['schedule']): Office =>
      Office.create({
        id: 'existing-office-001',
        doctorId: DOCTOR_ID,
        name: 'Existing Office',
        address: 'Av. Old 999',
        city: 'Caracas',
        phone: '+58 212 999 9999',
        schedule,
        slotDuration: 30,
        bufferMinutes: 5,
        isActive: true,
        modality: 'in_person',
        createdAt: now,
        updatedAt: now,
      });

    it('throws OfficeScheduleConflictError when schedule overlaps with an active office', async () => {
      const existingOffice = makeActiveOffice([
        { day: 1, enabled: true, start: '09:00', end: '17:00' },
      ]);
      mockRepo.findActiveByDoctor.mockResolvedValue([existingOffice]);

      // New office also schedules Tuesday 10:00-15:00 — fully within existing
      const dto = makeDto({
        schedule: [{ day: 1, enabled: true, start: '10:00', end: '15:00' }],
      });

      await expect(useCase.execute(dto, DOCTOR_ID)).rejects.toBeInstanceOf(
        OfficeScheduleConflictError,
      );
      expect(mockRepo.create).not.toHaveBeenCalled();
    });

    it('does not throw when the conflicting day is disabled in the new schedule', async () => {
      const existingOffice = makeActiveOffice([
        { day: 1, enabled: true, start: '09:00', end: '17:00' },
      ]);
      mockRepo.findActiveByDoctor.mockResolvedValue([existingOffice]);

      // Same day but disabled — no conflict
      const dto = makeDto({
        schedule: [{ day: 1, enabled: false, start: '09:00', end: '17:00' }],
      });
      mockRepo.create.mockResolvedValue(savedOffice(dto));

      await expect(useCase.execute(dto, DOCTOR_ID)).resolves.toBeDefined();
    });

    it('does not throw when schedules are on different days', async () => {
      const existingOffice = makeActiveOffice([
        { day: 1, enabled: true, start: '09:00', end: '17:00' },
      ]);
      mockRepo.findActiveByDoctor.mockResolvedValue([existingOffice]);

      // New office schedules Wednesday (day 2) — no overlap
      const dto = makeDto({
        schedule: [{ day: 2, enabled: true, start: '09:00', end: '17:00' }],
      });
      mockRepo.create.mockResolvedValue(savedOffice(dto));

      await expect(useCase.execute(dto, DOCTOR_ID)).resolves.toBeDefined();
    });

    it('does not throw when schedules are adjacent (touching but not overlapping)', async () => {
      const existingOffice = makeActiveOffice([
        { day: 0, enabled: true, start: '08:00', end: '12:00' },
      ]);
      mockRepo.findActiveByDoctor.mockResolvedValue([existingOffice]);

      // New schedule starts exactly when existing ends — half-open [12:00, 17:00)
      const dto = makeDto({
        schedule: [{ day: 0, enabled: true, start: '12:00', end: '17:00' }],
      });
      mockRepo.create.mockResolvedValue(savedOffice(dto));

      await expect(useCase.execute(dto, DOCTOR_ID)).resolves.toBeDefined();
    });

    it('throws OfficeInvalidScheduleError when proposed schedule has self-overlapping blocks (same day)', async () => {
      // Two blocks on Monday that overlap — this is a self-overlap error before cross-office check
      const dto = makeDto({
        schedule: [
          { day: 0, enabled: true, start: '08:00', end: '13:00' },
          { day: 0, enabled: true, start: '12:00', end: '17:00' },
        ],
      });
      mockRepo.findActiveByDoctor.mockResolvedValue([]);

      await expect(useCase.execute(dto, DOCTOR_ID)).rejects.toBeInstanceOf(
        OfficeInvalidScheduleError,
      );
      // Cross-office repo should not be queried when self-overlap detected first
      expect(mockRepo.findActiveByDoctor).not.toHaveBeenCalled();
    });

    it('creates office successfully with two non-overlapping blocks on the same day (morning + afternoon)', async () => {
      const dto = makeDto({
        schedule: [
          { day: 0, enabled: true, start: '08:00', end: '12:00' },
          { day: 0, enabled: true, start: '15:00', end: '18:00' },
        ],
      });
      mockRepo.findActiveByDoctor.mockResolvedValue([]);
      mockRepo.create.mockResolvedValue(savedOffice(dto));

      await expect(useCase.execute(dto, DOCTOR_ID)).resolves.toBeDefined();
      expect(mockRepo.create).toHaveBeenCalledTimes(1);
    });
  });
});

// ---------------------------------------------------------------------------
// timesOverlap — unit tests for the pure helper
// ---------------------------------------------------------------------------

describe('timesOverlap()', () => {
  it('returns true when A fully contains B', () => {
    expect(timesOverlap('08:00', '18:00', '10:00', '12:00')).toBe(true);
  });

  it('returns true when B fully contains A', () => {
    expect(timesOverlap('10:00', '12:00', '08:00', '18:00')).toBe(true);
  });

  it('returns true when A starts before B ends (partial overlap)', () => {
    expect(timesOverlap('08:00', '13:00', '12:00', '17:00')).toBe(true);
  });

  it('returns true when B starts before A ends (partial overlap)', () => {
    expect(timesOverlap('12:00', '17:00', '08:00', '13:00')).toBe(true);
  });

  it('returns false when A ends exactly where B starts (adjacent — no overlap)', () => {
    expect(timesOverlap('08:00', '12:00', '12:00', '17:00')).toBe(false);
  });

  it('returns false when B ends exactly where A starts (adjacent — no overlap)', () => {
    expect(timesOverlap('12:00', '17:00', '08:00', '12:00')).toBe(false);
  });

  it('returns false when A is entirely before B', () => {
    expect(timesOverlap('07:00', '09:00', '10:00', '12:00')).toBe(false);
  });

  it('returns false when B is entirely before A', () => {
    expect(timesOverlap('14:00', '18:00', '08:00', '12:00')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// assertNoScheduleConflict — unit tests
// ---------------------------------------------------------------------------

describe('assertNoScheduleConflict()', () => {
  const makeOfficeWith = (id: string, schedule: Office['schedule']): Office =>
    Office.create({
      id,
      doctorId: DOCTOR_ID,
      name: 'Office',
      address: '',
      city: '',
      phone: '',
      schedule,
      slotDuration: 30,
      bufferMinutes: 5,
      isActive: true,
      modality: 'in_person',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

  it('does not throw when there are no existing active offices', () => {
    const proposed = [{ day: 0, enabled: true, start: '08:00', end: '17:00' }];
    expect(() => assertNoScheduleConflict(proposed, [])).not.toThrow();
  });

  it('throws OfficeScheduleConflictError when schedules overlap on the same day', () => {
    const existing = makeOfficeWith('o1', [
      { day: 0, enabled: true, start: '08:00', end: '17:00' },
    ]);
    const proposed = [{ day: 0, enabled: true, start: '12:00', end: '18:00' }];
    expect(() => assertNoScheduleConflict(proposed, [existing])).toThrow(
      OfficeScheduleConflictError,
    );
  });

  it('does not throw when excludeId matches the conflicting office', () => {
    const existing = makeOfficeWith('o-to-update', [
      { day: 0, enabled: true, start: '08:00', end: '17:00' },
    ]);
    const proposed = [{ day: 0, enabled: true, start: '12:00', end: '18:00' }];
    // Excluding 'o-to-update' → no conflict left → no throw
    expect(() => assertNoScheduleConflict(proposed, [existing], 'o-to-update')).not.toThrow();
  });

  it('does not throw when disabled slot on new schedule matches an existing enabled slot', () => {
    const existing = makeOfficeWith('o1', [
      { day: 0, enabled: true, start: '08:00', end: '17:00' },
    ]);
    const proposed = [{ day: 0, enabled: false, start: '09:00', end: '16:00' }];
    expect(() => assertNoScheduleConflict(proposed, [existing])).not.toThrow();
  });

  it('detects conflict against a second block on the same day in an existing office', () => {
    // Existing office has morning + afternoon blocks on Monday
    const existing = makeOfficeWith('o1', [
      { day: 0, enabled: true, start: '08:00', end: '12:00' },
      { day: 0, enabled: true, start: '15:00', end: '18:00' },
    ]);
    // Proposed slot overlaps the afternoon block
    const proposed = [{ day: 0, enabled: true, start: '16:00', end: '19:00' }];
    expect(() => assertNoScheduleConflict(proposed, [existing])).toThrow(
      OfficeScheduleConflictError,
    );
  });

  it('does not throw when proposed block fits between two existing blocks on the same day', () => {
    // Existing office: 08:00-12:00 and 15:00-18:00 on Monday
    const existing = makeOfficeWith('o1', [
      { day: 0, enabled: true, start: '08:00', end: '12:00' },
      { day: 0, enabled: true, start: '15:00', end: '18:00' },
    ]);
    // Proposed: 12:00-14:00 (fits in gap, adjacent to both — no overlap)
    const proposed = [{ day: 0, enabled: true, start: '12:00', end: '14:00' }];
    expect(() => assertNoScheduleConflict(proposed, [existing])).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// assertNoSelfOverlap — unit tests
// ---------------------------------------------------------------------------

describe('assertNoSelfOverlap()', () => {
  it('does not throw for a schedule with a single block per day', () => {
    const schedule = [
      { day: 0, enabled: true, start: '08:00', end: '12:00' },
      { day: 1, enabled: true, start: '09:00', end: '17:00' },
    ];
    expect(() => assertNoSelfOverlap(schedule)).not.toThrow();
  });

  it('does not throw for two non-overlapping blocks on the same day (morning + afternoon)', () => {
    const schedule = [
      { day: 0, enabled: true, start: '08:00', end: '12:00' },
      { day: 0, enabled: true, start: '15:00', end: '18:00' },
    ];
    expect(() => assertNoSelfOverlap(schedule)).not.toThrow();
  });

  it('does not throw for adjacent blocks on the same day (touching but not overlapping)', () => {
    const schedule = [
      { day: 0, enabled: true, start: '08:00', end: '12:00' },
      { day: 0, enabled: true, start: '12:00', end: '17:00' },
    ];
    expect(() => assertNoSelfOverlap(schedule)).not.toThrow();
  });

  it('throws OfficeInvalidScheduleError for two overlapping blocks on the same day', () => {
    const schedule = [
      { day: 0, enabled: true, start: '08:00', end: '13:00' },
      { day: 0, enabled: true, start: '12:00', end: '17:00' }, // overlaps
    ];
    expect(() => assertNoSelfOverlap(schedule)).toThrow(OfficeInvalidScheduleError);
  });

  it('throws when a block is fully contained within another on the same day', () => {
    const schedule = [
      { day: 0, enabled: true, start: '08:00', end: '18:00' },
      { day: 0, enabled: true, start: '10:00', end: '14:00' }, // fully contained
    ];
    expect(() => assertNoSelfOverlap(schedule)).toThrow(OfficeInvalidScheduleError);
  });

  it('does not throw when overlapping blocks are disabled', () => {
    const schedule = [
      { day: 0, enabled: false, start: '08:00', end: '13:00' },
      { day: 0, enabled: false, start: '12:00', end: '17:00' },
    ];
    expect(() => assertNoSelfOverlap(schedule)).not.toThrow();
  });

  it('does not throw for an empty schedule', () => {
    expect(() => assertNoSelfOverlap([])).not.toThrow();
  });

  it('error message includes the overlapping day and times', () => {
    const schedule = [
      { day: 2, enabled: true, start: '09:00', end: '13:00' },
      { day: 2, enabled: true, start: '12:00', end: '16:00' },
    ];
    expect(() => assertNoSelfOverlap(schedule)).toThrow(
      expect.objectContaining({ message: expect.stringContaining('09:00-13:00') }),
    );
  });

  it('throws OfficeInvalidScheduleError (not OfficeScheduleConflictError) for self-overlap', () => {
    const schedule = [
      { day: 0, enabled: true, start: '08:00', end: '12:00' },
      { day: 0, enabled: true, start: '10:00', end: '14:00' },
    ];
    expect(() => assertNoSelfOverlap(schedule)).toThrow(OfficeInvalidScheduleError);
  });
});
