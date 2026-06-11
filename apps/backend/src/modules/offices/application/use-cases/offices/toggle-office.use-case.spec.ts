import { ToggleOfficeUseCase } from './toggle-office.use-case';
import type { IOfficeRepository } from '../../../domain/repositories/office.repository';
import { Office } from '../../../domain/entities/office.entity';
import { OfficeNotFoundError } from '../../../domain/errors/office-not-found.error';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const OFFICE_ID = 'oooooooo-0000-0000-0000-000000000001';
const now = new Date('2026-06-05T00:00:00Z');

function makeOffice(isActive = true): Office {
  return Office.create({
    id: OFFICE_ID,
    doctorId: DOCTOR_ID,
    name: 'Consultorio',
    address: '',
    city: 'Caracas',
    phone: '',
    schedule: [],
    slotDuration: 30,
    bufferMinutes: 10,
    isActive,
    modality: 'in_person',
    createdAt: now,
    updatedAt: now,
  });
}

describe('ToggleOfficeUseCase', () => {
  let useCase: ToggleOfficeUseCase;
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
    useCase = new ToggleOfficeUseCase(mockRepo);
  });

  it('flips isActive from true to false', async () => {
    const existing = makeOffice(true);
    const toggled = existing.toggleActive(); // isActive=false
    mockRepo.findByIdForDoctor.mockResolvedValue(existing);
    mockRepo.save.mockResolvedValue(toggled);

    const result = await useCase.execute(OFFICE_ID, DOCTOR_ID);

    expect(result.isActive).toBe(false);
    expect(mockRepo.findByIdForDoctor).toHaveBeenCalledWith(OFFICE_ID, DOCTOR_ID);
    expect(mockRepo.save).toHaveBeenCalledTimes(1);
  });

  it('flips isActive from false to true', async () => {
    const existing = makeOffice(false);
    const toggled = existing.toggleActive(); // isActive=true
    mockRepo.findByIdForDoctor.mockResolvedValue(existing);
    mockRepo.save.mockResolvedValue(toggled);

    const result = await useCase.execute(OFFICE_ID, DOCTOR_ID);

    expect(result.isActive).toBe(true);
  });

  it('throws OfficeNotFoundError when office does not exist', async () => {
    mockRepo.findByIdForDoctor.mockResolvedValue(null);

    await expect(useCase.execute(OFFICE_ID, DOCTOR_ID)).rejects.toBeInstanceOf(OfficeNotFoundError);
    expect(mockRepo.save).not.toHaveBeenCalled();
  });

  it('saves the toggled office (not the original)', async () => {
    const existing = makeOffice(true);
    const toggled = existing.toggleActive();
    mockRepo.findByIdForDoctor.mockResolvedValue(existing);
    mockRepo.save.mockResolvedValue(toggled);

    await useCase.execute(OFFICE_ID, DOCTOR_ID);

    const savedArg = mockRepo.save.mock.calls[0]![0] as Office;
    expect(savedArg.isActive).toBe(false);
  });
});
