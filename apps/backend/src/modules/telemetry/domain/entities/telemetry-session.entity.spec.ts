import {
  TelemetrySession,
  PiiGuard,
  JOURNEY_HARD_LIMIT,
  type JourneyStepRaw,
} from './telemetry-session.entity';
import { PiiInEventError } from '../errors/pii-in-event.error';
import { JourneyTooLargeError } from '../errors/journey-too-large.error';

const ID = 'b1e2f3a4-5b6c-7d8e-9f0a-1b2c3d4e5f60';
const DOCTOR_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const SESSION_ID = 'sess-abc-123';
const now = new Date('2026-06-11T10:00:00Z');

function makeStep(overrides: Partial<JourneyStepRaw> = {}): JourneyStepRaw {
  return {
    action: 'page.view',
    resourceType: 'appointment',
    resourceId: 'c0ffee00-dead-beef-cafe-000000000001',
    occurredAt: now,
    metadata: { module: 'agenda' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// TelemetrySession.create
// ---------------------------------------------------------------------------
describe('TelemetrySession.create', () => {
  it('creates a session with valid steps', () => {
    const { session, rejected } = TelemetrySession.create({
      id: ID,
      sessionId: SESSION_ID,
      doctorId: DOCTOR_ID,
      rawSteps: [makeStep(), makeStep({ action: 'button.click' })],
      now,
    });

    expect(session.id).toBe(ID);
    expect(session.sessionId).toBe(SESSION_ID);
    expect(session.doctorId).toBe(DOCTOR_ID);
    expect(session.journey).toHaveLength(2);
    expect(session.eventCount).toBe(2);
    expect(rejected).toBe(0);
    expect(session.endedAt).toBeNull();
  });

  it('sets endedAt when ended is true', () => {
    const { session } = TelemetrySession.create({
      id: ID,
      sessionId: SESSION_ID,
      doctorId: DOCTOR_ID,
      rawSteps: [makeStep()],
      ended: true,
      now,
    });

    expect(session.endedAt).toEqual(now);
  });

  it('does not set endedAt when ended is false', () => {
    const { session } = TelemetrySession.create({
      id: ID,
      sessionId: SESSION_ID,
      doctorId: DOCTOR_ID,
      rawSteps: [makeStep()],
      ended: false,
      now,
    });

    expect(session.endedAt).toBeNull();
  });

  it('filters out PII steps and reports rejected count', () => {
    const { session, rejected } = TelemetrySession.create({
      id: ID,
      sessionId: SESSION_ID,
      doctorId: DOCTOR_ID,
      rawSteps: [makeStep(), makeStep({ metadata: { cedula: 'V-12345678' } })],
      now,
    });

    expect(session.journey).toHaveLength(1);
    expect(session.eventCount).toBe(1);
    expect(rejected).toBe(1);
  });

  it('filters out steps with empty action', () => {
    const { session, rejected } = TelemetrySession.create({
      id: ID,
      sessionId: SESSION_ID,
      doctorId: DOCTOR_ID,
      rawSteps: [makeStep({ action: '' }), makeStep()],
      now,
    });

    expect(session.journey).toHaveLength(1);
    expect(rejected).toBe(1);
  });

  it('handles empty rawSteps array gracefully', () => {
    const { session, rejected } = TelemetrySession.create({
      id: ID,
      sessionId: SESSION_ID,
      doctorId: DOCTOR_ID,
      rawSteps: [],
      now,
    });

    expect(session.journey).toHaveLength(0);
    expect(session.eventCount).toBe(0);
    expect(rejected).toBe(0);
    expect(session.startedAt).toEqual(now);
  });

  it('uses the earliest occurred_at as startedAt', () => {
    const earlier = new Date('2026-06-11T09:00:00Z');
    const later = new Date('2026-06-11T11:00:00Z');
    const { session } = TelemetrySession.create({
      id: ID,
      sessionId: SESSION_ID,
      doctorId: DOCTOR_ID,
      rawSteps: [makeStep({ occurredAt: later }), makeStep({ occurredAt: earlier })],
      now,
    });

    expect(session.startedAt).toEqual(earlier);
  });

  it('accepts null doctorId', () => {
    const { session } = TelemetrySession.create({
      id: ID,
      sessionId: SESSION_ID,
      doctorId: null,
      rawSteps: [makeStep()],
      now,
    });

    expect(session.doctorId).toBeNull();
  });

  it('trims whitespace from action', () => {
    const { session } = TelemetrySession.create({
      id: ID,
      sessionId: SESSION_ID,
      doctorId: DOCTOR_ID,
      rawSteps: [makeStep({ action: '  button.click  ' })],
      now,
    });

    expect(session.journey[0]!.action).toBe('button.click');
  });
});

// ---------------------------------------------------------------------------
// TelemetrySession.append
// ---------------------------------------------------------------------------
describe('TelemetrySession.append', () => {
  function makeSession(journeySize = 1): TelemetrySession {
    const { session } = TelemetrySession.create({
      id: ID,
      sessionId: SESSION_ID,
      doctorId: DOCTOR_ID,
      rawSteps: Array.from({ length: journeySize }, () => makeStep()),
      now,
    });
    return session;
  }

  it('appends valid steps and returns correct counts', () => {
    const session = makeSession(1);
    const later = new Date('2026-06-11T11:00:00Z');
    const {
      session: updated,
      appended,
      rejected,
    } = session.append([makeStep(), makeStep({ action: 'nav.click' })], false, later);

    expect(appended).toBe(2);
    expect(rejected).toBe(0);
    expect(updated.journey).toHaveLength(3);
    expect(updated.eventCount).toBe(3);
    expect(updated.lastSeenAt).toEqual(later);
    expect(updated.endedAt).toBeNull();
  });

  it('sets endedAt when ended is true', () => {
    const session = makeSession(1);
    const later = new Date('2026-06-11T11:00:00Z');
    const { session: updated } = session.append([makeStep()], true, later);

    expect(updated.endedAt).toEqual(later);
  });

  it('preserves existing endedAt if ended is false', () => {
    const { session: ended } = TelemetrySession.create({
      id: ID,
      sessionId: SESSION_ID,
      doctorId: DOCTOR_ID,
      rawSteps: [makeStep()],
      ended: true,
      now,
    });

    const later = new Date('2026-06-11T11:00:00Z');
    const { session: updated } = ended.append([makeStep()], false, later);

    // endedAt was already stamped; appending with ended=false should not clear it
    expect(updated.endedAt).toEqual(now);
  });

  it('counts PII steps as rejected and does not include them', () => {
    const session = makeSession(1);
    const { appended, rejected } = session.append(
      [makeStep({ metadata: { email: 'x@y.com' } }), makeStep()],
      false,
      now,
    );

    expect(appended).toBe(1);
    expect(rejected).toBe(1);
  });

  it('throws JourneyTooLargeError when journey is already at the hard limit', () => {
    // Build a session artificially at the limit
    const steps = Array.from({ length: JOURNEY_HARD_LIMIT }, () => makeStep());
    const bigSession = new TelemetrySession(
      ID,
      SESSION_ID,
      DOCTOR_ID,
      steps.map((s) => ({
        action: s.action,
        resourceType: s.resourceType ?? null,
        resourceId: s.resourceId ?? null,
        occurredAt: s.occurredAt,
        metadata: s.metadata ?? null,
      })),
      JOURNEY_HARD_LIMIT,
      now,
      now,
      null,
      now,
    );

    expect(() => bigSession.append([makeStep()], false, now)).toThrow(JourneyTooLargeError);
  });

  it('caps appended steps at available slots before hard limit', () => {
    const nearlFull = JOURNEY_HARD_LIMIT - 1;
    const steps = Array.from({ length: nearlFull }, () => ({
      action: 'page.view',
      resourceType: null,
      resourceId: null,
      occurredAt: now,
      metadata: null,
    }));
    const session = new TelemetrySession(
      ID,
      SESSION_ID,
      DOCTOR_ID,
      steps,
      nearlFull,
      now,
      now,
      null,
      now,
    );

    // Try to append 5 steps when only 1 slot remains
    const { appended, rejected } = session.append(
      Array.from({ length: 5 }, () => makeStep()),
      false,
      now,
    );

    expect(appended).toBe(1);
    // The extra 4 valid steps that couldn't fit are counted as rejected/capped
    expect(rejected).toBe(4);
  });

  it('does not mutate the original session (immutability)', () => {
    const session = makeSession(1);
    const originalLength = session.journey.length;
    session.append([makeStep()], false, now);

    expect(session.journey).toHaveLength(originalLength);
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
      expect(() => PiiGuard.assertSafe({ [key]: 'anything' })).toThrow(PiiInEventError);
    });
  }

  it('rejects prohibited key regardless of original case', () => {
    expect(() => PiiGuard.assertSafe({ CEDULA: 'V-12345678' })).toThrow(PiiInEventError);
  });
});

// ---------------------------------------------------------------------------
// PiiGuard — prohibited value patterns
// ---------------------------------------------------------------------------
describe('PiiGuard — prohibited value patterns', () => {
  it('rejects Venezuelan cedula pattern V-', () => {
    expect(() => PiiGuard.assertSafe({ ref: 'V-12345678' })).toThrow(PiiInEventError);
  });

  it('rejects foreign cedula pattern E-', () => {
    expect(() => PiiGuard.assertSafe({ ref: 'E-12345678' })).toThrow(PiiInEventError);
  });

  it('rejects juridical cedula pattern J-', () => {
    expect(() => PiiGuard.assertSafe({ ref: 'J-12345678' })).toThrow(PiiInEventError);
  });

  it('rejects email address pattern', () => {
    expect(() => PiiGuard.assertSafe({ info: 'user@example.com' })).toThrow(PiiInEventError);
  });

  it('rejects Venezuelan phone +58', () => {
    expect(() => PiiGuard.assertSafe({ contact: '+584121234567' })).toThrow(PiiInEventError);
  });

  it('rejects Venezuelan phone 04 prefix', () => {
    expect(() => PiiGuard.assertSafe({ contact: '04121234567' })).toThrow(PiiInEventError);
  });

  it('rejects string value longer than 512 chars', () => {
    expect(() => PiiGuard.assertSafe({ note: 'a'.repeat(513) })).toThrow(PiiInEventError);
  });

  it('accepts short alphanumeric string', () => {
    expect(() => PiiGuard.assertSafe({ tag: 'dashboard-v2' })).not.toThrow();
  });

  it('accepts UUID-style resource identifiers', () => {
    expect(() =>
      PiiGuard.assertSafe({ appt_id: 'c0ffee00-dead-beef-cafe-000000000001' }),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// PiiGuard — nested objects
// ---------------------------------------------------------------------------
describe('PiiGuard — nested object check', () => {
  it('rejects prohibited key in nested object (depth 1)', () => {
    expect(() => PiiGuard.assertSafe({ context: { cedula: 'V-12345678' } })).toThrow(
      PiiInEventError,
    );
  });

  it('rejects PII value in nested object (depth 1)', () => {
    expect(() => PiiGuard.assertSafe({ context: { ref: 'V-12345678' } })).toThrow(PiiInEventError);
  });

  it('accepts safe nested object', () => {
    expect(() => PiiGuard.assertSafe({ context: { tab: 'overview', page: 2 } })).not.toThrow();
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

// ---------------------------------------------------------------------------
// PiiGuard.filterSteps
// ---------------------------------------------------------------------------
describe('PiiGuard.filterSteps', () => {
  it('returns all valid steps when none contain PII', () => {
    const { validSteps, rejected } = PiiGuard.filterSteps([makeStep(), makeStep()]);
    expect(validSteps).toHaveLength(2);
    expect(rejected).toBe(0);
  });

  it('filters out PII steps without throwing', () => {
    const { validSteps, rejected } = PiiGuard.filterSteps([
      makeStep({ metadata: { cedula: 'V-99999999' } }),
      makeStep(),
    ]);
    expect(validSteps).toHaveLength(1);
    expect(rejected).toBe(1);
  });

  it('filters out steps with empty action', () => {
    const { validSteps, rejected } = PiiGuard.filterSteps([makeStep({ action: '   ' })]);
    expect(validSteps).toHaveLength(0);
    expect(rejected).toBe(1);
  });

  it('handles empty input', () => {
    const { validSteps, rejected } = PiiGuard.filterSteps([]);
    expect(validSteps).toHaveLength(0);
    expect(rejected).toBe(0);
  });

  it('rethrows unexpected non-PII/non-format errors from step validation', () => {
    // Simulate an unexpected error (not PiiInEventError nor InvalidEventError)
    // by patching assertValueSafe to throw a TypeError on a specific call
    const original = PiiGuard.assertValueSafe;
    jest.spyOn(PiiGuard, 'assertValueSafe').mockImplementationOnce(() => {
      throw new TypeError('unexpected internal error');
    });

    expect(() =>
      PiiGuard.filterSteps([
        { action: 'page.view', resourceId: 'some-id', occurredAt: now, metadata: null },
      ]),
    ).toThrow(TypeError);

    PiiGuard.assertValueSafe = original;
  });
});
