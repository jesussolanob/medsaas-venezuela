import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { TelemetrySessionModel } from '../models/telemetry-session.model';
import {
  type ITelemetrySessionRepository,
  type TelemetrySessionQueryFilters,
  type TelemetrySessionListResult,
} from '../../../domain/repositories/telemetry-session.repository';
import {
  TelemetrySession,
  type JourneyStep,
} from '../../../domain/entities/telemetry-session.entity';

/**
 * Sequelize implementation of ITelemetrySessionRepository.
 *
 * SECURITY: never log the `journey` column values — they contain
 * arbitrary runtime JSONB and must not appear in server logs.
 */
@Injectable()
export class SequelizeTelemetrySessionRepository implements ITelemetrySessionRepository {
  constructor(
    @InjectModel(TelemetrySessionModel)
    private readonly model: typeof TelemetrySessionModel,
  ) {}

  async findBySessionId(sessionId: string): Promise<TelemetrySession | null> {
    const row = await this.model.findOne({ where: { sessionId } });
    return row ? this.toDomain(row) : null;
  }

  async save(session: TelemetrySession): Promise<TelemetrySession> {
    const row = await this.model.create({
      id: session.id,
      sessionId: session.sessionId,
      doctorId: session.doctorId,
      journey: session.journey as JourneyStep[],
      eventCount: session.eventCount,
      startedAt: session.startedAt,
      lastSeenAt: session.lastSeenAt,
      endedAt: session.endedAt,
    });
    return this.toDomain(row);
  }

  async update(session: TelemetrySession): Promise<TelemetrySession> {
    await this.model.update(
      {
        journey: session.journey as JourneyStep[],
        eventCount: session.eventCount,
        lastSeenAt: session.lastSeenAt,
        endedAt: session.endedAt,
      },
      { where: { id: session.id } },
    );
    // Return the session as-is (we trust the domain entity state)
    return session;
  }

  async findAll(filters: TelemetrySessionQueryFilters): Promise<TelemetrySessionListResult> {
    const where: Record<string, unknown> = {};

    if (filters.doctorId !== undefined) {
      where['doctorId'] = filters.doctorId;
    }

    const startedAtFilter: Record<symbol, Date> = {};
    if (filters.from !== undefined) startedAtFilter[Op.gte] = filters.from;
    if (filters.to !== undefined) startedAtFilter[Op.lte] = filters.to;

    if (Object.getOwnPropertySymbols(startedAtFilter).length > 0) {
      where['startedAt'] = startedAtFilter;
    }

    const { rows, count } = await this.model.findAndCountAll({
      where,
      limit: filters.limit,
      offset: filters.offset,
      order: [['startedAt', 'DESC']],
    });

    return {
      items: rows.map((row) => this.toDomain(row)),
      total: count,
      limit: filters.limit,
      offset: filters.offset,
    };
  }

  private toDomain(row: TelemetrySessionModel): TelemetrySession {
    return new TelemetrySession(
      row.id,
      row.sessionId,
      row.doctorId,
      row.journey as JourneyStep[],
      row.eventCount,
      row.startedAt,
      row.lastSeenAt,
      row.endedAt,
      row.createdAt,
    );
  }
}
