import { Notification, type NotificationParams } from './notification.entity';

const now = new Date('2026-09-22T10:00:00Z');
const DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000001';
const OTHER_DOCTOR_ID = 'dddddddd-0000-0000-0000-000000000002';
const NOTIF_ID = 'nnnnnnnn-0000-0000-0000-000000000001';
const QUOTE_ID = 'qqqqqqqq-0000-0000-0000-000000000001';

function makeParams(overrides: Partial<NotificationParams> = {}): NotificationParams {
  return {
    id: NOTIF_ID,
    doctorId: DOCTOR_ID,
    type: 'quote_accepted',
    title: 'Presupuesto PRE-0001 aceptado',
    body: 'El presupuesto PRE-0001 fue aceptado.',
    entityType: 'quote',
    entityId: QUOTE_ID,
    readAt: null,
    createdAt: now,
    ...overrides,
  };
}

describe('Notification entity', () => {
  describe('creation', () => {
    it('creates a notification with the supplied params', () => {
      const n = Notification.create(makeParams());

      expect(n.id).toBe(NOTIF_ID);
      expect(n.doctorId).toBe(DOCTOR_ID);
      expect(n.type).toBe('quote_accepted');
      expect(n.title).toBe('Presupuesto PRE-0001 aceptado');
      expect(n.body).toBe('El presupuesto PRE-0001 fue aceptado.');
      expect(n.entityType).toBe('quote');
      expect(n.entityId).toBe(QUOTE_ID);
      expect(n.readAt).toBeNull();
      expect(n.createdAt).toEqual(now);
    });

    it('defaults null for optional fields when absent', () => {
      const n = Notification.create(makeParams({ entityType: null, entityId: null, readAt: null }));

      expect(n.entityType).toBeNull();
      expect(n.entityId).toBeNull();
      expect(n.readAt).toBeNull();
    });
  });

  describe('isRead', () => {
    it('returns false when readAt is null', () => {
      const n = Notification.create(makeParams({ readAt: null }));
      expect(n.isRead).toBe(false);
    });

    it('returns true when readAt is set', () => {
      const n = Notification.create(makeParams({ readAt: now }));
      expect(n.isRead).toBe(true);
    });
  });

  describe('isOwnedBy', () => {
    it('returns true for the owning doctor', () => {
      const n = Notification.create(makeParams());
      expect(n.isOwnedBy(DOCTOR_ID)).toBe(true);
    });

    it('returns false for a different doctor', () => {
      const n = Notification.create(makeParams());
      expect(n.isOwnedBy(OTHER_DOCTOR_ID)).toBe(false);
    });
  });

  describe('markRead', () => {
    it('returns a new instance with readAt set (immutable)', () => {
      const original = Notification.create(makeParams({ readAt: null }));
      const readAt = new Date('2026-09-22T12:00:00Z');

      const marked = original.markRead(readAt);

      // New instance
      expect(marked).not.toBe(original);
      expect(marked.readAt).toEqual(readAt);
      expect(marked.isRead).toBe(true);
      // Original is unmodified
      expect(original.readAt).toBeNull();
      expect(original.isRead).toBe(false);
    });

    it('is idempotent — preserves the original readAt if already read', () => {
      const originalReadAt = new Date('2026-09-22T11:00:00Z');
      const alreadyRead = Notification.create(makeParams({ readAt: originalReadAt }));
      const laterDate = new Date('2026-09-22T12:00:00Z');

      const result = alreadyRead.markRead(laterDate);

      // Same instance returned (idempotent)
      expect(result).toBe(alreadyRead);
      expect(result.readAt).toEqual(originalReadAt);
    });

    it('preserves all other fields when marking read', () => {
      const original = Notification.create(makeParams());
      const marked = original.markRead(now);

      expect(marked.id).toBe(original.id);
      expect(marked.doctorId).toBe(original.doctorId);
      expect(marked.type).toBe(original.type);
      expect(marked.title).toBe(original.title);
      expect(marked.body).toBe(original.body);
      expect(marked.entityType).toBe(original.entityType);
      expect(marked.entityId).toBe(original.entityId);
      expect(marked.createdAt).toEqual(original.createdAt);
    });
  });
});
