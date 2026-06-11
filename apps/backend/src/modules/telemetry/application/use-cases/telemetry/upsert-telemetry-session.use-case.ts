import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  TELEMETRY_SESSION_REPOSITORY,
  type ITelemetrySessionRepository,
} from '../../../domain/repositories/telemetry-session.repository';
import { TelemetrySession } from '../../../domain/entities/telemetry-session.entity';
import { JourneyTooLargeError } from '../../../domain/errors/journey-too-large.error';
import type { UpsertTelemetrySessionDto } from '@delta/shared-types';

export interface UpsertTelemetrySessionInput {
  /** Extracted from the auth token — never from the request body (anti-IDOR). */
  doctorId: string;
  dto: UpsertTelemetrySessionDto;
}

export interface UpsertTelemetrySessionOutput {
  session_id: string;
  appended: number;
  rejected: number;
  event_count: number;
}

/**
 * UpsertTelemetrySessionUseCase
 *
 * Receives a partial journey for a session identified by session_id.
 * If the session does not exist it creates it (INSERT).
 * If it already exists it appends the new events (UPDATE via domain.append()).
 *
 * PII filtering happens inside the TelemetrySession domain entity — invalid
 * steps are silently discarded and counted in `rejected`.
 *
 * Anti-IDOR: doctorId always comes from user.sub (auth token), never from body.
 */
@Injectable()
export class UpsertTelemetrySessionUseCase {
  constructor(
    @Inject(TELEMETRY_SESSION_REPOSITORY)
    private readonly repo: ITelemetrySessionRepository,
  ) {}

  async execute(input: UpsertTelemetrySessionInput): Promise<UpsertTelemetrySessionOutput> {
    const { doctorId, dto } = input;
    const now = new Date();

    const rawSteps = dto.events.map((e) => ({
      action: e.action,
      resourceType: e.resource_type ?? null,
      resourceId: e.resource_id ?? null,
      occurredAt: new Date(e.occurred_at),
      metadata:
        e.metadata !== null && e.metadata !== undefined
          ? (e.metadata as Record<string, unknown>)
          : null,
    }));

    const existing = await this.repo.findBySessionId(dto.session_id);

    if (!existing) {
      // CREATE path
      const { session, rejected } = TelemetrySession.create({
        id: randomUUID(),
        sessionId: dto.session_id,
        doctorId,
        rawSteps,
        ended: dto.ended ?? false,
        now,
      });

      const saved = await this.repo.save(session);

      return {
        session_id: saved.sessionId,
        appended: saved.eventCount,
        rejected,
        event_count: saved.eventCount,
      };
    }

    // APPEND path — anti-IDOR: verify ownership
    if (existing.doctorId !== null && existing.doctorId !== doctorId) {
      // Ownership mismatch — treat as not found (no information leak)
      const { session, rejected } = TelemetrySession.create({
        id: randomUUID(),
        sessionId: `${dto.session_id}--${randomUUID()}`,
        doctorId,
        rawSteps,
        ended: dto.ended ?? false,
        now,
      });
      const saved = await this.repo.save(session);
      return {
        session_id: dto.session_id,
        appended: saved.eventCount,
        rejected,
        event_count: saved.eventCount,
      };
    }

    try {
      const {
        session: updated,
        appended,
        rejected,
      } = existing.append(rawSteps, dto.ended ?? false, now);

      const saved = await this.repo.update(updated);

      return {
        session_id: saved.sessionId,
        appended,
        rejected,
        event_count: saved.eventCount,
      };
    } catch (err) {
      if (err instanceof JourneyTooLargeError) {
        // Session is full — return graceful response without crashing caller
        return {
          session_id: dto.session_id,
          appended: 0,
          rejected: rawSteps.length,
          event_count: existing.eventCount,
        };
      }
      throw err;
    }
  }
}
