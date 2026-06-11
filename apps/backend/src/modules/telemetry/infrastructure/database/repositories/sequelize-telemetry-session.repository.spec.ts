/**
 * Infrastructure repository spec — uses a mocked Sequelize model.
 * No live database required.
 */
import { SequelizeTelemetrySessionRepository } from './sequelize-telemetry-session.repository';
import { TelemetrySession } from '../../../domain/entities/telemetry-session.entity';

const DOCTOR_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const SESSION_ID = 'sess-abc-123';
const now = new Date('2026-06-11T10:00:00Z');

const baseJourney = [
  { action: 'page.view', resourceType: null, resourceId: null, occurredAt: now, metadata: null },
];

function makeSession(eventCount = 1): TelemetrySession {
  return new TelemetrySession(
    'b1e2f3a4-5b6c-7d8e-9f0a-1b2c3d4e5f60',
    SESSION_ID,
    DOCTOR_ID,
    baseJourney,
    eventCount,
    now,
    now,
    null,
    now,
  );
}

function makeModelRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'b1e2f3a4-5b6c-7d8e-9f0a-1b2c3d4e5f60',
    sessionId: SESSION_ID,
    doctorId: DOCTOR_ID,
    journey: baseJourney,
    eventCount: 1,
    startedAt: now,
    lastSeenAt: now,
    endedAt: null,
    createdAt: now,
    ...overrides,
  };
}

function makeMockModel(overrides: Record<string, jest.Mock> = {}) {
  return {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest
      .fn()
      .mockImplementation((data: Record<string, unknown>) => Promise.resolve(makeModelRow(data))),
    update: jest.fn().mockResolvedValue([1]),
    findAndCountAll: jest.fn().mockResolvedValue({
      rows: [makeModelRow()],
      count: 1,
    }),
    ...overrides,
  };
}

describe('SequelizeTelemetrySessionRepository', () => {
  let repo: SequelizeTelemetrySessionRepository;
  let mockModel: ReturnType<typeof makeMockModel>;

  beforeEach(() => {
    mockModel = makeMockModel();
    repo = new SequelizeTelemetrySessionRepository(mockModel as never);
  });

  // -------------------------------------------------------------------------
  // findBySessionId
  // -------------------------------------------------------------------------
  describe('findBySessionId', () => {
    it('returns null when no matching session exists', async () => {
      const result = await repo.findBySessionId('nonexistent');
      expect(result).toBeNull();
      expect(mockModel.findOne).toHaveBeenCalledWith({ where: { sessionId: 'nonexistent' } });
    });

    it('returns a TelemetrySession when found', async () => {
      mockModel = makeMockModel({
        findOne: jest.fn().mockResolvedValue(makeModelRow()),
      });
      repo = new SequelizeTelemetrySessionRepository(mockModel as never);

      const result = await repo.findBySessionId(SESSION_ID);

      expect(result).toBeInstanceOf(TelemetrySession);
      expect(result!.sessionId).toBe(SESSION_ID);
      expect(result!.doctorId).toBe(DOCTOR_ID);
      expect(result!.journey).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // save
  // -------------------------------------------------------------------------
  describe('save', () => {
    it('calls model.create with mapped fields', async () => {
      const session = makeSession();
      await repo.save(session);

      expect(mockModel.create).toHaveBeenCalledTimes(1);
      const args = mockModel.create.mock.calls[0]![0] as Record<string, unknown>;
      expect(args['sessionId']).toBe(SESSION_ID);
      expect(args['doctorId']).toBe(DOCTOR_ID);
      expect(args['journey']).toEqual(baseJourney);
      expect(args['eventCount']).toBe(1);
    });

    it('returns a TelemetrySession domain entity', async () => {
      const session = makeSession();
      const result = await repo.save(session);

      expect(result).toBeInstanceOf(TelemetrySession);
      expect(result.sessionId).toBe(SESSION_ID);
    });
  });

  // -------------------------------------------------------------------------
  // update
  // -------------------------------------------------------------------------
  describe('update', () => {
    it('calls model.update with journey, event_count, last_seen_at, ended_at', async () => {
      const session = makeSession();
      await repo.update(session);

      expect(mockModel.update).toHaveBeenCalledTimes(1);
      const [data, opts] = mockModel.update.mock.calls[0]!;
      expect(data.journey).toEqual(baseJourney);
      expect(data.eventCount).toBe(1);
      expect(data.lastSeenAt).toEqual(now);
      expect(data.endedAt).toBeNull();
      expect(opts.where).toEqual({ id: session.id });
    });

    it('returns the domain session passed as argument', async () => {
      const session = makeSession();
      const result = await repo.update(session);
      expect(result).toBe(session);
    });
  });

  // -------------------------------------------------------------------------
  // findAll
  // -------------------------------------------------------------------------
  describe('findAll', () => {
    it('calls findAndCountAll with doctorId filter', async () => {
      await repo.findAll({ doctorId: DOCTOR_ID, limit: 50, offset: 0 });

      const opts = mockModel.findAndCountAll.mock.calls[0]![0];
      expect(opts.where['doctorId']).toBe(DOCTOR_ID);
      expect(opts.limit).toBe(50);
      expect(opts.offset).toBe(0);
    });

    it('omits doctorId filter when not provided', async () => {
      await repo.findAll({ limit: 50, offset: 0 });

      const opts = mockModel.findAndCountAll.mock.calls[0]![0];
      expect(opts.where).not.toHaveProperty('doctorId');
    });

    it('maps rows to domain TelemetrySession instances', async () => {
      const result = await repo.findAll({ doctorId: DOCTOR_ID, limit: 50, offset: 0 });

      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toBeInstanceOf(TelemetrySession);
      expect(result.items[0]!.sessionId).toBe(SESSION_ID);
    });

    it('returns correct limit and offset in result', async () => {
      const result = await repo.findAll({ doctorId: DOCTOR_ID, limit: 20, offset: 40 });

      expect(result.limit).toBe(20);
      expect(result.offset).toBe(40);
    });

    it('applies date range filter when from and to are provided', async () => {
      const from = new Date('2026-06-01T00:00:00Z');
      const to = new Date('2026-06-30T23:59:59Z');
      await repo.findAll({ doctorId: DOCTOR_ID, from, to, limit: 50, offset: 0 });

      const opts = mockModel.findAndCountAll.mock.calls[0]![0];
      expect(opts.where).toHaveProperty('startedAt');
    });

    it('returns empty items when no rows found', async () => {
      mockModel = makeMockModel({
        findAndCountAll: jest.fn().mockResolvedValue({ rows: [], count: 0 }),
      });
      repo = new SequelizeTelemetrySessionRepository(mockModel as never);

      const result = await repo.findAll({ limit: 50, offset: 0 });

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('orders results by startedAt DESC', async () => {
      await repo.findAll({ limit: 10, offset: 0 });

      const opts = mockModel.findAndCountAll.mock.calls[0]![0];
      expect(opts.order).toEqual([['startedAt', 'DESC']]);
    });
  });
});
