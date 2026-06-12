import { Test, type TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { SettingsController, AdminSettingsController } from './settings.controller';
import { GetUsdtRateUseCase } from '../../application/use-cases/finances/get-usdt-rate.use-case';
import { UpdateUsdtRateUseCase } from '../../application/use-cases/finances/update-usdt-rate.use-case';
import { SetRateSourceUseCase } from '../../application/use-cases/finances/set-rate-source.use-case';
import { GetRatesSummaryUseCase } from '../../application/use-cases/finances/get-rates-summary.use-case';
import { DevAuthGuard } from '../../../../infrastructure/auth/dev-auth.guard';
import { RolesGuard } from '../../../../presentation/guards/roles.guard';
import { Reflector } from '@nestjs/core';
import type { CurrentUserPayload } from '../../../../presentation/decorators/current-user.decorator';
import type { RatesSummary } from '../../domain/repositories/usdt-rate.store';

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

const defaultSummary: RatesSummary = {
  source: 'binance',
  manual: null,
  binance: 40.0,
  bcv: 38.5,
  effective: 40.0,
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
    mockGetRate.execute.mockResolvedValue({ rate: 36.5, source: 'binance' });
    const result = await controller.getUsdtRate();
    expect(result.success).toBe(true);
    expect(result.data.rate).toBe(36.5);
  });

  it('returns null rate when not configured', async () => {
    mockGetRate.execute.mockResolvedValue({ rate: null, source: 'binance' });
    const result = await controller.getUsdtRate();
    expect(result.data.rate).toBeNull();
  });

  it('includes source in the response', async () => {
    mockGetRate.execute.mockResolvedValue({ rate: 40.0, source: 'bcv' });
    const result = await controller.getUsdtRate();
    expect(result.data.source).toBe('bcv');
  });
});

describe('AdminSettingsController', () => {
  let controller: AdminSettingsController;
  let mockUpdateRate: jest.Mocked<UpdateUsdtRateUseCase>;
  let mockSetSource: jest.Mocked<SetRateSourceUseCase>;
  let mockGetSummary: jest.Mocked<GetRatesSummaryUseCase>;
  let rolesGuard: RolesGuard;

  beforeEach(async () => {
    mockUpdateRate = { execute: jest.fn() } as unknown as jest.Mocked<UpdateUsdtRateUseCase>;
    mockSetSource = { execute: jest.fn() } as unknown as jest.Mocked<SetRateSourceUseCase>;
    mockGetSummary = { execute: jest.fn() } as unknown as jest.Mocked<GetRatesSummaryUseCase>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminSettingsController],
      providers: [
        Reflector,
        RolesGuard,
        { provide: UpdateUsdtRateUseCase, useValue: mockUpdateRate },
        { provide: SetRateSourceUseCase, useValue: mockSetSource },
        { provide: GetRatesSummaryUseCase, useValue: mockGetSummary },
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

  it('sets rate source to binance and returns result', async () => {
    mockSetSource.execute.mockResolvedValue({ source: 'binance', rate: 41.0 });
    const result = await controller.setRateSource({ source: 'binance' });
    expect(result.success).toBe(true);
    expect(result.data.source).toBe('binance');
    expect(result.data.rate).toBe(41.0);
  });

  it('sets rate source to manual with value', async () => {
    mockSetSource.execute.mockResolvedValue({ source: 'manual', rate: 50.0 });
    const result = await controller.setRateSource({ source: 'manual', value: 50.0 });
    expect(result.success).toBe(true);
    expect(result.data.source).toBe('manual');
  });

  it('returns rates summary', async () => {
    mockGetSummary.execute.mockResolvedValue(defaultSummary);
    const result = await controller.getRates();
    expect(result.success).toBe(true);
    expect(result.data.source).toBe('binance');
    expect(result.data.binance).toBe(40.0);
    expect(result.data.bcv).toBe(38.5);
    expect(result.data.effective).toBe(40.0);
  });

  it('RolesGuard blocks non-super_admin actors', () => {
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
