import { Test, TestingModule } from '@nestjs/testing';
import { AdminCapabilitiesController } from './admin-capabilities.controller';
import { ListAllCapabilitiesUseCase } from '../../application/use-cases/capabilities/list-all-capabilities.use-case';
import { SetCapabilityUseCase } from '../../application/use-cases/capabilities/set-capability.use-case';
import { RoleCapability } from '../../domain/entities/role-capability.entity';

const makeRow = (
  role: string,
  moduleKey: string,
  action: 'view' | 'create' | 'edit' | 'delete',
  allowed = true,
) =>
  new RoleCapability({
    id: `id-${role}-${moduleKey}-${action}`,
    role,
    moduleKey,
    action,
    allowed,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

const mockListAll = { execute: jest.fn() };
const mockSetCapability = { execute: jest.fn() };

describe('AdminCapabilitiesController', () => {
  let controller: AdminCapabilitiesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminCapabilitiesController],
      providers: [
        { provide: ListAllCapabilitiesUseCase, useValue: mockListAll },
        { provide: SetCapabilityUseCase, useValue: mockSetCapability },
      ],
    }).compile();

    controller = module.get<AdminCapabilitiesController>(AdminCapabilitiesController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('GET /admin/role-capabilities', () => {
    it('returns grouped capabilities', async () => {
      mockListAll.execute.mockResolvedValue({
        doctor: [makeRow('doctor', 'agenda', 'view')],
        patient: [makeRow('patient', 'profile', 'edit')],
      });

      const result = await controller.list();

      expect(result.success).toBe(true);
      expect(result.data['doctor']).toHaveLength(1);
      expect(result.data['doctor']![0]).toEqual({
        id: 'id-doctor-agenda-view',
        role: 'doctor',
        module_key: 'agenda',
        action: 'view',
        allowed: true,
      });
    });

    it('returns empty data when no capabilities exist', async () => {
      mockListAll.execute.mockResolvedValue({});
      const result = await controller.list();
      expect(result.data).toEqual({});
    });
  });

  describe('PUT /admin/role-capabilities', () => {
    it('calls setCapability use case and returns saved row', async () => {
      const saved = makeRow('doctor', 'finances', 'view', false);
      mockSetCapability.execute.mockResolvedValue(saved);

      const dto = {
        role: 'doctor' as const,
        module_key: 'finances',
        action: 'view' as const,
        allowed: false,
      };
      const result = await controller.set(dto);

      expect(mockSetCapability.execute).toHaveBeenCalledWith({
        role: 'doctor',
        moduleKey: 'finances',
        action: 'view',
        allowed: false,
      });
      expect(result.success).toBe(true);
      expect(result.data.allowed).toBe(false);
      expect(result.data.module_key).toBe('finances');
    });
  });
});
