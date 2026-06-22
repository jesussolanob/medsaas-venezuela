import { Test } from '@nestjs/testing';
import { AdminSpecialtiesController } from './admin-specialties.controller';
import { ListAllSpecialtiesUseCase } from '../../application/use-cases/list-all-specialties.use-case';
import { CreateSpecialtyUseCase } from '../../application/use-cases/create-specialty.use-case';
import { UpdateSpecialtyUseCase } from '../../application/use-cases/update-specialty.use-case';
import { Specialty } from '../../domain/entities/specialty.entity';
import { SpecialtyConflictError } from '../../domain/errors/specialty-conflict.error';
import { SpecialtyNotFoundError } from '../../domain/errors/specialty-not-found.error';
import { SPECIALTY_REPOSITORY } from '../../domain/repositories/specialty.repository';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';

const now = new Date('2026-06-11T00:00:00Z');

function makeSpecialty(overrides = {}): Specialty {
  return Specialty.reconstitute({
    id: 'eeee0000-0000-0000-0000-000000000001',
    name: 'Cardiología',
    isActive: true,
    sortOrder: 20,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

describe('AdminSpecialtiesController', () => {
  let controller: AdminSpecialtiesController;
  let mockListAll: jest.Mocked<ListAllSpecialtiesUseCase>;
  let mockCreate: jest.Mocked<CreateSpecialtyUseCase>;
  let mockUpdate: jest.Mocked<UpdateSpecialtyUseCase>;

  beforeEach(async () => {
    mockListAll = { execute: jest.fn() } as unknown as jest.Mocked<ListAllSpecialtiesUseCase>;
    mockCreate = { execute: jest.fn() } as unknown as jest.Mocked<CreateSpecialtyUseCase>;
    mockUpdate = { execute: jest.fn() } as unknown as jest.Mocked<UpdateSpecialtyUseCase>;

    const module = await Test.createTestingModule({
      controllers: [AdminSpecialtiesController],
      providers: [
        { provide: ListAllSpecialtiesUseCase, useValue: mockListAll },
        { provide: CreateSpecialtyUseCase, useValue: mockCreate },
        { provide: UpdateSpecialtyUseCase, useValue: mockUpdate },
        { provide: SPECIALTY_REPOSITORY, useValue: {} },
      ],
    })
      .overrideGuard(AppAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get(AdminSpecialtiesController);
  });

  // -------------------------------------------------------------------------
  // GET /api/admin/specialties
  // -------------------------------------------------------------------------

  describe('listAll', () => {
    it('returns success envelope with all specialties including inactive ones', async () => {
      const active = makeSpecialty({
        id: 'id-1',
        name: 'Cardiología',
        isActive: true,
        sortOrder: 20,
      });
      const inactive = makeSpecialty({
        id: 'id-2',
        name: 'Homeopatía',
        isActive: false,
        sortOrder: 900,
      });
      mockListAll.execute.mockResolvedValue([active, inactive]);

      const response = await controller.listAll();

      expect(response.success).toBe(true);
      expect(response.data).toHaveLength(2);
    });

    it('maps each specialty to SpecialtyAdminDto with all required fields', async () => {
      const s = makeSpecialty({ name: 'Neurología', isActive: false, sortOrder: 50 });
      mockListAll.execute.mockResolvedValue([s]);

      const response = await controller.listAll();

      const dto = response.data[0];
      expect(dto).toMatchObject({
        id: 'eeee0000-0000-0000-0000-000000000001',
        name: 'Neurología',
        isActive: false,
        sortOrder: 50,
      });
      expect(dto).toHaveProperty('createdAt');
      expect(dto).toHaveProperty('updatedAt');
    });

    it('returns empty data array when no specialties exist', async () => {
      mockListAll.execute.mockResolvedValue([]);

      const response = await controller.listAll();

      expect(response.success).toBe(true);
      expect(response.data).toEqual([]);
    });

    it('propagates use case errors', async () => {
      mockListAll.execute.mockRejectedValue(new Error('DB unavailable'));

      await expect(controller.listAll()).rejects.toThrow('DB unavailable');
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/admin/specialties
  // -------------------------------------------------------------------------

  describe('create', () => {
    it('returns created specialty with full admin fields', async () => {
      const saved = makeSpecialty({ name: 'Neurología', sortOrder: 50 });
      mockCreate.execute.mockResolvedValue(saved);

      const response = await controller.create({ name: 'Neurología', sort_order: 50 });

      expect(response.success).toBe(true);
      expect(response.data.name).toBe('Neurología');
      expect(response.data.isActive).toBe(true);
      expect(response.data.sortOrder).toBe(50);
      expect(response.data).toHaveProperty('id');
      expect(response.data).toHaveProperty('createdAt');
    });

    it('propagates SpecialtyConflictError from use case', async () => {
      mockCreate.execute.mockRejectedValue(new SpecialtyConflictError('Neurología'));

      await expect(controller.create({ name: 'Neurología' })).rejects.toThrow(
        SpecialtyConflictError,
      );
    });

    it('forwards sort_order to use case', async () => {
      mockCreate.execute.mockResolvedValue(makeSpecialty({ sortOrder: 30 }));

      await controller.create({ name: 'Cardiología', sort_order: 30 });

      expect(mockCreate.execute).toHaveBeenCalledWith({ name: 'Cardiología', sortOrder: 30 });
    });
  });

  // -------------------------------------------------------------------------
  // PUT /api/admin/specialties/:id
  // -------------------------------------------------------------------------

  describe('update', () => {
    it('returns updated specialty', async () => {
      const updated = makeSpecialty({ isActive: false });
      mockUpdate.execute.mockResolvedValue(updated);

      const response = await controller.update('eeee0000-0000-0000-0000-000000000001', {
        is_active: false,
      });

      expect(response.success).toBe(true);
      expect(response.data.isActive).toBe(false);
    });

    it('propagates SpecialtyNotFoundError from use case', async () => {
      mockUpdate.execute.mockRejectedValue(new SpecialtyNotFoundError('unknown-id'));

      await expect(
        controller.update('eeee0000-0000-0000-0000-000000000001', { is_active: false }),
      ).rejects.toThrow(SpecialtyNotFoundError);
    });

    it('propagates SpecialtyConflictError when renaming to existing name', async () => {
      mockUpdate.execute.mockRejectedValue(new SpecialtyConflictError('Neurología'));

      await expect(
        controller.update('eeee0000-0000-0000-0000-000000000001', { name: 'Neurología' }),
      ).rejects.toThrow(SpecialtyConflictError);
    });

    it('forwards all fields to use case', async () => {
      mockUpdate.execute.mockResolvedValue(makeSpecialty());

      await controller.update('eeee0000-0000-0000-0000-000000000001', {
        name: 'Updated',
        is_active: false,
        sort_order: 99,
      });

      expect(mockUpdate.execute).toHaveBeenCalledWith({
        id: 'eeee0000-0000-0000-0000-000000000001',
        name: 'Updated',
        isActive: false,
        sortOrder: 99,
      });
    });
  });
});
