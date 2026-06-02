import { PlanConfig } from './plan-config.vo';

describe('PlanConfig', () => {
  it('constructs with all fields', () => {
    const config = new PlanConfig('basic', 'Basic Plan', 10, 0, true, 'Entry level', 1);

    expect(config.planKey).toBe('basic');
    expect(config.name).toBe('Basic Plan');
    expect(config.priceUsd).toBe(10);
    expect(config.trialDays).toBe(0);
    expect(config.isActive).toBe(true);
    expect(config.description).toBe('Entry level');
    expect(config.sortOrder).toBe(1);
  });

  it('isAvailable returns true when isActive is true', () => {
    const config = new PlanConfig('basic', 'Basic', 10, 0, true, null, 1);
    expect(config.isAvailable()).toBe(true);
  });

  it('isAvailable returns false when isActive is false', () => {
    const config = new PlanConfig('enterprise', 'Enterprise', 200, 0, false, null, 99);
    expect(config.isAvailable()).toBe(false);
  });

  it('allows null description', () => {
    const config = new PlanConfig('trial', 'Trial', 0, 14, true, null, 0);
    expect(config.description).toBeNull();
  });
});
