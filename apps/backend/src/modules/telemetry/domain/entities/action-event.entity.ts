import { PiiInEventError } from '../errors/pii-in-event.error';
import { InvalidEventError } from '../errors/invalid-event.error';

/**
 * ActionEvent domain entity.
 *
 * Represents a single UI telemetry event emitted by the doctor frontend.
 * Used for error-path reconstruction and usage analytics.
 *
 * Invariants enforced here:
 *   - action must be a non-empty string.
 *   - metadata must NOT contain PII (see PiiGuard).
 *   - resource_id must NOT look like a PII value.
 */
export class ActionEvent {
  constructor(
    public readonly id: string,
    public readonly doctorId: string | null,
    public readonly sessionId: string | null,
    public readonly action: string,
    public readonly resourceType: string | null,
    public readonly resourceId: string | null,
    public readonly metadata: Record<string, unknown> | null,
    public readonly occurredAt: Date,
    public readonly createdAt: Date,
  ) {}

  static create(params: ActionEventCreateParams): ActionEvent {
    if (!params.action || params.action.trim().length === 0) {
      throw new InvalidEventError('action field must not be empty');
    }

    // Validate metadata for PII
    if (params.metadata !== null && params.metadata !== undefined) {
      PiiGuard.assertSafe(params.metadata);
    }

    // Validate resource_id for PII patterns
    if (params.resourceId !== null && params.resourceId !== undefined) {
      PiiGuard.assertValueSafe('resource_id', params.resourceId);
    }

    return new ActionEvent(
      params.id,
      params.doctorId ?? null,
      params.sessionId ?? null,
      params.action.trim(),
      params.resourceType ?? null,
      params.resourceId ?? null,
      params.metadata ?? null,
      params.occurredAt,
      params.createdAt,
    );
  }
}

export interface ActionEventCreateParams {
  id: string;
  doctorId?: string | null;
  sessionId?: string | null;
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  metadata?: Record<string, unknown> | null;
  occurredAt: Date;
  createdAt: Date;
}

/**
 * PiiGuard — static anti-PII validator for ActionEvent metadata.
 *
 * Strategy: DENY-by-pattern + DENY-by-key.
 *
 * Prohibited key names (case-insensitive):
 *   cedula, email, phone, patient_name, diagnosis, treatment,
 *   medication_name, full_name, nombre, apellido, telefono, correo
 *
 * Prohibited value patterns:
 *   - Venezuelan/foreign cedula: V-/E-/J- followed by digits
 *   - Email address: contains @
 *   - Phone: starts with +58 or 04 followed by digits
 *
 * Allowed value types: uuid, short alphanumeric strings (<= 128 chars),
 *   numbers, booleans, null.
 *
 * Note: This is a best-effort guard. The source of truth is the frontend
 * instrumentation which must never include PII in events.
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

  /** Regex patterns that suggest a string value contains PII. */
  private static readonly PII_VALUE_PATTERNS: RegExp[] = [
    // Venezuelan / foreign cedula: V-12345678, E-12345678, J-12345678
    /^[VEJvej]-\d{5,}/,
    // Email address
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    // Venezuelan phone with country code or local prefix
    /^\+58\d{10}$/,
    /^04\d{9}$/,
  ];

  /**
   * Throws PiiInEventError if the metadata object contains PII.
   * Recursively checks nested objects (1 level deep max to avoid abuse).
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
        // Check one level of nesting only
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

    // Reject excessively long strings that could hide PII
    if (value.length > 512) {
      throw new PiiInEventError(`field "${fieldName}" value is too long (max 512 chars)`);
    }
  }
}
