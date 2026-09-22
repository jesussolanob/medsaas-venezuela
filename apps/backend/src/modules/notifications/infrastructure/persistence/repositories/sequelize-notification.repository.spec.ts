/**
 * SequelizeNotificationRepository — unit tests.
 *
 * Uses a mock of NotificationModel (no real DB) to verify SQL-level behavior:
 * which Sequelize methods are called, with which arguments, and that the domain
 * model is correctly mapped from the row.
 *
 * Postgres-specific notes:
 *   - We use `readAt: null` in WHERE (not `IS NULL`) because Sequelize maps
 *     `null` to `IS NULL` automatically for equality conditions.
 *   - Ensure no `= ANY(...)` is used (ADR-059): all IN conditions must use
 *     named replacements with `IN (:ids)`.
 */

import { SequelizeNotificationRepository } from './sequelize-notification.repository';
import { Notification } from '../../../domain/entities/notification.entity';

const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const OTHER_DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000002';
const NOTIF_ID = 'nnnnnnnn-0000-0000-0000-000000000001';
const now = new Date('2026-09-22T10:00:00Z');

function makeRow(
  overrides: Partial<{
    id: string;
    doctorId: string;
    type: string;
    title: string;
    body: string;
    entityType: string | null;
    entityId: string | null;
    readAt: Date | null;
    createdAt: Date;
  }> = {},
): Record<string, unknown> {
  return {
    id: NOTIF_ID,
    doctorId: DOCTOR_ID,
    type: 'quote_accepted',
    title: 'Presupuesto PRE-0001 aceptado',
    body: 'El presupuesto PRE-0001 fue aceptado.',
    entityType: 'quote',
    entityId: 'qqqqqqqq-0000-0000-0000-000000000001',
    readAt: null,
    createdAt: now,
    ...overrides,
  };
}

function makeModel(
  overrides: {
    findAll?: jest.Mock;
    findOne?: jest.Mock;
    create?: jest.Mock;
    update?: jest.Mock;
    count?: jest.Mock;
  } = {},
): typeof import('../models/notification.model').NotificationModel {
  return {
    findAll: overrides.findAll ?? jest.fn().mockResolvedValue([]),
    findOne: overrides.findOne ?? jest.fn().mockResolvedValue(null),
    create: overrides.create ?? jest.fn().mockResolvedValue(makeRow()),
    update: overrides.update ?? jest.fn().mockResolvedValue([0]),
    count: overrides.count ?? jest.fn().mockResolvedValue(0),
  } as unknown as typeof import('../models/notification.model').NotificationModel;
}

describe('SequelizeNotificationRepository', () => {
  describe('create', () => {
    it('calls model.create and maps the row to a Notification', async () => {
      const row = makeRow();
      const model = makeModel({ create: jest.fn().mockResolvedValue(row) });
      const repo = new SequelizeNotificationRepository(model);
      const notification = Notification.create({
        id: NOTIF_ID,
        doctorId: DOCTOR_ID,
        type: 'quote_accepted',
        title: 'Presupuesto PRE-0001 aceptado',
        body: 'El presupuesto PRE-0001 fue aceptado.',
        entityType: 'quote',
        entityId: 'qqqqqqqq-0000-0000-0000-000000000001',
        readAt: null,
        createdAt: now,
      });

      const result = await repo.create(notification);

      expect(model.create).toHaveBeenCalledTimes(1);
      expect(result).toBeInstanceOf(Notification);
      expect(result.doctorId).toBe(DOCTOR_ID);
    });

    /*
      Regresión de un bug REAL detectado en staging el 2026-09-22.

      El modelo declara `timestamps: false` (la tabla no tiene `updated_at`), así
      que Sequelize NO rellena `createdAt` solo. Como la columna es
      `allowNull: false`, omitirlo hacía fallar la validación DEL MODELO —antes
      de llegar a Postgres, donde la columna sí tiene DEFAULT NOW()— con
      `notNull Violation: NotificationModel.createdAt cannot be null`.

      El error caía en el catch best-effort del módulo de presupuestos: aceptar
      y cobrar funcionaban, y la notificación no se creaba NUNCA, en silencio.

      Los tests usan un Sequelize simulado que jamás corre esa validación, así
      que afirmar que el valor VIAJA es la única red posible acá.
    */
    it('manda createdAt explícito — Sequelize no lo rellena con timestamps: false', async () => {
      const row = makeRow();
      const model = makeModel({ create: jest.fn().mockResolvedValue(row) });
      const repo = new SequelizeNotificationRepository(model);

      await repo.create(
        Notification.create({
          id: NOTIF_ID,
          doctorId: DOCTOR_ID,
          type: 'quote_accepted',
          title: 'Presupuesto PRE-0001 aceptado',
          body: 'El presupuesto PRE-0001 fue aceptado.',
          entityType: 'quote',
          entityId: 'qqqqqqqq-0000-0000-0000-000000000001',
          readAt: null,
          createdAt: now,
        }),
      );

      expect(model.create).toHaveBeenCalledWith(expect.objectContaining({ createdAt: now }));
    });
  });

  describe('listForDoctor', () => {
    it('returns an array of Notifications sorted DESC', async () => {
      const rows = [makeRow({ id: 'id-1' }), makeRow({ id: 'id-2' })];
      const model = makeModel({ findAll: jest.fn().mockResolvedValue(rows) });
      const repo = new SequelizeNotificationRepository(model);

      const result = await repo.listForDoctor(DOCTOR_ID);

      expect(result).toHaveLength(2);
      expect(result[0]).toBeInstanceOf(Notification);
      expect(model.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { doctorId: DOCTOR_ID },
          order: [['createdAt', 'DESC']],
          limit: 30,
        }),
      );
    });

    it('accepts a custom limit', async () => {
      const model = makeModel({ findAll: jest.fn().mockResolvedValue([]) });
      const repo = new SequelizeNotificationRepository(model);

      await repo.listForDoctor(DOCTOR_ID, 10);

      expect(model.findAll).toHaveBeenCalledWith(expect.objectContaining({ limit: 10 }));
    });
  });

  describe('countUnreadForDoctor', () => {
    it('queries with doctorId and readAt:null', async () => {
      const model = makeModel({ count: jest.fn().mockResolvedValue(3) });
      const repo = new SequelizeNotificationRepository(model);

      const result = await repo.countUnreadForDoctor(DOCTOR_ID);

      expect(result).toBe(3);
      expect(model.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: { doctorId: DOCTOR_ID, readAt: null } }),
      );
    });
  });

  describe('findByIdForDoctor', () => {
    it('returns null when not found', async () => {
      const model = makeModel({ findOne: jest.fn().mockResolvedValue(null) });
      const repo = new SequelizeNotificationRepository(model);

      const result = await repo.findByIdForDoctor(NOTIF_ID, OTHER_DOCTOR_ID);

      expect(result).toBeNull();
    });

    it('scopes the query to both id and doctorId (anti-IDOR)', async () => {
      const row = makeRow();
      const model = makeModel({ findOne: jest.fn().mockResolvedValue(row) });
      const repo = new SequelizeNotificationRepository(model);

      await repo.findByIdForDoctor(NOTIF_ID, DOCTOR_ID);

      expect(model.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: NOTIF_ID, doctorId: DOCTOR_ID } }),
      );
    });
  });

  describe('markAsRead', () => {
    it('returns true when a row was updated', async () => {
      const model = makeModel({ update: jest.fn().mockResolvedValue([1]) });
      const repo = new SequelizeNotificationRepository(model);

      const result = await repo.markAsRead(NOTIF_ID, DOCTOR_ID, now);

      expect(result).toBe(true);
    });

    it('returns false when no rows were updated (wrong doctor or already read)', async () => {
      const model = makeModel({ update: jest.fn().mockResolvedValue([0]) });
      const repo = new SequelizeNotificationRepository(model);

      const result = await repo.markAsRead(NOTIF_ID, OTHER_DOCTOR_ID, now);

      expect(result).toBe(false);
    });

    it('includes readAt:null in the WHERE to prevent double-writes', async () => {
      const model = makeModel({ update: jest.fn().mockResolvedValue([1]) });
      const repo = new SequelizeNotificationRepository(model);

      await repo.markAsRead(NOTIF_ID, DOCTOR_ID, now);

      expect(model.update).toHaveBeenCalledWith(
        expect.objectContaining({ readAt: now }),
        expect.objectContaining({ where: { id: NOTIF_ID, doctorId: DOCTOR_ID, readAt: null } }),
      );
    });
  });

  describe('markAllAsRead', () => {
    it('returns the count of updated rows', async () => {
      const model = makeModel({ update: jest.fn().mockResolvedValue([7]) });
      const repo = new SequelizeNotificationRepository(model);

      const result = await repo.markAllAsRead(DOCTOR_ID, now);

      expect(result).toBe(7);
    });

    it('scopes the update to the doctorId only', async () => {
      const model = makeModel({ update: jest.fn().mockResolvedValue([0]) });
      const repo = new SequelizeNotificationRepository(model);

      await repo.markAllAsRead(DOCTOR_ID, now);

      expect(model.update).toHaveBeenCalledWith(
        expect.objectContaining({ readAt: now }),
        expect.objectContaining({ where: { doctorId: DOCTOR_ID, readAt: null } }),
      );
    });
  });
});
