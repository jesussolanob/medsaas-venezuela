import { Test, type TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { SettingsController, AdminSettingsController } from './settings.controller';
import { GetUsdtRateUseCase } from '../../application/use-cases/finances/get-usdt-rate.use-case';
import { GetBcvRateByDateUseCase } from '../../application/use-cases/finances/get-bcv-rate-by-date.use-case';
import { UpdateUsdtRateUseCase } from '../../application/use-cases/finances/update-usdt-rate.use-case';
import { SetRateSourceUseCase } from '../../application/use-cases/finances/set-rate-source.use-case';
import { GetRatesSummaryUseCase } from '../../application/use-cases/finances/get-rates-summary.use-case';
import { RolesGuard } from '../../../../presentation/guards/roles.guard';
import { Reflector } from '@nestjs/core';
import type { CurrentUserPayload } from '../../../../presentation/decorators/current-user.decorator';
import type { RatesSummary } from '../../domain/repositories/usdt-rate.store';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';

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
  let mockGetBcvByDate: jest.Mocked<GetBcvRateByDateUseCase>;

  beforeEach(async () => {
    mockGetRate = { execute: jest.fn() } as unknown as jest.Mocked<GetUsdtRateUseCase>;
    mockGetBcvByDate = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetBcvRateByDateUseCase>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SettingsController],
      providers: [
        { provide: GetUsdtRateUseCase, useValue: mockGetRate },
        { provide: GetBcvRateByDateUseCase, useValue: mockGetBcvByDate },
      ],
    })
      .overrideGuard(AppAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

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

  it('getBcvRate — returns rate for given date', async () => {
    mockGetBcvByDate.execute.mockResolvedValue({
      rate: 36.5,
      date: '2026-07-10',
      source: 'pydolarve',
    });
    const result = await controller.getBcvRate('2026-07-10');
    expect(result.success).toBe(true);
    expect(result.data.rate).toBe(36.5);
    expect(result.data.date).toBe('2026-07-10');
    expect(result.data.source).toBe('pydolarve');
    expect(mockGetBcvByDate.execute).toHaveBeenCalledWith({ date: '2026-07-10' });
  });

  it('getBcvRate — defaults to today when no date provided', async () => {
    const today = new Date().toISOString().slice(0, 10);
    mockGetBcvByDate.execute.mockResolvedValue({ rate: 38.0, date: today, source: 'cache' });
    const result = await controller.getBcvRate(undefined);
    expect(result.success).toBe(true);
    expect(mockGetBcvByDate.execute).toHaveBeenCalledWith({ date: today });
  });

  it('getBcvRate — throws BadRequestException for invalid date format', async () => {
    await expect(controller.getBcvRate('not-a-date')).rejects.toThrow(BadRequestException);
    await expect(controller.getBcvRate('2026/07/10')).rejects.toThrow(BadRequestException);
    await expect(controller.getBcvRate('20260710')).rejects.toThrow(BadRequestException);
    expect(mockGetBcvByDate.execute).not.toHaveBeenCalled();
  });

  it('getBcvRate — returns null rate when all sources unavailable', async () => {
    mockGetBcvByDate.execute.mockResolvedValue({
      rate: null,
      date: '2026-07-10',
      source: 'unavailable',
    });
    const result = await controller.getBcvRate('2026-07-10');
    expect(result.success).toBe(true);
    expect(result.data.rate).toBeNull();
    expect(result.data.source).toBe('unavailable');
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
      .overrideGuard(AppAuthGuard)
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
