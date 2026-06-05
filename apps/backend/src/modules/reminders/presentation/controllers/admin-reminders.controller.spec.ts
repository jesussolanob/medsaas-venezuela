import { Test, type TestingModule } from '@nestjs/testing';
import { AdminRemindersController } from './admin-reminders.controller';
import { GetAdminRemindersQueueUseCase } from '../../application/use-cases/reminders/get-admin-reminders-queue.use-case';
import { DevAuthGuard } from '../../../../infrastructure/auth/dev-auth.guard';
import { RolesGuard } from '../../../../presentation/guards/roles.guard';

const buildAdminQueueRow = () => ({
  id: 'item-1',
  doctorId: 'doctor-1',
  doctorName: 'Dr. García',
  offsetType: '7d',
  channel: 'both',
  scheduledFor: new Date('2025-02-01T09:00:00Z'),
  status: 'pending',
});

describe('AdminRemindersController', () => {
  let controller: AdminRemindersController;
  let mockGetAdminQueue: jest.Mocked<GetAdminRemindersQueueUseCase>;

  beforeEach(async () => {
    mockGetAdminQueue = { execute: jest.fn() } as unknown as jest.Mocked<GetAdminRemindersQueueUseCase>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminRemindersController],
      providers: [
        { provide: GetAdminRemindersQueueUseCase, useValue: mockGetAdminQueue },
      ],
    })
      .overrideGuard(DevAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AdminRemindersController>(AdminRemindersController);
  });

  describe('getAdminQueue', () => {
    it('returns empty array when queue is empty', async () => {
      mockGetAdminQueue.execute.mockResolvedValue([]);

      const result = await controller.getAdminQueue();

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
      expect(mockGetAdminQueue.execute).toHaveBeenCalledTimes(1);
    });

    it('returns enriched queue rows with doctor names', async () => {
      const rows = [buildAdminQueueRow()];
      mockGetAdminQueue.execute.mockResolvedValue(rows);

      const result = await controller.getAdminQueue();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      const first = result.data[0]!;
      expect(first.doctorName).toBe('Dr. García');
      expect(first.offsetType).toBe('7d');
      expect(first.status).toBe('pending');
    });

    it('wraps data in success envelope', async () => {
      mockGetAdminQueue.execute.mockResolvedValue([]);
      const result = await controller.getAdminQueue();
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('data');
    });
  });
});
