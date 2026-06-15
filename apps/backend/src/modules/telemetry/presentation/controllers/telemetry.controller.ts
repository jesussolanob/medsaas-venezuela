import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AppAuthGuard } from '../../../../infrastructure/auth/app-auth.guard';
import { RolesGuard } from '../../../../presentation/guards/roles.guard';
import { Roles } from '../../../../presentation/decorators/roles.decorator';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../../presentation/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';
import {
  UpsertTelemetrySessionDtoSchema,
  QueryTelemetrySessionsDtoSchema,
  type UpsertTelemetrySessionDto,
  type QueryTelemetrySessionsDto,
} from '@delta/shared-types';
import { UpsertTelemetrySessionUseCase } from '../../application/use-cases/telemetry/upsert-telemetry-session.use-case';
import { QueryTelemetrySessionsUseCase } from '../../application/use-cases/telemetry/query-telemetry-sessions.use-case';
import {
  type AdminTelemetrySessionDto,
  toAdminTelemetrySessionDto,
} from '../../application/dtos/telemetry-session-admin.dto';

interface SuccessResponse<T> {
  success: true;
  data: T;
}

interface PaginatedResponse<T> {
  success: true;
  data: T[];
  meta: { total: number; limit: number; offset: number };
}

/**
 * TelemetryController
 *
 * Global prefix 'api' is set in main.ts — do NOT repeat it here.
 *
 * POST /api/telemetry/session
 *   Doctor-authenticated. Upserts a session by session_id:
 *     - creates on first call;
 *     - appends journey steps on subsequent calls.
 *   Returns { session_id, appended, rejected, event_count }.
 *
 * GET /api/telemetry/sessions
 *   Requires super_admin role. Returns paginated sessions including
 *   full journey JSONB for audit purposes.
 */
@Controller('telemetry')
@UseGuards(AppAuthGuard)
export class TelemetryController {
  constructor(
    private readonly upsertSession: UpsertTelemetrySessionUseCase,
    private readonly querySessions: QueryTelemetrySessionsUseCase,
  ) {}

  /**
   * POST /api/telemetry/session
   *
   * Accepts a partial journey from the authenticated doctor.
   * doctorId is extracted from the auth token — never from the body (anti-IDOR).
   * Restricted to `doctor` role.
   *
   * Returns:
   *   { session_id, appended, rejected, event_count }
   *   where `rejected` counts events discarded due to PII detection
   *   or format validation failures, or because the journey is full.
   */
  @Post('session')
  @UseGuards(RolesGuard)
  @Roles('doctor')
  async upsertTelemetrySession(
    @Body(new ZodValidationPipe(UpsertTelemetrySessionDtoSchema))
    dto: UpsertTelemetrySessionDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<
    SuccessResponse<{
      session_id: string;
      appended: number;
      rejected: number;
      event_count: number;
    }>
  > {
    const result = await this.upsertSession.execute({
      doctorId: user.sub,
      dto,
    });
    return { success: true, data: result };
  }

  /**
   * GET /api/telemetry/sessions?doctorId=&from=&to=&limit=&offset=
   *
   * Returns paginated telemetry sessions with full journey JSONB.
   * Restricted to super_admin — intended for audit and support.
   */
  @Get('sessions')
  @UseGuards(RolesGuard)
  @Roles('super_admin')
  async getTelemetrySessions(
    @Query(new ZodValidationPipe(QueryTelemetrySessionsDtoSchema))
    query: QueryTelemetrySessionsDto,
  ): Promise<PaginatedResponse<AdminTelemetrySessionDto>> {
    const result = await this.querySessions.execute(query);
    return {
      success: true,
      data: result.items.map(toAdminTelemetrySessionDto),
      meta: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
      },
    };
  }
}
