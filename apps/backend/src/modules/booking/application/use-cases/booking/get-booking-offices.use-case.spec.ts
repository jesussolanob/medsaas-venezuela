import { GetBookingOfficesUseCase } from './get-booking-offices.use-case';
import type { IOfficeRepository } from '../../../../offices/domain/repositories/office.repository';
import { Office } from '../../../../offices/domain/entities/office.entity';

const DOCTOR_ID = 'doc-uuid-0001';

function makeOffice(overrides: Partial<ConstructorParameters<typeof Office>[0]> = {}) {
  return Office.create({
    id: 'off-uuid-0001',
    doctorId: DOCTOR_ID,
    name: 'Consultorio Principal',
    address: 'Av. Libertador 100',
    city: 'Caracas',
    phone: '+58 212 555 0001',
    schedule: [{ day: 0, enabled: true, start: '08:00', end: '17:00' }],
    slotDuration: 30,
    bufferMinutes: 10,
    isActive: true,
    modality: 'in_person',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  });
}

describe('GetBookingOfficesUseCase', () => {
  let useCase: GetBookingOfficesUseCase;
  let mockOfficeRepo: jest.Mocked<IOfficeRepository>;

  beforeEach(() => {
    mockOfficeRepo = {
      listByDoctor: jest.fn(),
      findByIdForDoctor: jest.fn(),
      findActiveByDoctor: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    };
    useCase = new GetBookingOfficesUseCase(mockOfficeRepo);
  });

  it('returns mapped DTOs for active offices', async () => {
    mockOfficeRepo.findActiveByDoctor.mockResolvedValue([makeOffice()]);

    const result = await useCase.execute(DOCTOR_ID);

    expect(result).toHaveLength(1);
    const dto = result[0]!;
    expect(dto.id).toBe('off-uuid-0001');
    expect(dto.name).toBe('Consultorio Principal');
    expect(dto.address).toBe('Av. Libertador 100');
    expect(dto.city).toBe('Caracas');
    expect(dto.phone).toBe('+58 212 555 0001');
    expect(dto.slotDuration).toBe(30);
    expect(dto.bufferMinutes).toBe(10);
    expect(dto.modality).toBe('in_person');
    expect(dto.allowsOnline).toBe(false);
    expect(dto.schedule).toEqual([{ day: 0, enabled: true, start: '08:00', end: '17:00' }]);
    expect(mockOfficeRepo.findActiveByDoctor).toHaveBeenCalledWith(DOCTOR_ID);
  });

  it('returns empty array when doctor has no active offices', async () => {
    mockOfficeRepo.findActiveByDoctor.mockResolvedValue([]);

    const result = await useCase.execute(DOCTOR_ID);

    expect(result).toHaveLength(0);
    expect(mockOfficeRepo.findActiveByDoctor).toHaveBeenCalledWith(DOCTOR_ID);
  });

  it('sets allowsOnline=true for online modality', async () => {
    mockOfficeRepo.findActiveByDoctor.mockResolvedValue([
      makeOffice({ id: 'off-online', modality: 'online' }),
    ]);

    const result = await useCase.execute(DOCTOR_ID);

    expect(result[0]?.allowsOnline).toBe(true);
    expect(result[0]?.modality).toBe('online');
  });

  it('sets allowsOnline=true for both modality', async () => {
    mockOfficeRepo.findActiveByDoctor.mockResolvedValue([
      makeOffice({ id: 'off-both', modality: 'both' }),
    ]);

    const result = await useCase.execute(DOCTOR_ID);

    expect(result[0]?.allowsOnline).toBe(true);
    expect(result[0]?.modality).toBe('both');
  });

  it('maps multiple offices preserving order', async () => {
    const offices = [
      makeOffice({ id: 'off-001', name: 'Consultorio A' }),
      makeOffice({ id: 'off-002', name: 'Consultorio B', modality: 'online' }),
    ];
    mockOfficeRepo.findActiveByDoctor.mockResolvedValue(offices);

    const result = await useCase.execute(DOCTOR_ID);

    expect(result).toHaveLength(2);
    expect(result[0]?.id).toBe('off-001');
    expect(result[1]?.id).toBe('off-002');
    expect(result[0]?.allowsOnline).toBe(false);
    expect(result[1]?.allowsOnline).toBe(true);
  });

  it('does not expose doctorId or internal timestamps in the DTO', async () => {
    mockOfficeRepo.findActiveByDoctor.mockResolvedValue([makeOffice()]);

    const result = await useCase.execute(DOCTOR_ID);

    const dto = result[0]! as unknown as Record<string, unknown>;
    expect(dto['doctorId']).toBeUndefined();
    expect(dto['isActive']).toBeUndefined();
    expect(dto['createdAt']).toBeUndefined();
    expect(dto['updatedAt']).toBeUndefined();
  });
});
