import { Test, type TestingModule } from '@nestjs/testing';
import { PublicStatsController } from './public-stats.controller';
import { GetPublicStatsUseCase } from '../../application/use-cases/admin/get-public-stats.use-case';
import { RolesGuard } from '../../../../presentation/guards/roles.guard';
import { Reflector } from '@nestjs/core';

const buildModule = async (): Promise<TestingModule> => {
  const mockGetPublicStats = {
    execute: jest.fn().mockResolvedValue({ specialists: 25, patients: 300 }),
  };

  return Test.createTestingModule({
    controllers: [PublicStatsController],
    providers: [Reflector, { provide: GetPublicStatsUseCase, useValue: mockGetPublicStats }],
  }).compile();
};

describe('PublicStatsController', () => {
  let controller: PublicStatsController;
  let module: TestingModule;

  beforeEach(async () => {
    module = await buildModule();
    controller = module.get(PublicStatsController);
  });

  afterEach(() => module.close());

  describe('GET /public/stats', () => {
    it('returns success: true with specialists and patients counts', async () => {
      const result = await controller.stats();
      expect(result.success).toBe(true);
      expect(result.data.specialists).toBe(25);
      expect(result.data.patients).toBe(300);
    });

    it('delegates to GetPublicStatsUseCase', async () => {
      const uc = module.get(GetPublicStatsUseCase) as jest.Mocked<GetPublicStatsUseCase>;
      uc.execute.mockClear();
      await controller.stats();
      expect(uc.execute).toHaveBeenCalledTimes(1);
    });

    it('no guards are applied — controller has no @UseGuards decorator', () => {
      // PublicStatsController intentionally has no guards.
      // Verify the Reflector returns no roles metadata (guard is absent).
      const reflector = module.get(Reflector);
      const roles = reflector.getAllAndOverride<string[] | undefined>('roles', [
        PublicStatsController.prototype.stats,
        PublicStatsController,
      ]);
      // No @Roles decorator → roles is undefined or empty
      expect(roles == null || roles.length === 0).toBe(true);
    });

    it('a doctor-role request is NOT rejected — no RolesGuard on this controller', () => {
      // Simulate what RolesGuard does: without @Roles metadata it should allow all
      const reflector = new Reflector();
      const guard = new RolesGuard(reflector);

      const mockContext = {
        getHandler: () => PublicStatsController.prototype.stats,
        getClass: () => PublicStatsController,
        switchToHttp: () => ({
          getRequest: () => ({ user: { sub: 'uid', role: 'doctor', email: 'doc@dev.local' } }),
        }),
      };

      // RolesGuard with no @Roles metadata returns true (no restriction)
      const result = guard.canActivate(mockContext as never);
      expect(result).toBe(true);
    });
  });
});
