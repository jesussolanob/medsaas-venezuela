/**
 * Infrastructure repository spec — uses a mocked Sequelize model.
 * No live database required.
 *
 * This suite validates the mapping and query-building logic only.
 * Integration tests against real Postgres are deferred to the CI pipeline.
 */
import { SequelizeActionEventRepository } from './sequelize-action-event.repository';
import { ActionEvent } from '../../../domain/entities/action-event.entity';

const DOCTOR_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const now = new Date('2026-06-11T10:00:00Z');

function makeEvent(): ActionEvent {
  return new ActionEvent(
    'b1e2f3a4-5b6c-7d8e-9f0a-1b2c3d4e5f60',
    DOCTOR_ID,
    'sess-123',
    'page.view',
    'appointment',
    'c0ffee00-dead-beef-cafe-000000000001',
    { module: 'agenda' },
    now,
    now,
  );
}

function makeMockModel(overrides: Record<string, jest.Mock> = {}) {
  const baseRow = {
    id: 'b1e2f3a4-5b6c-7d8e-9f0a-1b2c3d4e5f60',
    doctorId: DOCTOR_ID,
    sessionId: 'sess-123',
    action: 'page.view',
    resourceType: 'appointment',
    resourceId: 'c0ffee00-dead-beef-cafe-000000000001',
    metadata: { module: 'agenda' },
    occurredAt: now,
    createdAt: now,
  };

  return {
    bulkCreate: jest.fn().mockResolvedValue([]),
    findAndCountAll: jest.fn().mockResolvedValue({
      rows: [baseRow],
      count: 1,
    }),
    ...overrides,
  };
}

describe('SequelizeActionEventRepository', () => {
  let repo: SequelizeActionEventRepository;
  let mockModel: ReturnType<typeof makeMockModel>;

  beforeEach(() => {
    mockModel = makeMockModel();
    repo = new SequelizeActionEventRepository(mockModel as never);
  });

  describe('bulkInsert', () => {
    it('calls model.bulkCreate with mapped rows', async () => {
      const events = [makeEvent()];
      const result = await repo.bulkInsert(events);

      expect(mockModel.bulkCreate).toHaveBeenCalledTimes(1);
      const rows = mockModel.bulkCreate.mock.calls[0]![0];
      expect(rows[0].action).toBe('page.view');
      expect(rows[0].doctorId).toBe(DOCTOR_ID);
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(events[0]);
    });

    it('calls bulkCreate with validate: false for performance', async () => {
      await repo.bulkInsert([makeEvent()]);
      const opts = mockModel.bulkCreate.mock.calls[0]![1];
      expect(opts.validate).toBe(false);
    });

    it('returns the original domain events unchanged', async () => {
      const events = [makeEvent(), makeEvent()];
      const result = await repo.bulkInsert(events);
      expect(result).toBe(events);
    });
  });

  describe('findByDoctor', () => {
    it('calls findAndCountAll with doctorId filter', async () => {
      await repo.findByDoctor({ doctorId: DOCTOR_ID, limit: 50, offset: 0 });

      expect(mockModel.findAndCountAll).toHaveBeenCalledTimes(1);
      const opts = mockModel.findAndCountAll.mock.calls[0]![0];
      expect(opts.where.doctorId).toBe(DOCTOR_ID);
      expect(opts.limit).toBe(50);
      expect(opts.offset).toBe(0);
    });

    it('maps rows to domain ActionEvent instances', async () => {
      const result = await repo.findByDoctor({
        doctorId: DOCTOR_ID,
        limit: 50,
        offset: 0,
      });

      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
      const item = result.items[0]!;
      expect(item).toBeInstanceOf(ActionEvent);
      expect(item.action).toBe('page.view');
      expect(item.doctorId).toBe(DOCTOR_ID);
    });

    it('returns correct limit and offset in result', async () => {
      const result = await repo.findByDoctor({
        doctorId: DOCTOR_ID,
        limit: 20,
        offset: 40,
      });

      expect(result.limit).toBe(20);
      expect(result.offset).toBe(40);
    });

    it('applies date range filter when from and to are provided', async () => {
      const from = new Date('2026-06-01T00:00:00Z');
      const to = new Date('2026-06-30T23:59:59Z');
      await repo.findByDoctor({ doctorId: DOCTOR_ID, from, to, limit: 50, offset: 0 });

      const opts = mockModel.findAndCountAll.mock.calls[0]![0];
      // occurredAt filter should have been set (presence of the key)
      expect(opts.where).toHaveProperty('occurredAt');
    });

    it('returns empty items when no rows found', async () => {
      mockModel = makeMockModel({
        findAndCountAll: jest.fn().mockResolvedValue({ rows: [], count: 0 }),
      });
      repo = new SequelizeActionEventRepository(mockModel as never);

      const result = await repo.findByDoctor({
        doctorId: DOCTOR_ID,
        limit: 50,
        offset: 0,
      });

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });
});
