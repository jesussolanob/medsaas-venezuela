import { UpdateOfficeUseCase } from './update-office.use-case';
import type { IOfficeRepository } from '../../../domain/repositories/office.repository';
import { Office } from '../../../domain/entities/office.entity';
import { OfficeNotFoundError } from '../../../domain/errors/office-not-found.error';
import { OfficeInvalidScheduleError } from '../../../domain/errors/office-invalid-schedule.error';
import { OfficeScheduleConflictError } from '../../../domain/errors/office-schedule-conflict.error';
import type { UpdateOfficeDto } from '@delta/shared-types';
import { assertNoSelfOverlap } from './create-office.use-case';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const OTHER_DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000002';
const OFFICE_ID = 'oooooooo-0000-0000-0000-000000000001';
const now = new Date('2026-06-05T00:00:00Z');

function makeExistingOffice(overrides: Partial<Parameters<typeof Office.create>[0]> = {}): Office {
  return Office.create({
    id: OFFICE_ID,
    doctorId: DOCTOR_ID,
    name: 'Original Name',
    address: 'Original Address',
    city: 'Caracas',
    phone: '+58 212 000 0000',
    schedule: [{ day: 0, enabled: true, start: '08:00', end: '17:00' }],
    slotDuration: 30,
    bufferMinutes: 10,
    isActive: true,
    modality: 'in_person',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

describe('UpdateOfficeUseCase', () => {
  let useCase: UpdateOfficeUseCase;
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
    useCase = new UpdateOfficeUseCase(mockRepo);
  });

  it('updates office name successfully', async () => {
    const existing = makeExistingOffice();
    const updated = makeExistingOffice({ name: 'New Name' });
    mockRepo.findByIdForDoctor.mockResolvedValue(existing);
    mockRepo.save.mockResolvedValue(updated);

    const dto: UpdateOfficeDto = { name: 'New Name' };
    const result = await useCase.execute(OFFICE_ID, dto, DOCTOR_ID);

    expect(result.name).toBe('New Name');
    expect(mockRepo.findByIdForDoctor).toHaveBeenCalledWith(OFFICE_ID, DOCTOR_ID);
    expect(mockRepo.save).toHaveBeenCalledTimes(1);
  });

  it('throws OfficeNotFoundError when office does not exist', async () => {
    mockRepo.findByIdForDoctor.mockResolvedValue(null);

    await expect(useCase.execute(OFFICE_ID, { name: 'X' }, DOCTOR_ID)).rejects.toBeInstanceOf(
      OfficeNotFoundError,
    );
    expect(mockRepo.save).not.toHaveBeenCalled();
  });

  it('throws OfficeNotFoundError for cross-doctor access (anti-IDOR)', async () => {
    mockRepo.findByIdForDoctor.mockResolvedValue(null);

    await expect(useCase.execute(OFFICE_ID, { name: 'X' }, OTHER_DOCTOR_ID)).rejects.toBeInstanceOf(
      OfficeNotFoundError,
    );
  });

  it('throws OfficeInvalidScheduleError for invalid schedule', async () => {
    mockRepo.findByIdForDoctor.mockResolvedValue(makeExistingOffice());

    const dto: UpdateOfficeDto = {
      schedule: [{ day: 0, enabled: true, start: '17:00', end: '08:00' }],
    };

    await expect(useCase.execute(OFFICE_ID, dto, DOCTOR_ID)).rejects.toBeInstanceOf(
      OfficeInvalidScheduleError,
    );
    expect(mockRepo.save).not.toHaveBeenCalled();
  });

  it('preserves existing schedule when dto.schedule is not provided', async () => {
    const existing = makeExistingOffice();
    const updated = Office.create({ ...existing, name: 'Changed' });
    mockRepo.findByIdForDoctor.mockResolvedValue(existing);
    mockRepo.save.mockResolvedValue(updated);

    await useCase.execute(OFFICE_ID, { name: 'Changed' }, DOCTOR_ID);

    const savedOffice = mockRepo.save.mock.calls[0]![0] as Office;
    expect(savedOffice.schedule).toEqual(existing.schedule);
  });

  it('preserves doctorId from existing record (anti-IDOR)', async () => {
    const existing = makeExistingOffice();
    const updated = makeExistingOffice({ name: 'Updated' });
    mockRepo.findByIdForDoctor.mockResolvedValue(existing);
    mockRepo.save.mockResolvedValue(updated);

    await useCase.execute(OFFICE_ID, { name: 'Updated' }, DOCTOR_ID);

    const savedOffice = mockRepo.save.mock.calls[0]![0] as Office;
    expect(savedOffice.doctorId).toBe(DOCTOR_ID);
  });

  it('preserves isActive during update', async () => {
    const existing = makeExistingOffice({ isActive: false });
    const updated = Office.create({ ...existing, name: 'New' });
    mockRepo.findByIdForDoctor.mockResolvedValue(existing);
    mockRepo.save.mockResolvedValue(updated);

    await useCase.execute(OFFICE_ID, { name: 'New' }, DOCTOR_ID);

    const savedOffice = mockRepo.save.mock.calls[0]![0] as Office;
    expect(savedOffice.isActive).toBe(false);
  });

  it('accepts partial updates (only city)', async () => {
    const existing = makeExistingOffice();
    const updated = makeExistingOffice({ city: 'Maracaibo' });
    mockRepo.findByIdForDoctor.mockResolvedValue(existing);
    mockRepo.save.mockResolvedValue(updated);

    const dto: UpdateOfficeDto = { city: 'Maracaibo' };
    const result = await useCase.execute(OFFICE_ID, dto, DOCTOR_ID);

    expect(result.city).toBe('Maracaibo');

    const savedOffice = mockRepo.save.mock.calls[0]![0] as Office;
    expect(savedOffice.name).toBe(existing.name); // unchanged
  });

  describe('schedule conflict detection on update', () => {
    const makeConflictingOffice = (): Office =>
      Office.create({
        id: 'other-office-002',
        doctorId: DOCTOR_ID,
        name: 'Another Office',
        address: 'Av. Other',
        city: 'Valencia',
        phone: '+58 241 000 0000',
        schedule: [{ day: 2, enabled: true, start: '08:00', end: '14:00' }],
        slotDuration: 30,
        bufferMinutes: 5,
        isActive: true,
        modality: 'in_person',
        createdAt: now,
        updatedAt: now,
      });

    it('throws OfficeScheduleConflictError when updated schedule overlaps another active office', async () => {
      const existing = makeExistingOffice();
      const conflicting = makeConflictingOffice();
      mockRepo.findByIdForDoctor.mockResolvedValue(existing);
      mockRepo.findActiveByDoctor.mockResolvedValue([existing, conflicting]);

      const dto: UpdateOfficeDto = {
        schedule: [{ day: 2, enabled: true, start: '10:00', end: '16:00' }],
      };

      await expect(useCase.execute(OFFICE_ID, dto, DOCTOR_ID)).rejects.toBeInstanceOf(
        OfficeScheduleConflictError,
      );
      expect(mockRepo.save).not.toHaveBeenCalled();
    });

    it('does not throw when the only overlap is with the office being updated (self-exclusion)', async () => {
      const existing = makeExistingOffice({
        schedule: [{ day: 2, enabled: true, start: '08:00', end: '14:00' }],
      });
      // Only active office is the one being updated (excluded via excludeId)
      mockRepo.findByIdForDoctor.mockResolvedValue(existing);
      mockRepo.findActiveByDoctor.mockResolvedValue([existing]);
      mockRepo.save.mockResolvedValue(existing);

      // Same day, overlapping times — but the office IS the one being updated
      const dto: UpdateOfficeDto = {
        schedule: [{ day: 2, enabled: true, start: '09:00', end: '17:00' }],
      };

      await expect(useCase.execute(OFFICE_ID, dto, DOCTOR_ID)).resolves.toBeDefined();
    });

    it('does not check for conflict when schedule is not part of the DTO', async () => {
      const existing = makeExistingOffice();
      mockRepo.findByIdForDoctor.mockResolvedValue(existing);
      mockRepo.save.mockResolvedValue(existing);

      // dto has no schedule → conflict check is skipped
      const dto: UpdateOfficeDto = { name: 'Updated Without Schedule' };

      await expect(useCase.execute(OFFICE_ID, dto, DOCTOR_ID)).resolves.toBeDefined();
      expect(mockRepo.findActiveByDoctor).not.toHaveBeenCalled();
    });

    it('throws OfficeInvalidScheduleError when updated schedule has self-overlapping blocks', async () => {
      const existing = makeExistingOffice();
      mockRepo.findByIdForDoctor.mockResolvedValue(existing);

      const dto: UpdateOfficeDto = {
        schedule: [
          { day: 0, enabled: true, start: '08:00', end: '13:00' },
          { day: 0, enabled: true, start: '12:00', end: '17:00' }, // overlaps with above
        ],
      };

      await expect(useCase.execute(OFFICE_ID, dto, DOCTOR_ID)).rejects.toBeInstanceOf(
        OfficeInvalidScheduleError,
      );
      expect(mockRepo.save).not.toHaveBeenCalled();
    });

    it('allows updating to multiple non-overlapping blocks on the same day (morning + afternoon)', async () => {
      const existing = makeExistingOffice();
      const updated = makeExistingOffice({
        schedule: [
          { day: 0, enabled: true, start: '08:00', end: '12:00' },
          { day: 0, enabled: true, start: '15:00', end: '18:00' },
        ],
      });
      mockRepo.findByIdForDoctor.mockResolvedValue(existing);
      mockRepo.findActiveByDoctor.mockResolvedValue([existing]);
      mockRepo.save.mockResolvedValue(updated);

      const dto: UpdateOfficeDto = {
        schedule: [
          { day: 0, enabled: true, start: '08:00', end: '12:00' },
          { day: 0, enabled: true, start: '15:00', end: '18:00' },
        ],
      };

      await expect(useCase.execute(OFFICE_ID, dto, DOCTOR_ID)).resolves.toBeDefined();
      expect(mockRepo.save).toHaveBeenCalledTimes(1);
    });
  });
});

// ---------------------------------------------------------------------------
// assertNoSelfOverlap — exported helper used by both create and update
// (smoke tests verifying export is accessible from update-office context)
// ---------------------------------------------------------------------------

describe('assertNoSelfOverlap() via update-office context', () => {
  it('is exported from create-office.use-case and callable', () => {
    expect(typeof assertNoSelfOverlap).toBe('function');
  });
});
