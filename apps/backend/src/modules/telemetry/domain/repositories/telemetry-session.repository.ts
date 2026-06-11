import type { TelemetrySession } from '../entities/telemetry-session.entity';

export const TELEMETRY_SESSION_REPOSITORY = Symbol('ITelemetrySessionRepository');

export interface TelemetrySessionQueryFilters {
  doctorId?: string;
  from?: Date;
  to?: Date;
  limit: number;
  offset: number;
}

export interface TelemetrySessionListResult {
  items: TelemetrySession[];
  total: number;
  limit: number;
  offset: number;
}

export interface ITelemetrySessionRepository {
  /**
   * Find a session by its client-generated session_id.
   * Returns null when no matching session exists.
   */
  findBySessionId(sessionId: string): Promise<TelemetrySession | null>;

  /**
   * Persist a new TelemetrySession (INSERT).
   */
  save(session: TelemetrySession): Promise<TelemetrySession>;

  /**
   * Persist an updated TelemetrySession (full UPDATE by id).
   * Must replace journey, event_count, last_seen_at, ended_at.
   */
  update(session: TelemetrySession): Promise<TelemetrySession>;

  /**
   * Paginated query for the admin audit panel.
   * Optionally scoped to a single doctor and/or a date range on started_at.
   * Returns full sessions including the journey JSONB.
   */
  findAll(filters: TelemetrySessionQueryFilters): Promise<TelemetrySessionListResult>;
}
