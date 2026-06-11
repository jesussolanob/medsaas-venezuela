import { ListOfficesUseCase } from './list-offices.use-case';
import type { IOfficeRepository } from '../../../domain/repositories/office.repository';
import { Office } from '../../../domain/entities/office.entity';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const now = new Date('2026-06-05T00:00:00Z');

function makeOffice(id: string = 'oooo-001'): Office {
  return Office.create({
    id,
    doctorId: DOCTOR_ID,
    name: 'Consultorio Test',
    address: 'Av. Test',
    city: 'Caracas',
    phone: '',
    schedule: [],
    slotDuration: 30,
    bufferMinutes: 10,
    isActive: true,
    modality: 'in_person',
    createdAt: now,
    updatedAt: now,
  });
}

describe('ListOfficesUseCase', () => {
  let useCase: ListOfficesUseCase;
  let mockRepo: jest.Mocked<IOfficeRepository>;

  beforeEach(() => {
    mockRepo = {
      findById: jest.fn(),
      listByDoctor: jest.fn(),
      findByIdForDoctor: jest.fn(),
      findActiveByDoctor: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    };
    useCase = new ListOfficesUseCase(mockRepo);
  });

  it('returns all offices for the authenticated doctor', async () => {
    const offices = [makeOffice('o1'), makeOffice('o2')];
    mockRepo.listByDoctor.mockResolvedValue(offices);

    const result = await useCase.execute(DOCTOR_ID);

    expect(result).toBe(offices);
    expect(mockRepo.listByDoctor).toHaveBeenCalledWith(DOCTOR_ID);
  });

  it('returns empty array when doctor has no offices', async () => {
    mockRepo.listByDoctor.mockResolvedValue([]);

    const result = await useCase.execute(DOCTOR_ID);

    expect(result).toEqual([]);
    expect(mockRepo.listByDoctor).toHaveBeenCalledWith(DOCTOR_ID);
  });
});
