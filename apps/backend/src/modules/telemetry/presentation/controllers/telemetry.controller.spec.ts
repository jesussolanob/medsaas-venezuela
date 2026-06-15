import { Test, type TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TelemetryController } from './telemetry.controller';
import { UpsertTelemetrySessionUseCase } from '../../application/use-cases/telemetry/upsert-telemetry-session.use-case';
import { QueryTelemetrySessionsUseCase } from '../../application/use-cases/telemetry/query-telemetry-sessions.use-case';
import { RolesGuard } from '../../../../presentation/guards/roles.guard';
import type { CurrentUserPayload } from '../../../../presentation/decorators/current-user.decorator';
import type { UpsertTelemetrySessionDto } from '@delta/shared-types';
import type { TelemetrySession } from '../../domain/entities/telemetry-session.entity';
import type { AdminTelemetrySessionDto } from '../../application/dtos/telemetry-session-admin.dto';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';

const DOCTOR_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const ADMIN_ID = 'f0f0f0f0-0000-0000-0000-000000000001';
const SESSION_ID = 'sess-abc-123';
const now = new Date('2026-06-11T10:00:00Z');

const doctorUser: CurrentUserPayload = { sub: DOCTOR_ID, role: 'doctor', email: 'doc@dev.local' };
const adminUser: CurrentUserPayload = {
  sub: ADMIN_ID,
  role: 'super_admin',
  email: 'admin@dev.local',
};

function makeUpsertDto(
  overrides: Partial<UpsertTelemetrySessionDto> = {},
): UpsertTelemetrySessionDto {
  return {
    session_id: SESSION_ID,
    events: [
      {
        action: 'page.view',
        resource_type: 'appointment',
        resource_id: 'c0ffee00-dead-beef-cafe-000000000001',
        occurred_at: '2026-06-11T10:00:00.000Z',
        metadata: { module: 'agenda' },
      },
    ],
    ...overrides,
  };
}

function makeFakeSession(): TelemetrySession {
  return {
    id: 'b1e2f3a4-5b6c-7d8e-9f0a-1b2c3d4e5f60',
    sessionId: SESSION_ID,
    doctorId: DOCTOR_ID,
    journey: [
      {
        action: 'page.view',
        resourceType: null,
        resourceId: null,
        occurredAt: now,
        metadata: null,
      },
    ],
    eventCount: 1,
    startedAt: now,
    lastSeenAt: now,
    endedAt: null,
    createdAt: now,
    append: jest.fn(),
  } as unknown as TelemetrySession;
}

describe('TelemetryController', () => {
  let controller: TelemetryController;

  const mockUpsertUseCase = { execute: jest.fn() };
  const mockQueryUseCase = { execute: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TelemetryController],
      providers: [
        { provide: UpsertTelemetrySessionUseCase, useValue: mockUpsertUseCase },
        { provide: QueryTelemetrySessionsUseCase, useValue: mockQueryUseCase },
        Reflector,
        RolesGuard,
      ],
    })
      .overrideGuard(AppAuthGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<TelemetryController>(TelemetryController);
  });

  // -------------------------------------------------------------------------
  // POST /api/telemetry/session
  // -------------------------------------------------------------------------
  describe('upsertTelemetrySession', () => {
    it('returns success with session_id, appended, rejected, event_count', async () => {
      mockUpsertUseCase.execute.mockResolvedValue({
        session_id: SESSION_ID,
        appended: 1,
        rejected: 0,
        event_count: 1,
      });

      const result = await controller.upsertTelemetrySession(makeUpsertDto(), doctorUser);

      expect(result).toEqual({
        success: true,
        data: { session_id: SESSION_ID, appended: 1, rejected: 0, event_count: 1 },
      });
    });

    it('passes doctorId from authenticated user, not from body (anti-IDOR)', async () => {
      mockUpsertUseCase.execute.mockResolvedValue({
        session_id: SESSION_ID,
        appended: 1,
        rejected: 0,
        event_count: 1,
      });

      await controller.upsertTelemetrySession(makeUpsertDto(), doctorUser);

      expect(mockUpsertUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ doctorId: DOCTOR_ID }),
      );
    });

    it('passes the full dto to the use case', async () => {
      mockUpsertUseCase.execute.mockResolvedValue({
        session_id: SESSION_ID,
        appended: 1,
        rejected: 0,
        event_count: 1,
      });
      const dto = makeUpsertDto({ ended: true });

      await controller.upsertTelemetrySession(dto, doctorUser);

      expect(mockUpsertUseCase.execute).toHaveBeenCalledWith({ doctorId: DOCTOR_ID, dto });
    });

    it('reports partial rejection in response', async () => {
      mockUpsertUseCase.execute.mockResolvedValue({
        session_id: SESSION_ID,
        appended: 1,
        rejected: 2,
        event_count: 3,
      });

      const result = await controller.upsertTelemetrySession(makeUpsertDto(), doctorUser);

      expect(result.data.appended).toBe(1);
      expect(result.data.rejected).toBe(2);
      expect(result.data.event_count).toBe(3);
    });

    it('RolesGuard blocks non-doctor users from POST /session', () => {
      const reflector = new Reflector();
      const guard = new RolesGuard(reflector);

      const mockContext = {
        switchToHttp: () => ({ getRequest: () => ({ user: adminUser }) }),
        getHandler: () => ({}),
        getClass: () => ({}),
      };

      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue(['doctor'] as CurrentUserPayload['role'][]);

      expect(() => guard.canActivate(mockContext as never)).toThrow(ForbiddenException);
    });

    it('RolesGuard allows doctor users for POST /session', () => {
      const reflector = new Reflector();
      const guard = new RolesGuard(reflector);

      const mockContext = {
        switchToHttp: () => ({ getRequest: () => ({ user: doctorUser }) }),
        getHandler: () => ({}),
        getClass: () => ({}),
      };

      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue(['doctor'] as CurrentUserPayload['role'][]);

      expect(guard.canActivate(mockContext as never)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/telemetry/sessions
  // -------------------------------------------------------------------------
  describe('getTelemetrySessions', () => {
    const mockListResult = {
      items: [] as TelemetrySession[],
      total: 0,
      limit: 50,
      offset: 0,
    };

    it('returns paginated response for admin', async () => {
      mockQueryUseCase.execute.mockResolvedValue(mockListResult);

      const result = await controller.getTelemetrySessions({
        limit: 50,
        offset: 0,
      });

      expect(result.success).toBe(true);
      expect(result.meta).toEqual({ total: 0, limit: 50, offset: 0 });
    });

    it('delegates query to QueryTelemetrySessionsUseCase', async () => {
      mockQueryUseCase.execute.mockResolvedValue(mockListResult);
      const query = {
        doctorId: DOCTOR_ID,
        from: '2026-06-01T00:00:00.000Z',
        to: '2026-06-30T23:59:59.000Z',
        limit: 20,
        offset: 0,
      };

      await controller.getTelemetrySessions(query);

      expect(mockQueryUseCase.execute).toHaveBeenCalledWith(query);
    });

    it('projects items to AdminTelemetrySessionDto including journey', async () => {
      const fakeSession = makeFakeSession();
      mockQueryUseCase.execute.mockResolvedValue({
        items: [fakeSession],
        total: 1,
        limit: 50,
        offset: 0,
      });

      const result = await controller.getTelemetrySessions({ limit: 50, offset: 0 });

      expect(result.data).toHaveLength(1);
      const dto = result.data[0] as AdminTelemetrySessionDto;
      expect(dto.sessionId).toBe(SESSION_ID);
      expect(dto.doctorId).toBe(DOCTOR_ID);
      expect(Array.isArray(dto.journey)).toBe(true);
    });

    it('RolesGuard blocks non-admin users from GET /sessions', () => {
      const reflector = new Reflector();
      const guard = new RolesGuard(reflector);

      const mockContext = {
        switchToHttp: () => ({ getRequest: () => ({ user: doctorUser }) }),
        getHandler: () => ({}),
        getClass: () => ({}),
      };

      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue(['super_admin'] as CurrentUserPayload['role'][]);

      expect(() => guard.canActivate(mockContext as never)).toThrow(ForbiddenException);
    });

    it('RolesGuard allows super_admin users for GET /sessions', () => {
      const reflector = new Reflector();
      const guard = new RolesGuard(reflector);

      const mockContext = {
        switchToHttp: () => ({ getRequest: () => ({ user: adminUser }) }),
        getHandler: () => ({}),
        getClass: () => ({}),
      };

      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue(['super_admin'] as CurrentUserPayload['role'][]);

      expect(guard.canActivate(mockContext as never)).toBe(true);
    });
  });
});
