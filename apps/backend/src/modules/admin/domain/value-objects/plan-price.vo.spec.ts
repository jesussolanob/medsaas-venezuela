import { PlanPrice } from './plan-price.vo';

describe('PlanPrice', () => {
  it('constructs with all fields', () => {
    const pp = new PlanPrice('uuid-1', 'delta_base', 'monthly', 10, true);
    expect(pp.id).toBe('uuid-1');
    expect(pp.planKey).toBe('delta_base');
    expect(pp.period).toBe('monthly');
    expect(pp.priceUsd).toBe(10);
    expect(pp.isActive).toBe(true);
  });

  it('supports all billing periods', () => {
    const periods = ['monthly', 'quarterly', 'semiannual', 'annual'] as const;
    for (const period of periods) {
      const pp = new PlanPrice('id', 'delta_plus', period, 20, true);
      expect(pp.period).toBe(period);
    }
  });

  it('allows inactive price entry', () => {
    const pp = new PlanPrice('uuid-2', 'delta_base', 'annual', 96, false);
    expect(pp.isActive).toBe(false);
  });
});
