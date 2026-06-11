import type { TelemetrySession, JourneyStep } from '../../domain/entities/telemetry-session.entity';

/**
 * AdminTelemetrySessionDto — output shape for GET /api/telemetry/sessions.
 *
 * Includes the full journey JSONB — this is an explicit admin audit surface.
 * SECURITY: journey steps are never logged server-side; the admin UI is
 * responsible for handling the data appropriately.
 */
export interface AdminTelemetrySessionDto {
  id: string;
  sessionId: string;
  doctorId: string | null;
  journey: JourneyStep[];
  eventCount: number;
  startedAt: Date;
  lastSeenAt: Date;
  endedAt: Date | null;
  createdAt: Date;
}

export function toAdminTelemetrySessionDto(session: TelemetrySession): AdminTelemetrySessionDto {
  return {
    id: session.id,
    sessionId: session.sessionId,
    doctorId: session.doctorId,
    journey: [...session.journey],
    eventCount: session.eventCount,
    startedAt: session.startedAt,
    lastSeenAt: session.lastSeenAt,
    endedAt: session.endedAt,
    createdAt: session.createdAt,
  };
}
