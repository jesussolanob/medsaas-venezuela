import { ActionEvent, PiiGuard } from './action-event.entity';
import { PiiInEventError } from '../errors/pii-in-event.error';

const baseParams = {
  id: 'b1e2f3a4-5b6c-7d8e-9f0a-1b2c3d4e5f60',
  doctorId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  sessionId: 'sess-abc-123',
  action: 'page.view',
  resourceType: 'appointment',
  resourceId: 'c0ffee00-dead-beef-cafe-000000000001',
  metadata: { module: 'agenda', view: 'week' } as Record<string, unknown>,
  occurredAt: new Date('2026-06-11T10:00:00Z'),
  createdAt: new Date('2026-06-11T10:00:01Z'),
};

describe('ActionEvent.create', () => {
  it('creates a valid event with all fields', () => {
    const event = ActionEvent.create(baseParams);

    expect(event.id).toBe(baseParams.id);
    expect(event.doctorId).toBe(baseParams.doctorId);
    expect(event.sessionId).toBe(baseParams.sessionId);
    expect(event.action).toBe('page.view');
    expect(event.resourceType).toBe('appointment');
    expect(event.resourceId).toBe(baseParams.resourceId);
    expect(event.metadata).toEqual({ module: 'agenda', view: 'week' });
    expect(event.occurredAt).toEqual(baseParams.occurredAt);
    expect(event.createdAt).toEqual(baseParams.createdAt);
  });

  it('creates an event with null optional fields', () => {
    const event = ActionEvent.create({
      ...baseParams,
      doctorId: null,
      sessionId: null,
      resourceType: null,
      resourceId: null,
      metadata: null,
    });

    expect(event.doctorId).toBeNull();
    expect(event.sessionId).toBeNull();
    expect(event.resourceType).toBeNull();
    expect(event.resourceId).toBeNull();
    expect(event.metadata).toBeNull();
  });

  it('trims whitespace from action', () => {
    const event = ActionEvent.create({ ...baseParams, action: '  button.click  ' });
    expect(event.action).toBe('button.click');
  });

  it('throws PiiInEventError when action is empty', () => {
    expect(() => ActionEvent.create({ ...baseParams, action: '' })).toThrow(PiiInEventError);
  });

  it('throws PiiInEventError when action is whitespace only', () => {
    expect(() => ActionEvent.create({ ...baseParams, action: '   ' })).toThrow(PiiInEventError);
  });

  it('accepts sentry_event_id in metadata (Sentry correlation, non-PII)', () => {
    const event = ActionEvent.create({
      ...baseParams,
      metadata: { sentry_event_id: 'abc123def456', level: 'error' },
    });
    expect(event.metadata).toEqual({ sentry_event_id: 'abc123def456', level: 'error' });
  });

  it('accepts numeric metadata values', () => {
    const event = ActionEvent.create({
      ...baseParams,
      metadata: { retries: 3, duration_ms: 250 },
    });
    expect(event.metadata).toEqual({ retries: 3, duration_ms: 250 });
  });

  it('accepts boolean metadata values', () => {
    const event = ActionEvent.create({
      ...baseParams,
      metadata: { success: true, cached: false },
    });
    expect(event.metadata).toEqual({ success: true, cached: false });
  });
});

// ---------------------------------------------------------------------------
// PiiGuard — prohibited key names
// ---------------------------------------------------------------------------
describe('PiiGuard — prohibited key names', () => {
  const prohibited = [
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
  ];

  for (const key of prohibited) {
    it(`rejects metadata with key "${key}"`, () => {
      expect(() => ActionEvent.create({ ...baseParams, metadata: { [key]: 'anything' } })).toThrow(
        PiiInEventError,
      );
    });
  }

  it('rejects prohibited key regardless of original case', () => {
    // PiiGuard normalises keys to lowercase before checking
    expect(() => ActionEvent.create({ ...baseParams, metadata: { CEDULA: 'V-12345678' } })).toThrow(
      PiiInEventError,
    );
  });
});

// ---------------------------------------------------------------------------
// PiiGuard — prohibited value patterns
// ---------------------------------------------------------------------------
describe('PiiGuard — prohibited value patterns', () => {
  it('rejects Venezuelan cedula pattern V- in metadata value', () => {
    expect(() => ActionEvent.create({ ...baseParams, metadata: { ref: 'V-12345678' } })).toThrow(
      PiiInEventError,
    );
  });

  it('rejects foreign cedula pattern E- in metadata value', () => {
    expect(() => ActionEvent.create({ ...baseParams, metadata: { ref: 'E-12345678' } })).toThrow(
      PiiInEventError,
    );
  });

  it('rejects juridical cedula pattern J- in metadata value', () => {
    expect(() => ActionEvent.create({ ...baseParams, metadata: { ref: 'J-12345678' } })).toThrow(
      PiiInEventError,
    );
  });

  it('rejects email address pattern in metadata value', () => {
    expect(() =>
      ActionEvent.create({ ...baseParams, metadata: { info: 'user@example.com' } }),
    ).toThrow(PiiInEventError);
  });

  it('rejects Venezuelan phone with country code (+58) in metadata value', () => {
    expect(() =>
      ActionEvent.create({ ...baseParams, metadata: { contact: '+584121234567' } }),
    ).toThrow(PiiInEventError);
  });

  it('rejects Venezuelan phone with local prefix (04) in metadata value', () => {
    expect(() =>
      ActionEvent.create({ ...baseParams, metadata: { contact: '04121234567' } }),
    ).toThrow(PiiInEventError);
  });

  it('rejects metadata string value longer than 512 chars', () => {
    const longString = 'a'.repeat(513);
    expect(() => ActionEvent.create({ ...baseParams, metadata: { note: longString } })).toThrow(
      PiiInEventError,
    );
  });

  it('accepts short alphanumeric strings', () => {
    expect(() =>
      ActionEvent.create({ ...baseParams, metadata: { tag: 'dashboard-v2' } }),
    ).not.toThrow();
  });

  it('accepts UUID-style resource identifiers', () => {
    expect(() =>
      ActionEvent.create({
        ...baseParams,
        metadata: { appt_id: 'c0ffee00-dead-beef-cafe-000000000001' },
      }),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// PiiGuard — resource_id field
// ---------------------------------------------------------------------------
describe('PiiGuard — resource_id PII check', () => {
  it('rejects resource_id that looks like an email', () => {
    expect(() => ActionEvent.create({ ...baseParams, resourceId: 'user@example.com' })).toThrow(
      PiiInEventError,
    );
  });

  it('rejects resource_id that looks like a cedula', () => {
    expect(() => ActionEvent.create({ ...baseParams, resourceId: 'V-12345678' })).toThrow(
      PiiInEventError,
    );
  });

  it('accepts resource_id that is a UUID', () => {
    expect(() =>
      ActionEvent.create({
        ...baseParams,
        resourceId: 'c0ffee00-dead-beef-cafe-000000000001',
      }),
    ).not.toThrow();
  });

  it('accepts null resource_id', () => {
    expect(() => ActionEvent.create({ ...baseParams, resourceId: null })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// PiiGuard — nested objects (1 level deep)
// ---------------------------------------------------------------------------
describe('PiiGuard — nested object check', () => {
  it('rejects prohibited key in nested object (depth 1)', () => {
    expect(() =>
      ActionEvent.create({
        ...baseParams,
        metadata: { context: { cedula: 'V-12345678' } },
      }),
    ).toThrow(PiiInEventError);
  });

  it('rejects PII value in nested object (depth 1)', () => {
    expect(() =>
      ActionEvent.create({
        ...baseParams,
        metadata: { context: { ref: 'V-12345678' } },
      }),
    ).toThrow(PiiInEventError);
  });

  it('accepts safe nested object', () => {
    expect(() =>
      ActionEvent.create({
        ...baseParams,
        metadata: { context: { tab: 'overview', page: 2 } },
      }),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// PiiGuard.assertValueSafe (direct)
// ---------------------------------------------------------------------------
describe('PiiGuard.assertValueSafe', () => {
  it('does not throw for safe string', () => {
    expect(() => PiiGuard.assertValueSafe('key', 'safe-value')).not.toThrow();
  });

  it('throws for email pattern', () => {
    expect(() => PiiGuard.assertValueSafe('key', 'x@y.com')).toThrow(PiiInEventError);
  });

  it('throws for cedula pattern', () => {
    expect(() => PiiGuard.assertValueSafe('key', 'V-99999999')).toThrow(PiiInEventError);
  });

  it('throws for overly long value', () => {
    expect(() => PiiGuard.assertValueSafe('key', 'x'.repeat(513))).toThrow(PiiInEventError);
  });
});
