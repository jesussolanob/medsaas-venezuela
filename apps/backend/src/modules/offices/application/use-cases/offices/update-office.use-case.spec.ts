import { UpdateOfficeUseCase } from './update-office.use-case';
import type { IOfficeRepository } from '../../../domain/repositories/office.repository';
import { Office } from '../../../domain/entities/office.entity';
import { OfficeNotFoundError } from '../../../domain/errors/office-not-found.error';
import { OfficeInvalidScheduleError } from '../../../domain/errors/office-invalid-schedule.error';
import type { UpdateOfficeDto } from '@delta/shared-types';

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
});
