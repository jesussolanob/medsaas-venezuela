import { PricingPlan } from './pricing-plan.entity';

const BASE_PARAMS = {
  id: 'plan-uuid',
  doctorId: 'doctor-uuid',
  officeId: null,
  name: 'Consulta General',
  priceUsd: 50,
  durationMinutes: 30,
  sessionsCount: 1,
  description: null,
  type: 'plan' as const,
  showInBooking: true,
  isActive: true,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

describe('PricingPlan', () => {
  describe('isPubliclyVisible()', () => {
    it('returns true when active and show_in_booking is true', () => {
      const plan = PricingPlan.create(BASE_PARAMS);
      expect(plan.isPubliclyVisible()).toBe(true);
    });

    it('returns false when isActive is false', () => {
      const plan = PricingPlan.create({ ...BASE_PARAMS, isActive: false });
      expect(plan.isPubliclyVisible()).toBe(false);
    });

    it('returns false when showInBooking is false', () => {
      const plan = PricingPlan.create({ ...BASE_PARAMS, showInBooking: false });
      expect(plan.isPubliclyVisible()).toBe(false);
    });
  });

  describe('isApplicableForOffice()', () => {
    it('returns true for general plan (officeId=null) regardless of requested office', () => {
      const plan = PricingPlan.create({ ...BASE_PARAMS, officeId: null });
      expect(plan.isApplicableForOffice('any-office-uuid')).toBe(true);
    });

    it('returns true when officeId matches the requested office', () => {
      const plan = PricingPlan.create({ ...BASE_PARAMS, officeId: 'office-abc' });
      expect(plan.isApplicableForOffice('office-abc')).toBe(true);
    });

    it('returns false when officeId does not match the requested office', () => {
      const plan = PricingPlan.create({ ...BASE_PARAMS, officeId: 'office-abc' });
      expect(plan.isApplicableForOffice('office-xyz')).toBe(false);
    });
  });

  describe('officeId property', () => {
    it('stores null for a general plan', () => {
      const plan = PricingPlan.create({ ...BASE_PARAMS, officeId: null });
      expect(plan.officeId).toBeNull();
    });

    it('stores the provided officeId for an office-specific plan', () => {
      const plan = PricingPlan.create({ ...BASE_PARAMS, officeId: 'office-uuid-1' });
      expect(plan.officeId).toBe('office-uuid-1');
    });
  });

  describe('create() factory', () => {
    it('creates a PricingPlan with all required properties', () => {
      const plan = PricingPlan.create(BASE_PARAMS);
      expect(plan.id).toBe('plan-uuid');
      expect(plan.doctorId).toBe('doctor-uuid');
      expect(plan.name).toBe('Consulta General');
      expect(plan.priceUsd).toBe(50);
      expect(plan.type).toBe('plan');
    });
  });
});
