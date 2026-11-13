import { Test, TestingModule } from '@nestjs/testing';
import { AdminRetentionController } from './admin-retention.controller';
import { GetRetentionMetricsUseCase } from '../../application/use-cases/get-retention-metrics.use-case';
import type { RetentionMetrics } from '../../domain/repositories/iretention-invite.repository';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import { RolesGuard } from '../../../../presentation/guards/roles.guard';

const EMPTY_METRICS: RetentionMetrics = {
  invitePreSent: 0,
  inviteExpiredSent: 0,
  inviteClicks: 0,
  meetingsScheduledFromEmail: 0,
  meetingsScheduledFromModal: 0,
  meetingsDone: 0,
  meetingsNoShow: 0,
  graceMonthsGranted: 0,
  contactRequestsPending: 0,
  contactRequestsContacted: 0,
  contactRequestsResolved: 0,
  doctorsReturned: 0,
};

describe('AdminRetentionController', () => {
  let controller: AdminRetentionController;
  let getMetrics: jest.Mocked<GetRetentionMetricsUseCase>;

  beforeEach(async () => {
    getMetrics = {
      execute: jest.fn().mockResolvedValue(EMPTY_METRICS),
    } as unknown as jest.Mocked<GetRetentionMetricsUseCase>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminRetentionController],
      providers: [{ provide: GetRetentionMetricsUseCase, useValue: getMetrics }],
    })
      .overrideGuard(AppAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(AdminRetentionController);
  });

  it('returns success envelope with metrics', async () => {
    const result = await controller.metrics({ from: '2026-10-01', to: '2026-10-31' });
    expect(result).toEqual({ success: true, data: EMPTY_METRICS });
  });

  it('passes from/to strings to use case', async () => {
    await controller.metrics({ from: '2026-10-01', to: '2026-10-31' });
    expect(getMetrics.execute).toHaveBeenCalledWith({ from: '2026-10-01', to: '2026-10-31' });
  });

  it('throws ZodError for missing from param', async () => {
    await expect(controller.metrics({ to: '2026-10-31' })).rejects.toThrow();
  });

  it('throws ZodError for missing to param', async () => {
    await expect(controller.metrics({ from: '2026-10-01' })).rejects.toThrow();
  });
});
