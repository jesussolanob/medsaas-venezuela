import { Test, type TestingModule } from '@nestjs/testing';
import { QuickItemsController } from './quick-items.controller';
import { ListQuickItemsUseCase } from '../../application/use-cases/quick-items/list-quick-items.use-case';
import { CreateQuickItemUseCase } from '../../application/use-cases/quick-items/create-quick-item.use-case';
import { DeleteQuickItemUseCase } from '../../application/use-cases/quick-items/delete-quick-item.use-case';
import { QuickItem } from '../../domain/entities/quick-item.entity';
import { QuickItemNotFoundError } from '../../domain/errors/quick-item-not-found.error';
import type { CurrentUserPayload } from '../../../../presentation/decorators/current-user.decorator';
import type { CreateQuickItemDto, ListQuickItemsQuery } from '@delta/shared-types';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const ITEM_ID = 'iiiiiiii-0000-0000-0000-000000000001';
const now = new Date('2026-06-05T00:00:00Z');

const mockUser: CurrentUserPayload = { sub: DOCTOR_ID, role: 'doctor', email: 'doc@dev.local' };

function makeItem(overrides: Partial<Parameters<typeof QuickItem.create>[0]> = {}): QuickItem {
  return QuickItem.create({
    id: ITEM_ID,
    doctorId: DOCTOR_ID,
    itemType: 'exam',
    name: 'Hemograma',
    category: null,
    details: null,
    createdAt: now,
    ...overrides,
  });
}

describe('QuickItemsController', () => {
  let controller: QuickItemsController;

  const mockList = { execute: jest.fn() };
  const mockCreate = { execute: jest.fn() };
  const mockDelete = { execute: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [QuickItemsController],
      providers: [
        { provide: ListQuickItemsUseCase, useValue: mockList },
        { provide: CreateQuickItemUseCase, useValue: mockCreate },
        { provide: DeleteQuickItemUseCase, useValue: mockDelete },
      ],
    })
      .overrideGuard(AppAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<QuickItemsController>(QuickItemsController);
  });

  describe('list', () => {
    it('returns success envelope with item list', async () => {
      const items = [makeItem(), makeItem({ itemType: 'medication', name: 'Ibuprofeno' })];
      mockList.execute.mockResolvedValue(items);

      const query: ListQuickItemsQuery = {};
      const result = await controller.list(query, mockUser);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(mockList.execute).toHaveBeenCalledWith(DOCTOR_ID, undefined);
    });

    it('passes type filter to use case', async () => {
      mockList.execute.mockResolvedValue([makeItem()]);

      const query: ListQuickItemsQuery = { type: 'exam' };
      await controller.list(query, mockUser);

      expect(mockList.execute).toHaveBeenCalledWith(DOCTOR_ID, 'exam');
    });

    it('returns empty list when doctor has no items', async () => {
      mockList.execute.mockResolvedValue([]);

      const query: ListQuickItemsQuery = {};
      const result = await controller.list(query, mockUser);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
    });

    it('always uses doctorId from authenticated user (anti-IDOR)', async () => {
      mockList.execute.mockResolvedValue([]);

      await controller.list({}, mockUser);

      expect(mockList.execute).toHaveBeenCalledWith(DOCTOR_ID, undefined);
    });
  });

  describe('create', () => {
    const dto: CreateQuickItemDto = {
      item_type: 'exam',
      name: 'Hemograma completo',
      category: 'Laboratorio',
      details: null,
    };

    it('returns the created item in a success envelope', async () => {
      const item = makeItem({ category: 'Laboratorio' });
      mockCreate.execute.mockResolvedValue(item);

      const result = await controller.create(dto, mockUser);

      expect(result.success).toBe(true);
      expect(result.data).toBe(item);
    });

    it('always uses doctorId from authenticated user (anti-IDOR)', async () => {
      mockCreate.execute.mockResolvedValue(makeItem());

      await controller.create(dto, mockUser);

      expect(mockCreate.execute).toHaveBeenCalledWith(dto, DOCTOR_ID);
    });

    it('creates medication item correctly', async () => {
      const medDto: CreateQuickItemDto = {
        item_type: 'medication',
        name: 'Ibuprofeno 400mg',
        category: null,
        details: '1 tab c/8h',
      };
      const saved = makeItem({ itemType: 'medication', name: 'Ibuprofeno 400mg' });
      mockCreate.execute.mockResolvedValue(saved);

      const result = await controller.create(medDto, mockUser);

      expect(result.success).toBe(true);
      expect(mockCreate.execute).toHaveBeenCalledWith(medDto, DOCTOR_ID);
    });
  });

  describe('remove', () => {
    it('resolves without returning content on success (204)', async () => {
      mockDelete.execute.mockResolvedValue(undefined);

      await expect(controller.remove(ITEM_ID, mockUser)).resolves.toBeUndefined();
      expect(mockDelete.execute).toHaveBeenCalledWith(ITEM_ID, DOCTOR_ID);
    });

    it('propagates QuickItemNotFoundError when item does not exist', async () => {
      mockDelete.execute.mockRejectedValue(new QuickItemNotFoundError());

      await expect(controller.remove(ITEM_ID, mockUser)).rejects.toThrow(QuickItemNotFoundError);
    });

    it('always uses doctorId from authenticated user (anti-IDOR)', async () => {
      mockDelete.execute.mockResolvedValue(undefined);

      await controller.remove(ITEM_ID, mockUser);

      expect(mockDelete.execute).toHaveBeenCalledWith(ITEM_ID, DOCTOR_ID);
    });
  });
});
