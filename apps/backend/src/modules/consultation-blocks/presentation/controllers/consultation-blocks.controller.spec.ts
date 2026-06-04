import { Test, type TestingModule } from '@nestjs/testing';
import { ConsultationBlocksController } from './consultation-blocks.controller';
import { GetConsultationBlocksUseCase } from '../../application/use-cases/consultation-blocks/get-consultation-blocks.use-case';
import { SaveConsultationBlocksUseCase } from '../../application/use-cases/consultation-blocks/save-consultation-blocks.use-case';
import { DevAuthGuard } from '../../../../infrastructure/auth/dev-auth.guard';
import type { CurrentUserPayload } from '../../../../presentation/decorators/current-user.decorator';
import { EmptyBlockConfigError } from '../../domain/errors/empty-block-config.error';
import { InvalidBlockKeyError } from '../../domain/errors/invalid-block-key.error';

const DOCTOR_ID = 'doctor-uuid-001';
const DOCTOR_USER: CurrentUserPayload = {
  sub: DOCTOR_ID,
  role: 'doctor',
  email: 'doc@dev.local',
};

describe('ConsultationBlocksController', () => {
  let controller: ConsultationBlocksController;
  let mockGetBlocks: jest.Mocked<Pick<GetConsultationBlocksUseCase, 'execute'>>;
  let mockSaveBlocks: jest.Mocked<Pick<SaveConsultationBlocksUseCase, 'execute'>>;

  beforeEach(async () => {
    mockGetBlocks = { execute: jest.fn() };
    mockSaveBlocks = { execute: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConsultationBlocksController],
      providers: [
        { provide: GetConsultationBlocksUseCase, useValue: mockGetBlocks },
        { provide: SaveConsultationBlocksUseCase, useValue: mockSaveBlocks },
      ],
    })
      .overrideGuard(DevAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ConsultationBlocksController>(ConsultationBlocksController);
  });

  // ── GET ───────────────────────────────────────────────────────────────────

  describe('GET /api/doctor/consultation-blocks', () => {
    it('delegates to GetConsultationBlocksUseCase with user.sub', async () => {
      const expected = {
        catalog: [],
        doctor_config: [],
        resolved: [],
        specialty_defaults: [],
        doctor_specialty: null,
      };
      (mockGetBlocks.execute as jest.Mock).mockResolvedValue(expected);

      const result = await controller.get(DOCTOR_USER);

      expect(mockGetBlocks.execute).toHaveBeenCalledWith(DOCTOR_ID);
      expect(result).toEqual({ success: true, data: expected });
    });

    it('wraps data in success envelope', async () => {
      (mockGetBlocks.execute as jest.Mock).mockResolvedValue({ catalog: [] });

      const result = await controller.get(DOCTOR_USER);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });
  });

  // ── PUT ───────────────────────────────────────────────────────────────────

  describe('PUT /api/doctor/consultation-blocks', () => {
    it('delegates to SaveConsultationBlocksUseCase with user.sub and validated dto', async () => {
      (mockSaveBlocks.execute as jest.Mock).mockResolvedValue({ success: true, blocks_saved: 2 });
      const dto = { blocks: [{ block_key: 'chief_complaint', enabled: true }] };

      const result = await controller.save(DOCTOR_USER, dto);

      expect(mockSaveBlocks.execute).toHaveBeenCalledWith(DOCTOR_ID, dto);
      expect(result).toEqual({ success: true, data: { success: true, blocks_saved: 2 } });
    });

    it('propagates EmptyBlockConfigError from use case', async () => {
      (mockSaveBlocks.execute as jest.Mock).mockRejectedValue(new EmptyBlockConfigError());

      await expect(
        controller.save(DOCTOR_USER, { blocks: [{ block_key: 'x', enabled: false }] }),
      ).rejects.toThrow(EmptyBlockConfigError);
    });

    it('propagates InvalidBlockKeyError from use case', async () => {
      (mockSaveBlocks.execute as jest.Mock).mockRejectedValue(new InvalidBlockKeyError('bad'));

      await expect(
        controller.save(DOCTOR_USER, { blocks: [{ block_key: 'bad', enabled: true }] }),
      ).rejects.toThrow(InvalidBlockKeyError);
    });

    it('always uses user.sub as doctorId regardless of body content', async () => {
      (mockSaveBlocks.execute as jest.Mock).mockResolvedValue({ success: true, blocks_saved: 0 });

      await controller.save(DOCTOR_USER, { blocks: [] });

      expect(mockSaveBlocks.execute).toHaveBeenCalledWith(DOCTOR_ID, expect.any(Object));
    });
  });
});
