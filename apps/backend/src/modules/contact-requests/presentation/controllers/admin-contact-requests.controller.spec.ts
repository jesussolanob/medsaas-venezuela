import { Test, type TestingModule } from '@nestjs/testing';
import { AdminContactRequestsController } from './admin-contact-requests.controller';
import { ListContactRequestsUseCase } from '../../application/use-cases/list-contact-requests.use-case';
import { UpdateContactRequestUseCase } from '../../application/use-cases/update-contact-request.use-case';
import { CountPendingContactRequestsUseCase } from '../../application/use-cases/count-pending-contact-requests.use-case';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import { RolesGuard } from '../../../../presentation/guards/roles.guard';
import type { CurrentUserPayload } from '../../../../presentation/decorators/current-user.decorator';

const ADMIN_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const currentAdmin: CurrentUserPayload = {
  sub: ADMIN_ID,
  role: 'super_admin',
  email: 'admin@dev.local',
};

describe('AdminContactRequestsController', () => {
  let controller: AdminContactRequestsController;
  let listUseCase: { execute: jest.Mock };
  let updateUseCase: { execute: jest.Mock };
  let countUseCase: { execute: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();
    listUseCase = { execute: jest.fn() };
    updateUseCase = { execute: jest.fn() };
    countUseCase = { execute: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminContactRequestsController],
      providers: [
        { provide: ListContactRequestsUseCase, useValue: listUseCase },
        { provide: UpdateContactRequestUseCase, useValue: updateUseCase },
        { provide: CountPendingContactRequestsUseCase, useValue: countUseCase },
      ],
    })
      .overrideGuard(AppAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get(AdminContactRequestsController);
  });

  describe('GET /api/admin/contact-requests/pending-count', () => {
    it('returns pending count', async () => {
      countUseCase.execute.mockResolvedValue(3);

      const result = await controller.pendingCount();

      expect(result.success).toBe(true);
      expect(result.data.count).toBe(3);
    });
  });

  describe('GET /api/admin/contact-requests', () => {
    it('returns list with meta', async () => {
      listUseCase.execute.mockResolvedValue({ items: [], total: 0 });

      const result = await controller.list({ limit: '50', offset: '0' });

      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.meta).toMatchObject({ total: 0, limit: 50, offset: 0 });
    });

    it('passes status filter through Zod parsing', async () => {
      listUseCase.execute.mockResolvedValue({ items: [], total: 0 });

      await controller.list({ status: 'pending', limit: '20', offset: '0' });

      expect(listUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'pending', limit: 20, offset: 0 }),
      );
    });

    it('rejects invalid status', async () => {
      await expect(
        controller.list({ status: 'invalid', limit: '50', offset: '0' }),
      ).rejects.toThrow();
    });
  });

  describe('PATCH /api/admin/contact-requests/:id', () => {
    const REQ_ID = 'req-uuid-1234-5678-abcd-000000000001';

    it('calls update use case with actorId from user', async () => {
      const output = {
        id: REQ_ID,
        status: 'contacted',
        handledBy: ADMIN_ID,
        handledAt: '2026-10-30T10:00:00.000Z',
        notes: null,
        updatedAt: '2026-10-30T10:00:00.000Z',
      };
      updateUseCase.execute.mockResolvedValue(output);

      const result = await controller.update(REQ_ID, currentAdmin, { status: 'contacted' });

      expect(result.success).toBe(true);
      expect(updateUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ id: REQ_ID, actorId: ADMIN_ID, status: 'contacted' }),
      );
    });

    it('throws ZodError on invalid status', async () => {
      await expect(
        controller.update(REQ_ID, currentAdmin, { status: 'invalid' }),
      ).rejects.toThrow();
    });
  });
});
