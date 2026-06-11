import { Inject, Injectable } from '@nestjs/common';
import {
  TELEMETRY_SESSION_REPOSITORY,
  type ITelemetrySessionRepository,
  type TelemetrySessionListResult,
} from '../../../domain/repositories/telemetry-session.repository';
import type { QueryTelemetrySessionsDto } from '@delta/shared-types';

/**
 * QueryTelemetrySessionsUseCase
 *
 * Returns paginated TelemetrySession records including their full journey JSONB.
 * Intended for admin audit panel — requires super_admin role enforced at
 * the controller level via @Roles('super_admin').
 *
 * Journey data is included because this is an explicit audit surface.
 * The sessions table itself never stores PII (enforced by PiiGuard).
 */
@Injectable()
export class QueryTelemetrySessionsUseCase {
  constructor(
    @Inject(TELEMETRY_SESSION_REPOSITORY)
    private readonly repo: ITelemetrySessionRepository,
  ) {}

  async execute(dto: QueryTelemetrySessionsDto): Promise<TelemetrySessionListResult> {
    return this.repo.findAll({
      doctorId: dto.doctorId,
      from: dto.from !== undefined ? new Date(dto.from) : undefined,
      to: dto.to !== undefined ? new Date(dto.to) : undefined,
      limit: dto.limit,
      offset: dto.offset,
    });
  }
}
