import { Test, type TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { SettingsController, AdminSettingsController } from './settings.controller';
import { GetUsdtRateUseCase } from '../../application/use-cases/finances/get-usdt-rate.use-case';
import { UpdateUsdtRateUseCase } from '../../application/use-cases/finances/update-usdt-rate.use-case';
import { DevAuthGuard } from '../../../../infrastructure/auth/dev-auth.guard';
import { RolesGuard } from '../../../../presentation/guards/roles.guard';
import { Reflector } from '@nestjs/core';
import type { CurrentUserPayload } from '../../../../presentation/decorators/current-user.decorator';

const doctorUser: CurrentUserPayload = {
  sub: 'doctor-uuid-1',
  role: 'doctor',
  email: 'doctor@dev.local',
};

const superAdminUser: CurrentUserPayload = {
  sub: 'admin-uuid-1',
  role: 'super_admin',
  email: 'admin@dev.local',
};

describe('SettingsController (public)', () => {
  let controller: SettingsController;
  let mockGetRate: jest.Mocked<GetUsdtRateUseCase>;

  beforeEach(async () => {
    mockGetRate = { execute: jest.fn() } as unknown as jest.Mocked<GetUsdtRateUseCase>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SettingsController],
      providers: [{ provide: GetUsdtRateUseCase, useValue: mockGetRate }],
    }).compile();

    controller = module.get(SettingsController);
  });

  it('returns the current rate', async () => {
    mockGetRate.execute.mockResolvedValue({ rate: 36.5 });
    const result = await controller.getUsdtRate();
    expect(result.success).toBe(true);
    expect(result.data.rate).toBe(36.5);
  });

  it('returns null rate when not configured', async () => {
    mockGetRate.execute.mockResolvedValue({ rate: null });
    const result = await controller.getUsdtRate();
    expect(result.data.rate).toBeNull();
  });
});

describe('AdminSettingsController', () => {
  let controller: AdminSettingsController;
  let mockUpdateRate: jest.Mocked<UpdateUsdtRateUseCase>;
  let rolesGuard: RolesGuard;

  beforeEach(async () => {
    mockUpdateRate = { execute: jest.fn() } as unknown as jest.Mocked<UpdateUsdtRateUseCase>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminSettingsController],
      providers: [
        Reflector,
        RolesGuard,
        { provide: UpdateUsdtRateUseCase, useValue: mockUpdateRate },
      ],
    })
      .overrideGuard(DevAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(AdminSettingsController);
    rolesGuard = module.get(RolesGuard);
  });

  it('updates rate and returns typed output', async () => {
    mockUpdateRate.execute.mockResolvedValue({ rate: 40 });
    const result = await controller.updateUsdtRate({ rate: 40 });
    expect(result.success).toBe(true);
    expect(result.data.rate).toBe(40);
  });

  it('RolesGuard blocks non-super_admin actors', () => {
    // Simulate the guard check — RolesGuard reads ROLES_KEY from metadata.
    // We verify it throws ForbiddenException for a doctor role.
    const mockContext = {
      getHandler: () => AdminSettingsController.prototype.updateUsdtRate,
      getClass: () => AdminSettingsController,
      getArgs: () => [],
      getArgByIndex: () => undefined,
      switchToRpc: jest.fn(),
      switchToWs: jest.fn(),
      getType: () => 'http' as const,
      switchToHttp: () => ({
        getRequest: () => ({ user: doctorUser }),
        getResponse: () => ({}),
        getNext: () => ({}),
      }),
    } as unknown as Parameters<typeof rolesGuard.canActivate>[0];

    expect(() => rolesGuard.canActivate(mockContext)).toThrow(ForbiddenException);
  });

  it('RolesGuard allows super_admin access', () => {
    const mockContext = {
      getHandler: () => AdminSettingsController.prototype.updateUsdtRate,
      getClass: () => AdminSettingsController,
      getArgs: () => [],
      getArgByIndex: () => undefined,
      switchToRpc: jest.fn(),
      switchToWs: jest.fn(),
      getType: () => 'http' as const,
      switchToHttp: () => ({
        getRequest: () => ({ user: superAdminUser }),
        getResponse: () => ({}),
        getNext: () => ({}),
      }),
    } as unknown as Parameters<typeof rolesGuard.canActivate>[0];

    expect(rolesGuard.canActivate(mockContext)).toBe(true);
  });
});
