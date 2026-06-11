import { Test, type TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TelemetryController } from './telemetry.controller';
import { IngestEventsBatchUseCase } from '../../application/use-cases/telemetry/ingest-events-batch.use-case';
import { QueryDoctorEventsUseCase } from '../../application/use-cases/telemetry/query-doctor-events.use-case';
import { RolesGuard } from '../../../../presentation/guards/roles.guard';
import type { CurrentUserPayload } from '../../../../presentation/decorators/current-user.decorator';
import type { IngestTelemetryBatchDto } from '@delta/shared-types';
import type { ActionEvent } from '../../domain/entities/action-event.entity';
import type { ActionEventListResult } from '../../domain/repositories/action-event.repository';

const DOCTOR_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const ADMIN_ID = 'f0f0f0f0-0000-0000-0000-000000000001';

const doctorUser: CurrentUserPayload = { sub: DOCTOR_ID, role: 'doctor', email: 'doc@dev.local' };
const adminUser: CurrentUserPayload = {
  sub: ADMIN_ID,
  role: 'super_admin',
  email: 'admin@dev.local',
};

function makeValidBatchDto(count = 2): IngestTelemetryBatchDto {
  return {
    events: Array.from({ length: count }, (_, i) => ({
      action: `page.view.${i}`,
      resource_type: 'appointment',
      resource_id: 'c0ffee00-dead-beef-cafe-000000000001',
      metadata: { module: 'agenda' },
      occurred_at: '2026-06-11T10:00:00.000Z',
      session_id: 'sess-abc',
    })),
  };
}

describe('TelemetryController', () => {
  let controller: TelemetryController;

  const mockIngestUseCase = { execute: jest.fn() };
  const mockQueryUseCase = { execute: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TelemetryController],
      providers: [
        { provide: IngestEventsBatchUseCase, useValue: mockIngestUseCase },
        { provide: QueryDoctorEventsUseCase, useValue: mockQueryUseCase },
        Reflector,
        RolesGuard,
      ],
    }).compile();

    controller = module.get<TelemetryController>(TelemetryController);
  });

  // ---------------------------------------------------------------------------
  // POST /api/telemetry/batch
  // ---------------------------------------------------------------------------
  describe('ingestEventsBatch', () => {
    it('returns success with inserted/rejected counts', async () => {
      mockIngestUseCase.execute.mockResolvedValue({ inserted: 2, rejected: 0 });

      const result = await controller.ingestEventsBatch(makeValidBatchDto(), doctorUser);

      expect(result).toEqual({ success: true, data: { inserted: 2, rejected: 0 } });
    });

    it('passes doctorId from authenticated user, not from body (anti-IDOR)', async () => {
      mockIngestUseCase.execute.mockResolvedValue({ inserted: 1, rejected: 0 });
      const dto = makeValidBatchDto(1);

      await controller.ingestEventsBatch(dto, doctorUser);

      expect(mockIngestUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ doctorId: DOCTOR_ID }),
      );
    });

    it('reports partial rejection in response', async () => {
      mockIngestUseCase.execute.mockResolvedValue({ inserted: 1, rejected: 1 });

      const result = await controller.ingestEventsBatch(makeValidBatchDto(2), doctorUser);

      expect(result.data.inserted).toBe(1);
      expect(result.data.rejected).toBe(1);
    });

    it('delegates the full events array to the use case', async () => {
      mockIngestUseCase.execute.mockResolvedValue({ inserted: 2, rejected: 0 });
      const dto = makeValidBatchDto(2);

      await controller.ingestEventsBatch(dto, doctorUser);

      expect(mockIngestUseCase.execute).toHaveBeenCalledWith({
        doctorId: DOCTOR_ID,
        events: dto.events,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/telemetry/doctor
  // ---------------------------------------------------------------------------
  describe('getDoctorEvents', () => {
    const mockListResult: ActionEventListResult = {
      items: [] as ActionEvent[],
      total: 0,
      limit: 50,
      offset: 0,
    };

    it('returns paginated response for admin', async () => {
      mockQueryUseCase.execute.mockResolvedValue(mockListResult);

      const result = await controller.getDoctorEvents({
        doctorId: DOCTOR_ID,
        limit: 50,
        offset: 0,
      });

      expect(result.success).toBe(true);
      expect(result.meta).toEqual({ total: 0, limit: 50, offset: 0 });
    });

    it('delegates query to QueryDoctorEventsUseCase', async () => {
      mockQueryUseCase.execute.mockResolvedValue(mockListResult);
      const query = {
        doctorId: DOCTOR_ID,
        from: '2026-06-01T00:00:00.000Z',
        to: '2026-06-30T23:59:59.000Z',
        limit: 20,
        offset: 0,
      };

      await controller.getDoctorEvents(query);

      expect(mockQueryUseCase.execute).toHaveBeenCalledWith(query);
    });

    it('RolesGuard blocks non-admin users', async () => {
      // Direct RolesGuard test: simulate a non-admin request being rejected
      const reflector = new Reflector();
      const guard = new RolesGuard(reflector);

      // Build a mock execution context that provides a doctor user
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({ user: doctorUser }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      };

      // Override Reflector to simulate @Roles('super_admin') metadata
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue(['super_admin'] as CurrentUserPayload['role'][]);

      expect(() => guard.canActivate(mockContext as never)).toThrow(ForbiddenException);
    });

    it('RolesGuard allows super_admin users', () => {
      const reflector = new Reflector();
      const guard = new RolesGuard(reflector);

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({ user: adminUser }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      };

      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue(['super_admin'] as CurrentUserPayload['role'][]);

      expect(guard.canActivate(mockContext as never)).toBe(true);
    });

    it('wraps items in data array', async () => {
      const fakeItems = [{ id: 'some-id' }] as unknown as ActionEvent[];
      mockQueryUseCase.execute.mockResolvedValue({
        items: fakeItems,
        total: 1,
        limit: 50,
        offset: 0,
      });

      const result = await controller.getDoctorEvents({
        doctorId: DOCTOR_ID,
        limit: 50,
        offset: 0,
      });

      expect(result.data).toBe(fakeItems);
    });
  });
});
