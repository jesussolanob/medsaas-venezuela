import { SubscriptionInfo } from './subscription-info.vo';

/** Helper: returns a Date N days from now. */
function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

describe('SubscriptionInfo value object', () => {
  describe('bannerLevel', () => {
    it('returns none when expiry is far (30 days)', () => {
      const info = SubscriptionInfo.create({
        status: 'active',
        plan: 'professional',
        expiresAt: daysFromNow(30),
      });

      expect(info.bannerLevel).toBe('none');
    });

    it('returns warning when 5 days to expiry', () => {
      const info = SubscriptionInfo.create({
        status: 'active',
        plan: 'basic',
        expiresAt: daysFromNow(5),
      });

      expect(info.bannerLevel).toBe('warning');
    });

    it('returns warning when exactly 7 days to expiry', () => {
      const info = SubscriptionInfo.create({
        status: 'active',
        plan: 'basic',
        expiresAt: daysFromNow(7),
      });

      expect(info.bannerLevel).toBe('warning');
    });

    it('returns critical when 2 days to expiry', () => {
      const info = SubscriptionInfo.create({
        status: 'active',
        plan: 'basic',
        expiresAt: daysFromNow(2),
      });

      expect(info.bannerLevel).toBe('critical');
    });

    it('returns critical when exactly 3 days to expiry', () => {
      const info = SubscriptionInfo.create({
        status: 'active',
        plan: 'basic',
        expiresAt: daysFromNow(3),
      });

      expect(info.bannerLevel).toBe('critical');
    });

    it('returns suspended when status is suspended', () => {
      const info = SubscriptionInfo.create({
        status: 'suspended',
        plan: 'basic',
        expiresAt: daysFromNow(30),
      });

      expect(info.bannerLevel).toBe('suspended');
    });

    it('returns suspended even when expiry is far away (status wins)', () => {
      const info = SubscriptionInfo.create({
        status: 'suspended',
        plan: 'professional',
        expiresAt: daysFromNow(60),
      });

      expect(info.bannerLevel).toBe('suspended');
    });

    it('returns none when expiresAt is null', () => {
      const info = SubscriptionInfo.create({
        status: 'active',
        plan: 'trial',
        expiresAt: null,
      });

      expect(info.bannerLevel).toBe('none');
    });

    it('returns critical when subscription is already expired (0 days)', () => {
      const info = SubscriptionInfo.create({
        status: 'past_due',
        plan: 'basic',
        expiresAt: new Date(Date.now() - 1000), // 1 second ago
      });

      expect(info.bannerLevel).toBe('critical');
    });
  });

  describe('daysUntilExpiry', () => {
    it('returns null when expiresAt is null', () => {
      const info = SubscriptionInfo.create({
        status: 'trial',
        plan: 'trial',
        expiresAt: null,
      });

      expect(info.daysUntilExpiry).toBeNull();
    });

    it('returns 0 when subscription is already expired', () => {
      const info = SubscriptionInfo.create({
        status: 'past_due',
        plan: 'basic',
        expiresAt: new Date(Date.now() - 86400000), // yesterday
      });

      expect(info.daysUntilExpiry).toBe(0);
    });

    it('returns approximately correct days when expiry is set', () => {
      const info = SubscriptionInfo.create({
        status: 'active',
        plan: 'professional',
        expiresAt: daysFromNow(10),
      });

      // Allow ±1 for clock skew during test execution
      expect(info.daysUntilExpiry).toBeGreaterThanOrEqual(9);
      expect(info.daysUntilExpiry).toBeLessThanOrEqual(11);
    });
  });
});
