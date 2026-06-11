import { AvailabilityBlock } from './availability-block.entity';

const BASE_DOCTOR_ID = 'doctor-uuid-1';

function makeBlock(
  overrides: Partial<{
    doctorId: string;
    startsAt: Date;
    endsAt: Date;
    reason: string | null;
  }> = {},
): AvailabilityBlock {
  return AvailabilityBlock.create({
    id: 'block-001',
    doctorId: overrides.doctorId ?? BASE_DOCTOR_ID,
    startsAt: overrides.startsAt ?? new Date('2026-06-15T13:00:00.000Z'),
    endsAt: overrides.endsAt ?? new Date('2026-06-15T16:00:00.000Z'),
    reason: overrides.reason ?? null,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
  });
}

describe('AvailabilityBlock entity', () => {
  describe('create()', () => {
    it('creates a block with the provided props', () => {
      const block = makeBlock({ reason: 'Vacation' });
      expect(block.id).toBe('block-001');
      expect(block.doctorId).toBe(BASE_DOCTOR_ID);
      expect(block.reason).toBe('Vacation');
    });

    it('stores null reason when not provided', () => {
      const block = makeBlock({ reason: null });
      expect(block.reason).toBeNull();
    });
  });

  describe('overlapsSlot()', () => {
    it('returns true when slot time falls within the block', () => {
      const block = makeBlock({
        startsAt: new Date('2026-06-15T13:00:00.000Z'),
        endsAt: new Date('2026-06-15T16:00:00.000Z'),
      });
      const slotTime = new Date('2026-06-15T14:00:00.000Z');
      expect(block.overlapsSlot(slotTime)).toBe(true);
    });

    it('returns true when slot time equals starts_at (inclusive start)', () => {
      const block = makeBlock({
        startsAt: new Date('2026-06-15T13:00:00.000Z'),
        endsAt: new Date('2026-06-15T16:00:00.000Z'),
      });
      const slotTime = new Date('2026-06-15T13:00:00.000Z');
      expect(block.overlapsSlot(slotTime)).toBe(true);
    });

    it('returns false when slot time equals ends_at (exclusive end)', () => {
      const block = makeBlock({
        startsAt: new Date('2026-06-15T13:00:00.000Z'),
        endsAt: new Date('2026-06-15T16:00:00.000Z'),
      });
      const slotTime = new Date('2026-06-15T16:00:00.000Z');
      expect(block.overlapsSlot(slotTime)).toBe(false);
    });

    it('returns false when slot time is before the block', () => {
      const block = makeBlock({
        startsAt: new Date('2026-06-15T13:00:00.000Z'),
        endsAt: new Date('2026-06-15T16:00:00.000Z'),
      });
      const slotTime = new Date('2026-06-15T12:00:00.000Z');
      expect(block.overlapsSlot(slotTime)).toBe(false);
    });

    it('returns false when slot time is after the block', () => {
      const block = makeBlock({
        startsAt: new Date('2026-06-15T13:00:00.000Z'),
        endsAt: new Date('2026-06-15T16:00:00.000Z'),
      });
      const slotTime = new Date('2026-06-15T17:00:00.000Z');
      expect(block.overlapsSlot(slotTime)).toBe(false);
    });
  });

  describe('overlapsRange()', () => {
    it('returns true when block is fully inside range', () => {
      const block = makeBlock({
        startsAt: new Date('2026-06-15T10:00:00.000Z'),
        endsAt: new Date('2026-06-15T12:00:00.000Z'),
      });
      expect(
        block.overlapsRange(
          new Date('2026-06-15T00:00:00.000Z'),
          new Date('2026-06-15T23:59:59.999Z'),
        ),
      ).toBe(true);
    });

    it('returns true when block partially overlaps range at start', () => {
      const block = makeBlock({
        startsAt: new Date('2026-06-14T22:00:00.000Z'),
        endsAt: new Date('2026-06-15T02:00:00.000Z'),
      });
      expect(
        block.overlapsRange(
          new Date('2026-06-15T00:00:00.000Z'),
          new Date('2026-06-15T23:59:59.999Z'),
        ),
      ).toBe(true);
    });

    it('returns false when block is entirely before range', () => {
      const block = makeBlock({
        startsAt: new Date('2026-06-14T10:00:00.000Z'),
        endsAt: new Date('2026-06-14T16:00:00.000Z'),
      });
      expect(
        block.overlapsRange(
          new Date('2026-06-15T00:00:00.000Z'),
          new Date('2026-06-15T23:59:59.999Z'),
        ),
      ).toBe(false);
    });

    it('returns false when block is entirely after range', () => {
      const block = makeBlock({
        startsAt: new Date('2026-06-16T10:00:00.000Z'),
        endsAt: new Date('2026-06-16T16:00:00.000Z'),
      });
      expect(
        block.overlapsRange(
          new Date('2026-06-15T00:00:00.000Z'),
          new Date('2026-06-15T23:59:59.999Z'),
        ),
      ).toBe(false);
    });
  });

  describe('isFullDay()', () => {
    it('returns true for a block from 00:00 to 23:59:59 UTC', () => {
      const block = makeBlock({
        startsAt: new Date('2026-06-15T00:00:00.000Z'),
        endsAt: new Date('2026-06-15T23:59:59.000Z'),
      });
      expect(block.isFullDay()).toBe(true);
    });

    it('returns false for a partial-day block', () => {
      const block = makeBlock({
        startsAt: new Date('2026-06-15T13:00:00.000Z'),
        endsAt: new Date('2026-06-15T16:00:00.000Z'),
      });
      expect(block.isFullDay()).toBe(false);
    });
  });

  describe('isOwnedBy()', () => {
    it('returns true when actorId matches doctorId', () => {
      const block = makeBlock({ doctorId: BASE_DOCTOR_ID });
      expect(block.isOwnedBy(BASE_DOCTOR_ID)).toBe(true);
    });

    it('returns false when actorId does not match', () => {
      const block = makeBlock({ doctorId: BASE_DOCTOR_ID });
      expect(block.isOwnedBy('other-doctor')).toBe(false);
    });
  });
});
