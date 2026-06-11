import { Test } from '@nestjs/testing';
import { SpecialtiesController } from './specialties.controller';
import { ListActiveSpecialtiesUseCase } from '../../application/use-cases/list-active-specialties.use-case';
import { Specialty } from '../../domain/entities/specialty.entity';
import { SPECIALTY_REPOSITORY } from '../../domain/repositories/specialty.repository';

const now = new Date('2026-01-01T00:00:00Z');

function makeSpecialty(overrides = {}): Specialty {
  return Specialty.reconstitute({
    id: 'aaaa0000-0000-0000-0000-000000000001',
    name: 'Cardiología',
    isActive: true,
    sortOrder: 20,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

describe('SpecialtiesController', () => {
  let controller: SpecialtiesController;
  let mockUseCase: jest.Mocked<ListActiveSpecialtiesUseCase>;

  beforeEach(async () => {
    mockUseCase = { execute: jest.fn() } as unknown as jest.Mocked<ListActiveSpecialtiesUseCase>;

    const module = await Test.createTestingModule({
      controllers: [SpecialtiesController],
      providers: [
        { provide: ListActiveSpecialtiesUseCase, useValue: mockUseCase },
        { provide: SPECIALTY_REPOSITORY, useValue: {} },
      ],
    }).compile();

    controller = module.get(SpecialtiesController);
  });

  it('returns active specialties with id and name only', async () => {
    const s1 = makeSpecialty({ id: 'id-1', name: 'Cardiología' });
    const s2 = makeSpecialty({ id: 'id-2', name: 'Neurología' });
    mockUseCase.execute.mockResolvedValue([s1, s2]);

    const response = await controller.list();

    expect(response.success).toBe(true);
    expect(response.data).toHaveLength(2);
    expect(response.data[0]).toEqual({ id: 'id-1', name: 'Cardiología' });
    expect(response.data[1]).toEqual({ id: 'id-2', name: 'Neurología' });
  });

  it('returns empty data array when no active specialties', async () => {
    mockUseCase.execute.mockResolvedValue([]);

    const response = await controller.list();

    expect(response.success).toBe(true);
    expect(response.data).toEqual([]);
  });

  it('does not expose isActive or sortOrder fields', async () => {
    mockUseCase.execute.mockResolvedValue([makeSpecialty()]);

    const response = await controller.list();
    const item = response.data[0] as unknown as Record<string, unknown>;

    expect(item).not.toHaveProperty('isActive');
    expect(item).not.toHaveProperty('sortOrder');
    expect(item).not.toHaveProperty('createdAt');
  });
});
