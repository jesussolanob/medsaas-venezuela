import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  ACTION_EVENT_REPOSITORY,
  type IActionEventRepository,
} from '../../../domain/repositories/action-event.repository';
import { ActionEvent } from '../../../domain/entities/action-event.entity';
import { PiiInEventError } from '../../../domain/errors/pii-in-event.error';
import { InvalidEventError } from '../../../domain/errors/invalid-event.error';
import type { TelemetryEventInput } from '@delta/shared-types';

export interface IngestEventsInput {
  doctorId: string;
  events: TelemetryEventInput[];
}

export interface IngestEventsOutput {
  inserted: number;
  rejected: number;
}

/**
 * IngestEventsBatchUseCase
 *
 * Receives a batch of UI telemetry events from the frontend, validates each
 * event through the domain entity (PiiGuard), and persists the valid ones in
 * a single bulk INSERT.
 *
 * Strategy: partial insertion — PII-tainted events are silently discarded and
 * their count is reported in the response. Valid events are always inserted.
 * This prevents a single malformed event from dropping an entire session trace.
 *
 * Anti-IDOR: doctorId comes exclusively from the authenticated user token —
 * NEVER from the request body.
 */
@Injectable()
export class IngestEventsBatchUseCase {
  constructor(
    @Inject(ACTION_EVENT_REPOSITORY)
    private readonly repo: IActionEventRepository,
  ) {}

  async execute(input: IngestEventsInput): Promise<IngestEventsOutput> {
    const valid: ActionEvent[] = [];
    let rejected = 0;
    const now = new Date();

    for (const raw of input.events) {
      try {
        const event = ActionEvent.create({
          id: randomUUID(),
          doctorId: input.doctorId,
          sessionId: raw.session_id ?? null,
          action: raw.action,
          resourceType: raw.resource_type ?? null,
          resourceId: raw.resource_id ?? null,
          metadata:
            raw.metadata !== null && raw.metadata !== undefined
              ? (raw.metadata as Record<string, unknown>)
              : null,
          occurredAt: new Date(raw.occurred_at),
          createdAt: now,
        });
        valid.push(event);
      } catch (err) {
        if (err instanceof PiiInEventError || err instanceof InvalidEventError) {
          // PiiInEventError: security rejection (PII detected)
          // InvalidEventError: format rejection (e.g. empty action)
          // Both count as rejected — they do NOT inflate PII counters separately.
          rejected++;
        } else {
          throw err;
        }
      }
    }

    if (valid.length > 0) {
      await this.repo.bulkInsert(valid);
    }

    return { inserted: valid.length, rejected };
  }
}
