import { CapabilityDeniedError } from './capability-denied.error';
import { DomainError } from '../../../../domain/errors/domain.error';

describe('CapabilityDeniedError', () => {
  it('extends DomainError', () => {
    const error = new CapabilityDeniedError('finances', 'delete');
    expect(error).toBeInstanceOf(DomainError);
    expect(error).toBeInstanceOf(Error);
  });

  it('has correct code', () => {
    const error = new CapabilityDeniedError('finances', 'delete');
    expect(error.code).toBe('CAPABILITY_DENIED');
  });

  it('has http status 403', () => {
    const error = new CapabilityDeniedError('finances', 'delete');
    expect(error.httpStatus).toBe(403);
  });

  it('includes moduleKey and action in message', () => {
    const error = new CapabilityDeniedError('billing', 'create');
    expect(error.message).toContain('billing');
    expect(error.message).toContain('create');
  });
});
