import { Promotion } from './promotion.entity';
import { InvalidPromotionError } from '../errors/invalid-promotion.error';

const now = new Date('2026-06-04T00:00:00Z');

function makePromotion(
  overrides: Partial<ConstructorParameters<typeof Promotion>[0]> = {},
): Promotion {
  return Promotion.create({
    id: 'pppppppp-0000-0000-0000-000000000001',
    planKey: 'basic',
    durationMonths: 3,
    originalPriceUsd: 100,
    promoPriceUsd: 75,
    label: 'Oferta 3 meses',
    isActive: true,
    endsAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

describe('Promotion entity', () => {
  describe('static create', () => {
    it('creates a Promotion when all invariants pass', () => {
      const promo = makePromotion();
      expect(promo).toBeInstanceOf(Promotion);
      expect(promo.planKey).toBe('basic');
      expect(promo.durationMonths).toBe(3);
      expect(promo.originalPriceUsd).toBe(100);
      expect(promo.promoPriceUsd).toBe(75);
    });

    it('throws InvalidPromotionError when promo_price >= original_price', () => {
      expect(() => makePromotion({ promoPriceUsd: 100, originalPriceUsd: 100 })).toThrow(
        InvalidPromotionError,
      );
    });

    it('throws InvalidPromotionError when promo_price > original_price', () => {
      expect(() => makePromotion({ promoPriceUsd: 120, originalPriceUsd: 100 })).toThrow(
        InvalidPromotionError,
      );
    });

    it('throws InvalidPromotionError when duration_months is 0', () => {
      expect(() => makePromotion({ durationMonths: 0 })).toThrow(InvalidPromotionError);
    });

    it('throws InvalidPromotionError when duration_months is negative', () => {
      expect(() => makePromotion({ durationMonths: -1 })).toThrow(InvalidPromotionError);
    });

    it('accepts duration_months of 1', () => {
      expect(() => makePromotion({ durationMonths: 1 })).not.toThrow();
    });

    it('accepts promo_price just below original_price', () => {
      expect(() => makePromotion({ promoPriceUsd: 99.99, originalPriceUsd: 100 })).not.toThrow();
    });
  });

  describe('validateInvariants', () => {
    it('throws with message about promo price when promo >= original', () => {
      let error: unknown;
      try {
        Promotion.validateInvariants(100, 100, 3);
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(InvalidPromotionError);
      expect((error as InvalidPromotionError).message).toContain('promo_price_usd');
    });

    it('throws with message about duration when duration < 1', () => {
      let error: unknown;
      try {
        Promotion.validateInvariants(75, 100, 0);
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(InvalidPromotionError);
      expect((error as InvalidPromotionError).message).toContain('duration_months');
    });
  });

  describe('withUpdates', () => {
    it('returns a new Promotion with updated fields (immutable)', () => {
      const promo = makePromotion({ isActive: true });
      const updated = promo.withUpdates({ isActive: false });

      expect(updated.isActive).toBe(false);
      expect(promo.isActive).toBe(true); // original unchanged
    });

    it('preserves unchanged fields', () => {
      const promo = makePromotion();
      const updated = promo.withUpdates({ label: 'Nueva etiqueta' });

      expect(updated.label).toBe('Nueva etiqueta');
      expect(updated.planKey).toBe(promo.planKey);
      expect(updated.originalPriceUsd).toBe(promo.originalPriceUsd);
    });

    it('throws InvalidPromotionError when update makes promo >= original', () => {
      const promo = makePromotion({ promoPriceUsd: 75, originalPriceUsd: 100 });
      expect(() => promo.withUpdates({ promoPriceUsd: 100 })).toThrow(InvalidPromotionError);
    });

    it('throws InvalidPromotionError when update sets duration_months to 0', () => {
      const promo = makePromotion();
      expect(() => promo.withUpdates({ durationMonths: 0 })).toThrow(InvalidPromotionError);
    });

    it('updates updatedAt', () => {
      const promo = makePromotion({ updatedAt: new Date('2026-01-01T00:00:00Z') });
      const before = Date.now();
      const updated = promo.withUpdates({ label: 'X' });
      const after = Date.now();

      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(updated.updatedAt.getTime()).toBeLessThanOrEqual(after);
    });

    it('keeps createdAt unchanged', () => {
      const promo = makePromotion();
      const updated = promo.withUpdates({ label: 'X' });
      expect(updated.createdAt).toEqual(promo.createdAt);
    });

    it('updates endsAt when provided', () => {
      const promo = makePromotion({ endsAt: null });
      const ends = new Date('2026-12-31T00:00:00Z');
      const updated = promo.withUpdates({ endsAt: ends });
      expect(updated.endsAt).toEqual(ends);
    });

    it('sets endsAt to null when explicitly set to null', () => {
      const promo = makePromotion({ endsAt: new Date('2026-12-31T00:00:00Z') });
      const updated = promo.withUpdates({ endsAt: null });
      expect(updated.endsAt).toBeNull();
    });
  });

  describe('asParams', () => {
    it('returns params with all properties', () => {
      const promo = makePromotion();
      const params = promo.asParams();
      expect(params.id).toBe(promo.id);
      expect(params.planKey).toBe(promo.planKey);
      expect(params.promoPriceUsd).toBe(promo.promoPriceUsd);
    });
  });

  describe('constructor defaults', () => {
    it('stores provided optional fields', () => {
      const ends = new Date('2026-12-31T00:00:00Z');
      const promo = makePromotion({ endsAt: ends, label: 'Especial' });
      expect(promo.endsAt).toEqual(ends);
      expect(promo.label).toBe('Especial');
    });

    it('stores null when endsAt is null', () => {
      const promo = makePromotion({ endsAt: null });
      expect(promo.endsAt).toBeNull();
    });

    it('stores null label', () => {
      const promo = makePromotion({ label: null });
      expect(promo.label).toBeNull();
    });
  });
});
