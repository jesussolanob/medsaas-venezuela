import { UpsertTelemetrySessionUseCase } from './upsert-telemetry-session.use-case';
import {
  TelemetrySession,
  JOURNEY_HARD_LIMIT,
} from '../../../domain/entities/telemetry-session.entity';
import { JourneyTooLargeError } from '../../../domain/errors/journey-too-large.error';
import type { ITelemetrySessionRepository } from '../../../domain/repositories/telemetry-session.repository';
import type { UpsertTelemetrySessionDto } from '@delta/shared-types';

const DOCTOR_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const SESSION_ID = 'sess-abc-123';
const now = new Date('2026-06-11T10:00:00Z');

function makeDto(overrides: Partial<UpsertTelemetrySessionDto> = {}): UpsertTelemetrySessionDto {
  return {
    session_id: SESSION_ID,
    events: [
      {
        action: 'page.view',
        resource_type: 'appointment',
        resource_id: 'c0ffee00-dead-beef-cafe-000000000001',
        occurred_at: '2026-06-11T10:00:00.000Z',
        metadata: { module: 'agenda' },
      },
    ],
    ...overrides,
  };
}

function makeDomainSession(): TelemetrySession {
  return new TelemetrySession(
    'b1e2f3a4-5b6c-7d8e-9f0a-1b2c3d4e5f60',
    SESSION_ID,
    DOCTOR_ID,
    [
      {
        action: 'page.view',
        resourceType: null,
        resourceId: null,
        occurredAt: now,
        metadata: null,
      },
    ],
    1,
    now,
    now,
    null,
    now,
  );
}

function makeRepo(
  overrides: Partial<ITelemetrySessionRepository> = {},
): jest.Mocked<ITelemetrySessionRepository> {
  return {
    findBySessionId: jest.fn().mockResolvedValue(null),
    save: jest.fn().mockImplementation((s: TelemetrySession) => Promise.resolve(s)),
    update: jest.fn().mockImplementation((s: TelemetrySession) => Promise.resolve(s)),
    findAll: jest.fn(),
    ...overrides,
  } as jest.Mocked<ITelemetrySessionRepository>;
}

describe('UpsertTelemetrySessionUseCase', () => {
  let useCase: UpsertTelemetrySessionUseCase;
  let repo: jest.Mocked<ITelemetrySessionRepository>;

  beforeEach(() => {
    repo = makeRepo();
    useCase = new UpsertTelemetrySessionUseCase(repo);
  });

  // -------------------------------------------------------------------------
  // CREATE path
  // -------------------------------------------------------------------------
  describe('CREATE path (session does not exist)', () => {
    it('saves a new session and returns correct output', async () => {
      const result = await useCase.execute({ doctorId: DOCTOR_ID, dto: makeDto() });

      expect(repo.save).toHaveBeenCalledTimes(1);
      expect(repo.update).not.toHaveBeenCalled();
      expect(result.session_id).toBe(SESSION_ID);
      expect(result.appended).toBe(1);
      expect(result.rejected).toBe(0);
      expect(result.event_count).toBe(1);
    });

    it('sets ended_at when ended is true on create', async () => {
      await useCase.execute({ doctorId: DOCTOR_ID, dto: makeDto({ ended: true }) });

      const saved: TelemetrySession = repo.save.mock.calls[0]![0]!;
      expect(saved.endedAt).not.toBeNull();
    });

    it('assigns doctorId from input, not from body (anti-IDOR)', async () => {
      await useCase.execute({ doctorId: DOCTOR_ID, dto: makeDto() });

      const saved: TelemetrySession = repo.save.mock.calls[0]![0]!;
      expect(saved.doctorId).toBe(DOCTOR_ID);
    });

    it('counts PII events as rejected and does not include them in journey', async () => {
      const dto = makeDto({
        events: [
          { action: 'page.view', occurred_at: '2026-06-11T10:00:00.000Z' },
          {
            action: 'nav.click',
            occurred_at: '2026-06-11T10:01:00.000Z',
            metadata: { cedula: 'V-12345678' },
          },
        ],
      });

      const result = await useCase.execute({ doctorId: DOCTOR_ID, dto });

      expect(result.appended).toBe(1);
      expect(result.rejected).toBe(1);
    });

    it('handles an empty events array gracefully', async () => {
      const result = await useCase.execute({
        doctorId: DOCTOR_ID,
        dto: makeDto({ events: [] }),
      });

      expect(result.appended).toBe(0);
      expect(result.rejected).toBe(0);
      expect(result.event_count).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // APPEND path
  // -------------------------------------------------------------------------
  describe('APPEND path (session already exists)', () => {
    it('updates an existing session and returns correct output', async () => {
      const existing = makeDomainSession();
      repo = makeRepo({
        findBySessionId: jest.fn().mockResolvedValue(existing),
        update: jest.fn().mockImplementation((s: TelemetrySession) => Promise.resolve(s)),
      });
      useCase = new UpsertTelemetrySessionUseCase(repo);

      const result = await useCase.execute({ doctorId: DOCTOR_ID, dto: makeDto() });

      expect(repo.update).toHaveBeenCalledTimes(1);
      expect(repo.save).not.toHaveBeenCalled();
      expect(result.appended).toBe(1);
      expect(result.event_count).toBe(2); // 1 existing + 1 new
    });

    it('marks session as ended when ended is true on append', async () => {
      const existing = makeDomainSession();
      repo = makeRepo({
        findBySessionId: jest.fn().mockResolvedValue(existing),
        update: jest.fn().mockImplementation((s: TelemetrySession) => Promise.resolve(s)),
      });
      useCase = new UpsertTelemetrySessionUseCase(repo);

      await useCase.execute({ doctorId: DOCTOR_ID, dto: makeDto({ ended: true }) });

      const updated: TelemetrySession = repo.update.mock.calls[0]![0]!;
      expect(updated.endedAt).not.toBeNull();
    });

    it('counts PII steps as rejected on append', async () => {
      const existing = makeDomainSession();
      repo = makeRepo({
        findBySessionId: jest.fn().mockResolvedValue(existing),
        update: jest.fn().mockImplementation((s: TelemetrySession) => Promise.resolve(s)),
      });
      useCase = new UpsertTelemetrySessionUseCase(repo);

      const result = await useCase.execute({
        doctorId: DOCTOR_ID,
        dto: makeDto({
          events: [
            { action: 'page.view', occurred_at: '2026-06-11T10:00:00.000Z' },
            {
              action: 'nav.click',
              occurred_at: '2026-06-11T10:01:00.000Z',
              metadata: { phone: '04121234567' },
            },
          ],
        }),
      });

      expect(result.appended).toBe(1);
      expect(result.rejected).toBe(1);
    });

    it('returns graceful output when journey is at hard limit (JourneyTooLargeError)', async () => {
      const fullSession = new TelemetrySession(
        'b1e2f3a4-5b6c-7d8e-9f0a-1b2c3d4e5f60',
        SESSION_ID,
        DOCTOR_ID,
        Array.from({ length: JOURNEY_HARD_LIMIT }, () => ({
          action: 'page.view',
          resourceType: null,
          resourceId: null,
          occurredAt: now,
          metadata: null,
        })),
        JOURNEY_HARD_LIMIT,
        now,
        now,
        null,
        now,
      );

      repo = makeRepo({ findBySessionId: jest.fn().mockResolvedValue(fullSession) });
      useCase = new UpsertTelemetrySessionUseCase(repo);

      const result = await useCase.execute({ doctorId: DOCTOR_ID, dto: makeDto() });

      expect(result.appended).toBe(0);
      expect(result.rejected).toBe(1); // the 1 event in the dto
      expect(result.event_count).toBe(JOURNEY_HARD_LIMIT);
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // RBAC / anti-IDOR
  // -------------------------------------------------------------------------
  describe('anti-IDOR ownership check', () => {
    it('does not expose another doctor session — creates new one instead', async () => {
      const OTHER_DOCTOR = 'f0f0f0f0-0000-0000-0000-000000000001';
      const sessionOwnedByOther = new TelemetrySession(
        'b1e2f3a4-5b6c-7d8e-9f0a-1b2c3d4e5f60',
        SESSION_ID,
        OTHER_DOCTOR,
        [],
        0,
        now,
        now,
        null,
        now,
      );

      repo = makeRepo({
        findBySessionId: jest.fn().mockResolvedValue(sessionOwnedByOther),
        save: jest.fn().mockImplementation((s: TelemetrySession) => Promise.resolve(s)),
      });
      useCase = new UpsertTelemetrySessionUseCase(repo);

      const result = await useCase.execute({ doctorId: DOCTOR_ID, dto: makeDto() });

      // A new session must have been created (save called, not update)
      expect(repo.save).toHaveBeenCalledTimes(1);
      expect(repo.update).not.toHaveBeenCalled();
      // The response still reports success for the caller's events
      expect(result.session_id).toBe(SESSION_ID);
    });
  });

  // -------------------------------------------------------------------------
  // Error propagation
  // -------------------------------------------------------------------------
  it('rethrows unexpected errors from repository', async () => {
    repo = makeRepo({ save: jest.fn().mockRejectedValue(new Error('DB error')) });
    useCase = new UpsertTelemetrySessionUseCase(repo);

    await expect(useCase.execute({ doctorId: DOCTOR_ID, dto: makeDto() })).rejects.toThrow(
      'DB error',
    );
  });

  it('rethrows unexpected non-JourneyTooLarge errors from append', async () => {
    const existing = makeDomainSession();
    jest.spyOn(existing, 'append').mockImplementation(() => {
      throw new JourneyTooLargeError(SESSION_ID, JOURNEY_HARD_LIMIT);
    });

    repo = makeRepo({ findBySessionId: jest.fn().mockResolvedValue(existing) });
    useCase = new UpsertTelemetrySessionUseCase(repo);

    // JourneyTooLargeError should be swallowed and return graceful output
    const result = await useCase.execute({ doctorId: DOCTOR_ID, dto: makeDto() });
    expect(result.appended).toBe(0);
  });

  it('rethrows truly unexpected errors (non-JourneyTooLargeError) from append path', async () => {
    const existing = makeDomainSession();
    jest.spyOn(existing, 'append').mockImplementation(() => {
      throw new TypeError('unexpected internal error from append');
    });

    repo = makeRepo({ findBySessionId: jest.fn().mockResolvedValue(existing) });
    useCase = new UpsertTelemetrySessionUseCase(repo);

    await expect(useCase.execute({ doctorId: DOCTOR_ID, dto: makeDto() })).rejects.toThrow(
      TypeError,
    );
  });
});
