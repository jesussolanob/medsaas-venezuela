import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { DevAuthGuard } from '../../../../infrastructure/auth/dev-auth.guard';
import { RolesGuard } from '../../../../presentation/guards/roles.guard';
import { Roles } from '../../../../presentation/decorators/roles.decorator';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../../presentation/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../../presentation/pipes/zod-validation.pipe';
import {
  IngestTelemetryBatchDtoSchema,
  QueryDoctorEventsDtoSchema,
  type IngestTelemetryBatchDto,
  type QueryDoctorEventsDto,
} from '@delta/shared-types';
import { IngestEventsBatchUseCase } from '../../application/use-cases/telemetry/ingest-events-batch.use-case';
import { QueryDoctorEventsUseCase } from '../../application/use-cases/telemetry/query-doctor-events.use-case';
import {
  type AdminActionEventDto,
  toAdminActionEventDto,
} from '../../application/dtos/action-event-admin.dto';

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
 * POST /api/telemetry/batch
 *   Doctor-authenticated. Ingests a batch of UI events (max 200).
 *   Returns { inserted, rejected } — partial insertion on PII violations.
 *
 * GET /api/telemetry/doctor
 *   Requires super_admin role. Returns paginated events for a given doctor.
 *   Used by support/analytics — no PII by design.
 */
@Controller('telemetry')
@UseGuards(DevAuthGuard)
export class TelemetryController {
  constructor(
    private readonly ingestBatch: IngestEventsBatchUseCase,
    private readonly queryEvents: QueryDoctorEventsUseCase,
  ) {}

  /**
   * POST /api/telemetry/batch
   *
   * Accepts a batch of UI action events from the authenticated doctor.
   * doctorId is extracted from the auth token — never from the body (anti-IDOR).
   * Restricted to `doctor` role — admins and patients must not inject events.
   *
   * Returns:
   *   { inserted: number, rejected: number }
   *   where `rejected` counts events silently discarded due to PII detection
   *   or format validation failures.
   */
  @Post('batch')
  @UseGuards(RolesGuard)
  @Roles('doctor')
  async ingestEventsBatch(
    @Body(new ZodValidationPipe(IngestTelemetryBatchDtoSchema))
    dto: IngestTelemetryBatchDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SuccessResponse<{ inserted: number; rejected: number }>> {
    const result = await this.ingestBatch.execute({
      doctorId: user.sub,
      events: dto.events,
    });
    return { success: true, data: result };
  }

  /**
   * GET /api/telemetry/doctor?doctorId=&from=&to=&limit=&offset=
   *
   * Returns paginated action events for the specified doctor.
   * Restricted to super_admin — intended for support and analytics.
   */
  @Get('doctor')
  @UseGuards(RolesGuard)
  @Roles('super_admin')
  async getDoctorEvents(
    @Query(new ZodValidationPipe(QueryDoctorEventsDtoSchema))
    query: QueryDoctorEventsDto,
  ): Promise<PaginatedResponse<AdminActionEventDto>> {
    const result = await this.queryEvents.execute(query);
    return {
      success: true,
      data: result.items.map(toAdminActionEventDto),
      meta: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
      },
    };
  }
}
