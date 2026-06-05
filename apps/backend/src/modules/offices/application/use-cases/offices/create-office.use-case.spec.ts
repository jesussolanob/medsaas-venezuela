import { CreateOfficeUseCase } from './create-office.use-case';
import type { IOfficeRepository } from '../../../domain/repositories/office.repository';
import { Office } from '../../../domain/entities/office.entity';
import { OfficeInvalidScheduleError } from '../../../domain/errors/office-invalid-schedule.error';
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
      create: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    };
    useCase = new CreateOfficeUseCase(mockRepo);
  });

  it('creates an office with valid data', async () => {
    const dto = makeDto();
    const saved = savedOffice(dto);
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
    mockRepo.create.mockResolvedValue(savedOffice(dto));

    await useCase.execute(dto, DOCTOR_ID);

     
    const createdOffice = mockRepo.create.mock.calls[0]![0] as Office;
    expect(createdOffice.doctorId).toBe(DOCTOR_ID);
  });

  it('always sets isActive=true on creation', async () => {
    const dto = makeDto();
    mockRepo.create.mockResolvedValue(savedOffice(dto));

    await useCase.execute(dto, DOCTOR_ID);

     
    const createdOffice = mockRepo.create.mock.calls[0]![0] as Office;
    expect(createdOffice.isActive).toBe(true);
  });

  it('creates an office with an empty schedule', async () => {
    const dto = makeDto({ schedule: [] });
    const saved = savedOffice(dto);
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
    mockRepo.create.mockResolvedValue(savedOffice(dto));

    // DaySchedule.hasValidWindow() returns true for disabled days
    await expect(useCase.execute(dto, DOCTOR_ID)).resolves.toBeDefined();
  });

  it('generates a unique id for each office', async () => {
    const dto = makeDto();
    mockRepo.create.mockResolvedValue(savedOffice(dto));

    await useCase.execute(dto, DOCTOR_ID);
    await useCase.execute(dto, DOCTOR_ID);

     
    const id1 = (mockRepo.create.mock.calls[0]![0] as Office).id;
     
    const id2 = (mockRepo.create.mock.calls[1]![0] as Office).id;
    expect(id1).not.toBe(id2);
  });
});
