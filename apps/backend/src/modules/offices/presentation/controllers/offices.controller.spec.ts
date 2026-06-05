import { Test, type TestingModule } from '@nestjs/testing';
import { OfficesController } from './offices.controller';
import { ListOfficesUseCase } from '../../application/use-cases/offices/list-offices.use-case';
import { CreateOfficeUseCase } from '../../application/use-cases/offices/create-office.use-case';
import { UpdateOfficeUseCase } from '../../application/use-cases/offices/update-office.use-case';
import { DeleteOfficeUseCase } from '../../application/use-cases/offices/delete-office.use-case';
import { ToggleOfficeUseCase } from '../../application/use-cases/offices/toggle-office.use-case';
import { Office } from '../../domain/entities/office.entity';
import { OfficeNotFoundError } from '../../domain/errors/office-not-found.error';
import type { CurrentUserPayload } from '../../../../presentation/decorators/current-user.decorator';
import type { CreateOfficeDto, UpdateOfficeDto } from '@delta/shared-types';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const OFFICE_ID = 'oooooooo-0000-0000-0000-000000000001';
const now = new Date('2026-06-05T00:00:00Z');

const mockUser: CurrentUserPayload = { sub: DOCTOR_ID, role: 'doctor', email: 'doc@dev.local' };

function makeOffice(overrides: Partial<Parameters<typeof Office.create>[0]> = {}): Office {
  return Office.create({
    id: OFFICE_ID,
    doctorId: DOCTOR_ID,
    name: 'Consultorio Principal',
    address: 'Av. Test',
    city: 'Caracas',
    phone: '+58 212 000 0000',
    schedule: [],
    slotDuration: 30,
    bufferMinutes: 10,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

describe('OfficesController', () => {
  let controller: OfficesController;

  const mockList = { execute: jest.fn() };
  const mockCreate = { execute: jest.fn() };
  const mockUpdate = { execute: jest.fn() };
  const mockDelete = { execute: jest.fn() };
  const mockToggle = { execute: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OfficesController],
      providers: [
        { provide: ListOfficesUseCase, useValue: mockList },
        { provide: CreateOfficeUseCase, useValue: mockCreate },
        { provide: UpdateOfficeUseCase, useValue: mockUpdate },
        { provide: DeleteOfficeUseCase, useValue: mockDelete },
        { provide: ToggleOfficeUseCase, useValue: mockToggle },
      ],
    }).compile();

    controller = module.get<OfficesController>(OfficesController);
  });

  describe('list', () => {
    it('returns success envelope with office list', async () => {
      const offices = [makeOffice()];
      mockList.execute.mockResolvedValue(offices);

      const result = await controller.list(mockUser);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(mockList.execute).toHaveBeenCalledWith(DOCTOR_ID);
    });

    it('returns empty list when doctor has no offices', async () => {
      mockList.execute.mockResolvedValue([]);

      const result = await controller.list(mockUser);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
    });

    it('always uses doctorId from the authenticated user (anti-IDOR)', async () => {
      mockList.execute.mockResolvedValue([]);

      await controller.list(mockUser);

      expect(mockList.execute).toHaveBeenCalledWith(DOCTOR_ID);
    });
  });

  describe('create', () => {
    const dto: CreateOfficeDto = {
      name: 'Consultorio Principal',
      address: 'Av. Test',
      city: 'Caracas',
      phone: '',
      schedule: [],
      slot_duration: 30,
      buffer_minutes: 10,
    };

    it('returns the created office in a success envelope', async () => {
      const office = makeOffice();
      mockCreate.execute.mockResolvedValue(office);

      const result = await controller.create(dto, mockUser);

      expect(result.success).toBe(true);
      expect(result.data).toBe(office);
    });

    it('always uses doctorId from the authenticated user (anti-IDOR)', async () => {
      mockCreate.execute.mockResolvedValue(makeOffice());

      await controller.create(dto, mockUser);

      expect(mockCreate.execute).toHaveBeenCalledWith(dto, DOCTOR_ID);
    });
  });

  describe('update', () => {
    const dto: UpdateOfficeDto = { name: 'Updated Name' };

    it('returns the updated office in a success envelope', async () => {
      const office = makeOffice({ name: 'Updated Name' });
      mockUpdate.execute.mockResolvedValue(office);

      const result = await controller.update(OFFICE_ID, dto, mockUser);

      expect(result.success).toBe(true);
      expect(mockUpdate.execute).toHaveBeenCalledWith(OFFICE_ID, dto, DOCTOR_ID);
    });

    it('propagates OfficeNotFoundError when office does not exist', async () => {
      mockUpdate.execute.mockRejectedValue(new OfficeNotFoundError());

      await expect(controller.update(OFFICE_ID, dto, mockUser)).rejects.toThrow(
        OfficeNotFoundError,
      );
    });
  });

  describe('remove', () => {
    it('resolves without returning content on success (204)', async () => {
      mockDelete.execute.mockResolvedValue(undefined);

      await expect(controller.remove(OFFICE_ID, mockUser)).resolves.toBeUndefined();
      expect(mockDelete.execute).toHaveBeenCalledWith(OFFICE_ID, DOCTOR_ID);
    });

    it('propagates OfficeNotFoundError when office does not exist', async () => {
      mockDelete.execute.mockRejectedValue(new OfficeNotFoundError());

      await expect(controller.remove(OFFICE_ID, mockUser)).rejects.toThrow(OfficeNotFoundError);
    });
  });

  describe('toggle', () => {
    it('returns the toggled office in a success envelope', async () => {
      const office = makeOffice({ isActive: false });
      mockToggle.execute.mockResolvedValue(office);

      const result = await controller.toggle(OFFICE_ID, mockUser);

      expect(result.success).toBe(true);
      expect(result.data.isActive).toBe(false);
      expect(mockToggle.execute).toHaveBeenCalledWith(OFFICE_ID, DOCTOR_ID);
    });

    it('propagates OfficeNotFoundError when office does not exist', async () => {
      mockToggle.execute.mockRejectedValue(new OfficeNotFoundError());

      await expect(controller.toggle(OFFICE_ID, mockUser)).rejects.toThrow(OfficeNotFoundError);
    });
  });
});
