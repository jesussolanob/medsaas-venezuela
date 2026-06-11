import { Test } from '@nestjs/testing';
import { AvailabilityBlocksController } from './availability-blocks.controller';
import { ListAvailabilityBlocksUseCase } from '../../application/use-cases/availability-blocks/list-availability-blocks.use-case';
import { CreateAvailabilityBlockUseCase } from '../../application/use-cases/availability-blocks/create-availability-block.use-case';
import { DeleteAvailabilityBlockUseCase } from '../../application/use-cases/availability-blocks/delete-availability-block.use-case';
import { AvailabilityBlock } from '../../domain/entities/availability-block.entity';
import { AvailabilityBlockNotFoundError } from '../../domain/errors/availability-block-not-found.error';
import type { CurrentUserPayload } from '../../../../presentation/decorators/current-user.decorator';

const DOCTOR_ID = 'doctor-uuid-1';
const mockUser: CurrentUserPayload = { sub: DOCTOR_ID, role: 'doctor', email: 'doc@dev.local' };

function makeBlock(id = 'b-001'): AvailabilityBlock {
  return AvailabilityBlock.create({
    id,
    doctorId: DOCTOR_ID,
    startsAt: new Date('2026-06-20T13:00:00.000Z'),
    endsAt: new Date('2026-06-20T16:00:00.000Z'),
    reason: null,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
  });
}

describe('AvailabilityBlocksController', () => {
  let controller: AvailabilityBlocksController;
  let listUseCase: jest.Mocked<ListAvailabilityBlocksUseCase>;
  let createUseCase: jest.Mocked<CreateAvailabilityBlockUseCase>;
  let deleteUseCase: jest.Mocked<DeleteAvailabilityBlockUseCase>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [AvailabilityBlocksController],
      providers: [
        { provide: ListAvailabilityBlocksUseCase, useValue: { execute: jest.fn() } },
        { provide: CreateAvailabilityBlockUseCase, useValue: { execute: jest.fn() } },
        { provide: DeleteAvailabilityBlockUseCase, useValue: { execute: jest.fn() } },
      ],
    }).compile();

    controller = module.get(AvailabilityBlocksController);
    listUseCase = module.get(
      ListAvailabilityBlocksUseCase,
    ) as jest.Mocked<ListAvailabilityBlocksUseCase>;
    createUseCase = module.get(
      CreateAvailabilityBlockUseCase,
    ) as jest.Mocked<CreateAvailabilityBlockUseCase>;
    deleteUseCase = module.get(
      DeleteAvailabilityBlockUseCase,
    ) as jest.Mocked<DeleteAvailabilityBlockUseCase>;
  });

  describe('GET /doctor/availability-blocks', () => {
    it('returns success with blocks list', async () => {
      listUseCase.execute.mockResolvedValue([makeBlock()]);

      const response = await controller.list(mockUser);

      expect(response.success).toBe(true);
      expect(response.data).toHaveLength(1);
      expect(response.data[0]?.id).toBe('b-001');
    });

    it('passes date range to the use case', async () => {
      listUseCase.execute.mockResolvedValue([]);

      await controller.list(mockUser, '2026-06-01', '2026-06-30');

      expect(listUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          doctorId: DOCTOR_ID,
          from: new Date('2026-06-01'),
          to: new Date('2026-06-30'),
        }),
      );
    });

    it('uses authenticated user sub as doctorId (anti-IDOR)', async () => {
      listUseCase.execute.mockResolvedValue([]);

      await controller.list(mockUser);

      expect(listUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ doctorId: DOCTOR_ID }),
      );
    });

    it('returns empty array when doctor has no blocks', async () => {
      listUseCase.execute.mockResolvedValue([]);

      const response = await controller.list(mockUser);

      expect(response.data).toEqual([]);
    });
  });

  describe('POST /doctor/availability-blocks', () => {
    it('creates a block and returns 201 with output shape', async () => {
      const block = makeBlock();
      createUseCase.execute.mockResolvedValue(block);

      const dto = {
        starts_at: '2026-06-20T13:00:00.000Z',
        ends_at: '2026-06-20T16:00:00.000Z',
      };

      const response = await controller.create(dto, mockUser);

      expect(response.success).toBe(true);
      expect(response.data.id).toBe('b-001');
      expect(response.data.doctor_id).toBe(DOCTOR_ID);
    });

    it('passes doctorId from user.sub (not from body)', async () => {
      createUseCase.execute.mockResolvedValue(makeBlock());

      const dto = {
        starts_at: '2026-06-20T13:00:00.000Z',
        ends_at: '2026-06-20T16:00:00.000Z',
      };

      await controller.create(dto, mockUser);

      expect(createUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ doctorId: DOCTOR_ID }),
      );
    });
  });

  describe('DELETE /doctor/availability-blocks/:id', () => {
    it('calls delete use case with blockId and actorId', async () => {
      deleteUseCase.execute.mockResolvedValue(undefined);

      await controller.remove('b-001', mockUser);

      expect(deleteUseCase.execute).toHaveBeenCalledWith({
        blockId: 'b-001',
        actorId: DOCTOR_ID,
      });
    });

    it('propagates AvailabilityBlockNotFoundError from use case', async () => {
      deleteUseCase.execute.mockRejectedValue(new AvailabilityBlockNotFoundError());

      await expect(controller.remove('b-001', mockUser)).rejects.toBeInstanceOf(
        AvailabilityBlockNotFoundError,
      );
    });
  });
});
