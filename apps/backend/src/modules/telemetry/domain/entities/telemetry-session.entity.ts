import { PiiInEventError } from '../errors/pii-in-event.error';
import { InvalidEventError } from '../errors/invalid-event.error';
import { JourneyTooLargeError } from '../errors/journey-too-large.error';

export const JOURNEY_HARD_LIMIT = 5_000;

/**
 * A single step in the doctor's UI journey.
 *
 * Immutable value type — validated through PiiGuard before inclusion.
 */
export interface JourneyStep {
  readonly action: string;
  readonly resourceType: string | null;
  readonly resourceId: string | null;
  readonly occurredAt: Date;
  readonly metadata: Record<string, unknown> | null;
}

export interface JourneyStepRaw {
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  occurredAt: Date;
  metadata?: Record<string, unknown> | null;
}

/**
 * TelemetrySession domain entity.
 *
 * Represents one continuous user session on the doctor portal.
 * The journey (array of steps) is stored as JSONB in a single row
 * so the full navigation path is immediately readable for auditing.
 *
 * Invariants:
 *   - sessionId must be non-empty.
 *   - Each JourneyStep action must be non-empty.
 *   - No step may contain PII (enforced by PiiGuard).
 *   - journey.length must not exceed JOURNEY_HARD_LIMIT.
 */
export class TelemetrySession {
  constructor(
    public readonly id: string,
    public readonly sessionId: string,
    public readonly doctorId: string | null,
    public readonly journey: readonly JourneyStep[],
    public readonly eventCount: number,
    public readonly startedAt: Date,
    public readonly lastSeenAt: Date,
    public readonly endedAt: Date | null,
    public readonly createdAt: Date,
  ) {}

  /**
   * Create a brand-new session from the first batch of steps.
   * Returns { session, rejected } where rejected is the count of
   * steps discarded due to PII or format violations.
   */
  static create(params: TelemetrySessionCreateParams): {
    session: TelemetrySession;
    rejected: number;
  } {
    const { validSteps, rejected } = PiiGuard.filterSteps(params.rawSteps);

    const earliest =
      validSteps.length > 0
        ? validSteps.reduce(
            (min, s) => (s.occurredAt < min ? s.occurredAt : min),
            validSteps[0]!.occurredAt,
          )
        : params.now;

    const session = new TelemetrySession(
      params.id,
      params.sessionId,
      params.doctorId ?? null,
      validSteps,
      validSteps.length,
      earliest,
      params.now,
      params.ended === true ? params.now : null,
      params.now,
    );

    return { session, rejected };
  }

  /**
   * Append new steps to an existing session (UPSERT path).
   * Returns a new TelemetrySession (immutable update) and the rejected count.
   *
   * Throws JourneyTooLargeError if the journey is already at JOURNEY_HARD_LIMIT
   * and no more steps can be accepted.
   */
  append(rawSteps: JourneyStepRaw[], ended: boolean, now: Date): AppendResult {
    if (this.journey.length >= JOURNEY_HARD_LIMIT) {
      throw new JourneyTooLargeError(this.sessionId, JOURNEY_HARD_LIMIT);
    }

    const { validSteps, rejected } = PiiGuard.filterSteps(rawSteps);

    const available = JOURNEY_HARD_LIMIT - this.journey.length;
    const accepted = validSteps.slice(0, available);
    const capped = validSteps.length - accepted.length;

    const newJourney: readonly JourneyStep[] = [...this.journey, ...accepted];
    const newSession = new TelemetrySession(
      this.id,
      this.sessionId,
      this.doctorId,
      newJourney,
      this.eventCount + accepted.length,
      this.startedAt,
      now,
      ended ? now : this.endedAt,
      this.createdAt,
    );

    return {
      session: newSession,
      appended: accepted.length,
      rejected: rejected + capped,
    };
  }
}

export interface TelemetrySessionCreateParams {
  id: string;
  sessionId: string;
  doctorId?: string | null;
  rawSteps: JourneyStepRaw[];
  ended?: boolean;
  now: Date;
}

export interface AppendResult {
  session: TelemetrySession;
  appended: number;
  rejected: number;
}

// ---------------------------------------------------------------------------
// PiiGuard — reused from the old ActionEvent module, adapted for JourneyStep
// ---------------------------------------------------------------------------

/**
 * PiiGuard — static anti-PII validator for telemetry journey step fields.
 *
 * Strategy: DENY-by-pattern + DENY-by-key.
 *
 * Prohibited key names (case-insensitive):
 *   cedula, email, phone, patient_name, diagnosis, treatment,
 *   medication_name, full_name, nombre, apellido, telefono, correo,
 *   nombre_completo
 *
 * Prohibited value patterns:
 *   - Venezuelan/foreign cedula: V-/E-/J- followed by digits
 *   - Email address: contains @
 *   - Phone: starts with +58 or 04 followed by digits
 */
export class PiiGuard {
  static readonly PROHIBITED_KEYS = new Set([
    'cedula',
    'email',
    'phone',
    'patient_name',
    'diagnosis',
    'treatment',
    'medication_name',
    'full_name',
    'nombre',
    'apellido',
    'telefono',
    'correo',
    'nombre_completo',
  ]);

  private static readonly PII_VALUE_PATTERNS: RegExp[] = [
    /^[VEJvej]-\d{5,}/,
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    /^\+58\d{10}$/,
    /^04\d{9}$/,
  ];

  /**
   * Filter a list of raw steps, returning valid steps and a rejected count.
   * Never throws — callers decide whether to abort or continue.
   */
  static filterSteps(rawSteps: JourneyStepRaw[]): {
    validSteps: JourneyStep[];
    rejected: number;
  } {
    const validSteps: JourneyStep[] = [];
    let rejected = 0;

    for (const raw of rawSteps) {
      try {
        if (!raw.action || raw.action.trim().length === 0) {
          throw new InvalidEventError('action field must not be empty');
        }

        if (raw.metadata !== null && raw.metadata !== undefined) {
          PiiGuard.assertSafe(raw.metadata);
        }

        if (raw.resourceId !== null && raw.resourceId !== undefined) {
          PiiGuard.assertValueSafe('resource_id', raw.resourceId);
        }

        validSteps.push({
          action: raw.action.trim(),
          resourceType: raw.resourceType ?? null,
          resourceId: raw.resourceId ?? null,
          occurredAt: raw.occurredAt,
          metadata: raw.metadata ?? null,
        });
      } catch (err) {
        if (err instanceof PiiInEventError || err instanceof InvalidEventError) {
          rejected++;
        } else {
          throw err;
        }
      }
    }

    return { validSteps, rejected };
  }

  /**
   * Throws PiiInEventError if the metadata object contains PII.
   * Recursively checks nested objects (1 level deep max).
   */
  static assertSafe(metadata: Record<string, unknown>, _depth = 0): void {
    for (const [key, value] of Object.entries(metadata)) {
      const normalKey = key.toLowerCase();
      if (PiiGuard.PROHIBITED_KEYS.has(normalKey)) {
        throw new PiiInEventError(`metadata key "${key}" is prohibited — it may expose PII`);
      }

      if (typeof value === 'string') {
        PiiGuard.assertValueSafe(key, value);
      } else if (
        _depth === 0 &&
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value)
      ) {
        PiiGuard.assertSafe(value as Record<string, unknown>, 1);
      }
    }
  }

  /** Throws PiiInEventError if a single string value matches a PII pattern. */
  static assertValueSafe(fieldName: string, value: string): void {
    for (const pattern of PiiGuard.PII_VALUE_PATTERNS) {
      if (pattern.test(value)) {
        throw new PiiInEventError(`field "${fieldName}" contains a value matching a PII pattern`);
      }
    }

    if (value.length > 512) {
      throw new PiiInEventError(`field "${fieldName}" value is too long (max 512 chars)`);
    }
  }
}
