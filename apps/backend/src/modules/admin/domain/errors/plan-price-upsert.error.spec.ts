import { PlanPriceUpsertError } from './plan-price-upsert.error';
import { DomainError } from '../../../../domain/errors/domain.error';

describe('PlanPriceUpsertError', () => {
  it('extends DomainError', () => {
    const err = new PlanPriceUpsertError('delta_base', 'monthly');
    expect(err).toBeInstanceOf(DomainError);
  });

  it('has code PLAN_PRICE_UPSERT_FAILED', () => {
    const err = new PlanPriceUpsertError('delta_plus', 'annual');
    expect(err.code).toBe('PLAN_PRICE_UPSERT_FAILED');
  });

  it('has httpStatus 500', () => {
    const err = new PlanPriceUpsertError('delta_base', 'quarterly');
    expect(err.httpStatus).toBe(500);
  });

  it('includes planKey and period in message', () => {
    const err = new PlanPriceUpsertError('delta_base', 'monthly');
    expect(err.message).toContain('delta_base');
    expect(err.message).toContain('monthly');
  });

  it('has correct name', () => {
    const err = new PlanPriceUpsertError('delta_plus', 'annual');
    expect(err.name).toBe('PlanPriceUpsertError');
  });
});
